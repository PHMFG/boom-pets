// The phone's connection to the game. It sends the stick and buttons, and keeps trying to
// get back to the same seat when the phone locks or the Wi-Fi hiccups.
import {
  BUTTON_BITS,
  CLOSE,
  INPUT_HEARTBEAT_MS,
  INPUT_MAX_HZ,
  PING_INTERVAL_MS,
  PROTOCOL_VERSION,
  WS_PATH,
  type ButtonName,
  type HapticPattern,
  type PhoneHello,
  type PhoneMessage,
  type PhoneStatus,
  type RefusalReason,
  type ToPhone,
} from '@boom/protocol';

export type LinkState =
  | { kind: 'connecting' }
  | { kind: 'online'; seat: number; hostPresent: boolean }
  /** `long` once it has been trying for a while: time to suggest checking the Wi-Fi. */
  | { kind: 'reconnecting'; long: boolean }
  | { kind: 'failed'; reason: 'unreachable' | 'replaced' | RefusalReason };

export type LinkEvents = { onState(state: LinkState): void; onHaptic(pattern: HapticPattern): void; onStatus(status: PhoneStatus): void };

const SEAT_KEY = 'boom.seat';
/** Failed attempts before a phone that never got in gives up and asks the player to retry. */
const FIRST_JOIN_ATTEMPTS = 3;
const RECONNECT_LONG_MS = 8000;

type SavedSeat = { room: string; token: string };

/** The token that proves this phone owns its seat, if it joined this room before. */
export function savedToken(room: string): string {
  try {
    const saved = JSON.parse(localStorage.getItem(SEAT_KEY) ?? 'null') as SavedSeat | null;
    return saved?.room === room ? saved.token : '';
  } catch {
    return '';
  }
}

function saveToken(seat: SavedSeat): void {
  try {
    localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
  } catch {
    // Private browsing: the seat survives a locked screen but not a page reload.
  }
}

export class PhoneLink {
  private readonly room: string;
  private readonly name: string;
  private readonly events: LinkEvents;
  private socket: WebSocket | null = null;
  private stopped = false;
  private welcomed = false;
  private seat: number | null = null;
  private failures = 0;
  private lostAt = 0;
  /** When this phone began trying to get in, on the page's clock: page open at first, then each drop or unlock. */
  private tryingSince = 0;
  private retry = 0;
  private readonly pump: number;
  private readonly pinger: number;

  private stick = { x: 0, y: 0 };
  private held = 0;
  private dirty = false;
  private seq = 0;
  private lastSent = 0;
  private pingId = 0;
  private pingSentAt = 0;
  private rtt: number | null = null;

