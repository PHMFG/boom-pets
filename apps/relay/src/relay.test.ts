import { CLOSE, PROTOCOL_VERSION, WS_PATH, type ToHost, type ToPhone } from '@boom/protocol';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startRelay, type Relay } from './relay';

/** A test socket that remembers what it received and lets a test wait for a specific message. */
class Client<Message extends { t: string }> {
  readonly socket: WebSocket;
  readonly received: Message[] = [];
  closeCode: number | null = null;
  private waiters: (() => void)[] = [];

  constructor(port: number, origin?: string, userAgent?: string) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`, { ...(origin ? { origin } : {}), ...(userAgent ? { headers: { 'user-agent': userAgent } } : {}) });
    this.socket.on('message', data => {
      this.received.push(JSON.parse(String(data)) as Message);
      this.wake();
    });
    this.socket.on('close', code => {
      this.closeCode = code;
      this.wake();
    });
  }

  private wake() {
    this.waiters.splice(0).forEach(waiter => waiter());
  }

  opened(): Promise<void> {
    return new Promise(resolve => this.socket.once('open', () => resolve()));
  }

  send(message: unknown): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** Resolves with the first message of this type not yet consumed. */
  async next<Type extends Message['t']>(type: Type): Promise<Extract<Message, { t: Type }>> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const index = this.received.findIndex(message => message.t === type);
      if (index >= 0) return this.received.splice(index, 1)[0] as Extract<Message, { t: Type }>;
      if (Date.now() > deadline) throw new Error(`No "${type}" message arrived. Got: ${JSON.stringify(this.received)}`);
      await new Promise<void>(resolve => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }

  async closed(): Promise<number> {
    const deadline = Date.now() + 2000;
    while (this.closeCode === null) {
      if (Date.now() > deadline) throw new Error('Socket did not close');
      await new Promise<void>(resolve => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
    return this.closeCode;
  }
}

const LOCAL = 'http://localhost:5173';
let relay: Relay;

/** Pass null for a client that sends no Origin header at all. */
async function host(origin: string | null = LOCAL) {
  const client = new Client<ToHost>(relay.port, origin ?? undefined);
  await client.opened();
  client.send({ t: 'hello', role: 'host', v: PROTOCOL_VERSION });
  return client;
}

async function phone(name: string, token = '', room = relay.room) {
  const client = new Client<ToPhone>(relay.port, 'http://192.168.0.10:5173');
  await client.opened();
  client.send({ t: 'hello', role: 'phone', v: PROTOCOL_VERSION, room, name, token });
  return client;
}

let logs: string;

beforeEach(async () => {
  logs = await mkdtemp(join(tmpdir(), 'boom-playtests-'));
  relay = await startRelay({ port: 0, host: '127.0.0.1', logDirectory: logs, readNetwork: async () => ({ address: '192.168.0.2', ssid: 'Casa' }) });
});
afterEach(async () => {
  await relay.close();
  await rm(logs, { recursive: true, force: true });
});

describe('relay', () => {
  it('tells the host its room and network', async () => {
    const screen = await host();
    expect(await screen.next('hosted')).toEqual({ t: 'hosted', room: relay.room, seats: [], network: { address: '192.168.0.2', ssid: 'Casa' } });
  });

  it('refuses a host page that was not opened on this computer', async () => {
    for (const origin of ['http://192.168.0.10:5173', null]) {
      const screen = await host(origin);
      expect(await screen.next('refused')).toEqual({ t: 'refused', reason: 'notLocal' });
      expect(await screen.closed()).toBe(CLOSE.refused);
    }
  });

  it('seats a phone and forwards its input and buttons to the host', async () => {
    const screen = await host();
    await screen.next('hosted');
    const ana = await phone('Ana');
    expect(await ana.next('welcome')).toMatchObject({ seat: 0, hostPresent: true });
    expect((await screen.next('roster')).seats).toMatchObject([{ seat: 0, name: 'Ana', connected: true }]);

    ana.send({ t: 'input', seq: 1, x: 0.5, y: -1, held: 1 });
    expect(await screen.next('input')).toEqual({ t: 'input', seat: 0, seq: 1, x: 0.5, y: -1, held: 1 });
    ana.send({ t: 'button', button: 'a', down: true });
    expect(await screen.next('button')).toEqual({ t: 'button', seat: 0, button: 'a', down: true });
  });

  it('drops malformed messages without disconnecting the phone', async () => {
    const screen = await host();
    await screen.next('hosted');
    const ana = await phone('Ana');
    await ana.next('welcome');
    ana.send('not json');
    ana.send({ t: 'input', seq: 1, x: 9, y: 0, held: 0 });
    ana.send({ t: 'explode' });
    ana.send({ t: 'input', seq: 2, x: 0, y: 0, held: 0 });
    expect(await screen.next('input')).toMatchObject({ seq: 2 });
  });

  it('answers pings and reports the round trip to the host', async () => {
    const screen = await host();
    await screen.next('hosted');
    const ana = await phone('Ana');
    await ana.next('welcome');
    await screen.next('roster');
    ana.send({ t: 'ping', id: 7, rtt: 23 });
    expect(await ana.next('pong')).toEqual({ t: 'pong', id: 7 });
    expect((await screen.next('roster')).seats[0]).toMatchObject({ rtt: 23 });
  });

  it('holds the seat of a dropped phone and returns it for the same token', async () => {
    const screen = await host();
    await screen.next('hosted');
    const ana = await phone('Ana');
    const { token } = await ana.next('welcome');
    await screen.next('roster');

    ana.socket.close();
    const held = (await screen.next('roster')).seats[0];
    expect(held).toMatchObject({ seat: 0, connected: false });
    expect(held?.holdMsLeft).toBeGreaterThan(0);

    const back = await phone('Ana', token);
    expect(await back.next('welcome')).toMatchObject({ seat: 0, token });
    expect((await screen.next('roster')).seats).toMatchObject([{ seat: 0, connected: true, holdMsLeft: null }]);
  });

  it('lets the newest socket for a token win', async () => {
    const first = await phone('Ana');
    const { token } = await first.next('welcome');
    const second = await phone('Ana', token);
    expect(await second.next('welcome')).toMatchObject({ seat: 0 });
    expect(await first.closed()).toBe(CLOSE.replaced);

    // The replaced socket closing must not free the seat its replacement now holds.
    const screen = await host();
    expect((await screen.next('hosted')).seats).toMatchObject([{ seat: 0, connected: true }]);
  });

  it('refuses a wrong room code and an old page', async () => {
    const lost = await phone('Ana', '', 'ZZZZ');
    expect(await lost.next('refused')).toEqual({ t: 'refused', reason: 'room' });
    expect(await lost.closed()).toBe(CLOSE.refused);

    const stale = new Client<ToPhone>(relay.port);
    await stale.opened();
    stale.send({ t: 'hello', role: 'phone', v: PROTOCOL_VERSION + 1, room: relay.room, name: 'Ana', token: '' });
    expect(await stale.next('refused')).toEqual({ t: 'refused', reason: 'version' });
  });

  it('accepts a room code typed in lower case', async () => {
    const ana = await phone('Ana', '', relay.room.toLowerCase());
    expect(await ana.next('welcome')).toMatchObject({ seat: 0 });
  });

  it('keeps the roster across a host reload and tells phones when the host comes and goes', async () => {
    const ana = await phone('Ana');
    expect(await ana.next('welcome')).toMatchObject({ hostPresent: false });

    const screen = await host();
    expect((await screen.next('hosted')).seats).toMatchObject([{ seat: 0, name: 'Ana' }]);
    expect(await ana.next('host')).toEqual({ t: 'host', present: true });

    screen.socket.close();
    expect(await ana.next('host')).toEqual({ t: 'host', present: false });

    const reloaded = await host();
    expect((await reloaded.next('hosted')).seats).toMatchObject([{ seat: 0, name: 'Ana', connected: true }]);
  });

  it('makes a second game screen wait instead of taking the room from the first', async () => {
    const first = await host();
    await first.next('hosted');
    const second = await host();
    expect(await second.next('refused')).toEqual({ t: 'refused', reason: 'busy' });
    expect(await second.closed()).toBe(CLOSE.refused);
    // The first screen is untouched and still receives the roster.
    const ana = await phone('Ana');
    await ana.next('welcome');
    expect((await first.next('roster')).seats).toMatchObject([{ seat: 0, name: 'Ana' }]);
  });

  it('saves a playtest log from the game screen with how each phone connected', async () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
    const ana = new Client<ToPhone>(relay.port, 'http://192.168.0.10:5173', iphone);
    await ana.opened();
    ana.send({ t: 'hello', role: 'phone', v: PROTOCOL_VERSION, room: relay.room, name: 'Ana', token: '', sinceMs: 7400 });
    const { token } = await ana.next('welcome');
    const back = new Client<ToPhone>(relay.port, 'http://192.168.0.10:5173', iphone);
    await back.opened();
    back.send({ t: 'hello', role: 'phone', v: PROTOCOL_VERSION, room: relay.room, name: 'Ana', token, sinceMs: 650 });
    await back.next('welcome');

    const save = (origin: string, body: string) => fetch(`http://127.0.0.1:${relay.port}/api/playtest`, { method: 'POST', headers: { origin }, body });
    expect((await save('http://192.168.0.10:5173', '{}')).status, 'a phone may not write a log').toBe(404);
    expect((await save(LOCAL, 'not json')).status).toBe(400);
    const saved = await save(LOCAL, JSON.stringify({ rounds: 5, phones: 'made up by the page' }));
    expect(saved.status).toBe(200);
    const { file } = (await saved.json()) as { file: string };
    expect(JSON.parse(await readFile(join(logs, file), 'utf8'))).toEqual({
      rounds: 5,
      phones: [{ seat: 0, name: 'Ana', device: 'iphone', joinMs: 7400, rejoins: 1, worstRejoinMs: 650 }],
    });
  });

  it('forwards a host message to one seat or to all', async () => {
    const screen = await host();
    await screen.next('hosted');
    const ana = await phone('Ana');
    const bia = await phone('Bia');
    await ana.next('welcome');
    await bia.next('welcome');

    screen.send({ t: 'send', seat: 1, msg: { t: 'haptic', pattern: 'hit' } });
    expect(await bia.next('haptic')).toEqual({ t: 'haptic', pattern: 'hit' });
    screen.send({ t: 'send', seat: 'all', msg: { t: 'haptic', pattern: 'tap' } });
    expect(await ana.next('haptic')).toEqual({ t: 'haptic', pattern: 'tap' });
    expect(await bia.next('haptic')).toEqual({ t: 'haptic', pattern: 'tap' });
    expect(ana.received.filter(message => message.t === 'haptic')).toEqual([]);
  });
});
