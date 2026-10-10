// The game screen's connection to the relay. Phone input goes straight into the InputBuffer;
// everything slower (roster, network, connection state) goes to the HUD store.
import type { InputBuffer } from '@boom/game';
import { CLOSE, PROTOCOL_VERSION, WS_PATH, type HostHello, type HostSend, type HostToPhone, type ToHost } from '@boom/protocol';
import { hud } from '../hud/store';

/** Things a phone asks for outside of play: a different pet, ready, an emote. */
export type PhoneRequest = Extract<ToHost, { t: 'pet' | 'ready' | 'emote' }>;

const RETRY_MS = 1000;

export class HostSocket {
  /** Set by the session to receive lobby requests from phones. */
  onRequest: ((request: PhoneRequest) => void) | null = null;
  private readonly input: InputBuffer;
  private socket: WebSocket | null = null;
  private retry = 0;
  /** Set when retrying is pointless (closed on purpose, replaced by another tab, or refused). */
  private stopped = false;
  private busy = false;

  constructor(input: InputBuffer) {
    this.input = input;
    this.connect();
  }

  send(seat: number | 'all', msg: HostToPhone): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ t: 'send', seat, msg } satisfies HostSend));
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.retry);
    this.socket?.close();
  }

  private connect(): void {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${location.host}${WS_PATH}`);
    this.socket = socket;
    socket.addEventListener('open', () => socket.send(JSON.stringify({ t: 'hello', role: 'host', v: PROTOCOL_VERSION } satisfies HostHello)));
    socket.addEventListener('message', event => this.receive(JSON.parse(String(event.data)) as ToHost));
    socket.addEventListener('close', event => {
      if (this.socket !== socket) return;
      if (event.code === CLOSE.replaced) {
        this.stopped = true;
        hud.set({ connection: 'replaced' });
      }
      if (this.stopped) return;
      if (!this.busy) hud.set({ connection: 'offline' });
      this.busy = false;
      this.retry = window.setTimeout(() => this.connect(), RETRY_MS);
    });
  }

  private receive(message: ToHost): void {
    const now = performance.now();
    switch (message.t) {
      case 'input':
        this.input.setFrame(message.seat, message, now);
        break;
      case 'button':
        this.input.pushEdge(message.seat, message, now);
        break;
      case 'hosted':
        hud.set({ connection: 'online', room: message.room, network: message.network, seats: message.seats, rosterAt: now });
        break;
      case 'roster': {
        // A phone that just came back starts from a clean slate, not from the buttons it held when it dropped.
        const wasConnected = new Set(hud.get().seats.filter(seat => seat.connected).map(seat => seat.seat));
        for (const seat of message.seats) if (seat.connected && !wasConnected.has(seat.seat)) this.input.clear(seat.seat);
        hud.set({ seats: message.seats, rosterAt: now });
        break;
      }
      case 'network':
        hud.set({ network: message.network });
        break;
      case 'pet':
      case 'ready':
      case 'emote':
        this.onRequest?.(message);
        break;
      case 'refused':
        // Another screen has the room: keep trying, it may be this page's own old connection closing.
        if (message.reason === 'busy') this.busy = true;
        else this.stopped = true;
        hud.set({ connection: message.reason });
        break;
    }
  }
}