  constructor(room: string, name: string, events: LinkEvents) {
    this.room = room;
    this.name = name;
    this.events = events;
    this.pump = window.setInterval(() => this.flush(), 1000 / INPUT_MAX_HZ);
    this.pinger = window.setInterval(() => this.ping(), PING_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.connect();
  }

  setStick(x: number, y: number): void {
    if (x === this.stick.x && y === this.stick.y) return;
    this.stick = { x, y };
    this.dirty = true;
    this.flush();
  }

  /** Sent at once, not on the next input frame, so a quick tap always reaches the game. */
  setButton(button: ButtonName, down: boolean): void {
    const bit = BUTTON_BITS[button];
    if (((this.held & bit) !== 0) === down) return;
    this.held = down ? this.held | bit : this.held & ~bit;
    this.dirty = true;
    this.send({ t: 'button', button, down });
  }

  /** Lobby and results requests: change pet, say ready, send an emote. */
  request(message: Extract<PhoneMessage, { t: 'pet' | 'ready' | 'emote' }>): void {
    this.send(message);
  }

  releaseAll(): void {
    this.setStick(0, 0);
    this.setButton('a', false);
    this.setButton('b', false);
    this.flush();
  }

  close(): void {
    this.stopped = true;
    clearInterval(this.pump);
    clearInterval(this.pinger);
    clearTimeout(this.retry);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.socket?.close();
  }

  private connect(): void {
    clearTimeout(this.retry);
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${location.host}${WS_PATH}`);
    this.socket = socket;
    socket.addEventListener('open', () => {
      const sinceMs = Math.max(0, Math.round(performance.now() - this.tryingSince));
      const hello: PhoneHello = { t: 'hello', role: 'phone', v: PROTOCOL_VERSION, room: this.room, name: this.name, token: savedToken(this.room), sinceMs };
      socket.send(JSON.stringify(hello));
    });
    socket.addEventListener('message', event => this.receive(JSON.parse(String(event.data)) as ToPhone));
    socket.addEventListener('close', event => {
      if (this.socket !== socket || this.stopped) return;
      this.socket = null;
      if (event.code === CLOSE.replaced) return this.fail('replaced');
      // `refused` already reported its reason before the socket closed.
      if (event.code === CLOSE.refused) return;

      this.failures++;
      if (!this.welcomed && this.failures >= FIRST_JOIN_ATTEMPTS) return this.fail('unreachable');
      if (this.lostAt === 0) {
        this.lostAt = Date.now();
        if (this.welcomed) this.tryingSince = performance.now();
      }
      this.events.onState(this.welcomed ? { kind: 'reconnecting', long: Date.now() - this.lostAt > RECONNECT_LONG_MS } : { kind: 'connecting' });
      this.retry = window.setTimeout(() => this.connect(), Math.min(2000, 400 * this.failures));
    });
  }

  private receive(message: ToPhone): void {
    switch (message.t) {
      case 'welcome':
        this.welcomed = true;
        this.failures = 0;
        this.lostAt = 0;
        this.dirty = true;
        this.seat = message.seat;
        saveToken({ room: this.room, token: message.token });
        this.events.onState({ kind: 'online', seat: message.seat, hostPresent: message.hostPresent });
        this.ping();
        break;
      case 'host':
        if (this.seat !== null) this.events.onState({ kind: 'online', seat: this.seat, hostPresent: message.present });
        break;
      case 'refused':
        this.fail(message.reason);
        break;
      case 'pong':
        if (message.id === this.pingId) this.rtt = performance.now() - this.pingSentAt;
        break;
      case 'haptic':
        this.events.onHaptic(message.pattern);
        break;
      case 'status':
        this.events.onStatus(message);
        break;
    }
  }

  private fail(reason: 'unreachable' | 'replaced' | RefusalReason): void {
    this.stopped = true;
    this.events.onState({ kind: 'failed', reason });
    this.close();
  }

  private send(message: PhoneMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** Sends the stick when it changed, plus a heartbeat so the game can tell a still thumb from a dead link. */
  private flush(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    const sinceLast = now - this.lastSent;
    // A change goes out at once unless the rate cap says wait; the timer then sends it a few milliseconds later.
    if (this.dirty ? sinceLast < 1000 / INPUT_MAX_HZ - 1 : sinceLast < INPUT_HEARTBEAT_MS) return;
    // The network is backed up: skip this frame and send the newest position next time, never a queue of old ones.
    if (socket.bufferedAmount > 0) return;
    this.dirty = false;
    this.lastSent = now;
    this.send({ t: 'input', seq: this.seq++, x: this.stick.x, y: this.stick.y, held: this.held });
  }

  private ping(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.pingId++;
    this.pingSentAt = performance.now();
    this.send({ t: 'ping', id: this.pingId, rtt: this.rtt === null ? null : Math.round(this.rtt) });
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) return this.releaseAll();
    if (this.stopped) return;
    // The time spent locked is not time spent trying, so the clock for this return starts here.
    if (this.welcomed && this.lostAt !== 0) this.tryingSince = performance.now();
    // Back from a locked screen: reconnect now instead of waiting out the retry delay.
    if (this.socket === null) this.connect();
  };
}
