// Passes messages between the phones and the game screen, and keeps the roster of who sits where.
// It never simulates anything: the host owns the game.
import {
  CLOSE,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGES_PER_SECOND,
  PROTOCOL_VERSION,
  WS_PATH,
  type NetworkInfo,
  type PhoneHello,
  type ToHost,
  type ToPhone,
} from '@boom/protocol';
import { hostHelloSchema, hostMessageSchema, phoneHelloSchema, phoneMessageSchema } from '@boom/protocol/schemas';
import { summariseMatch } from '@boom/stats';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { readNetwork } from './network';
import { deviceOf, makeRoomCode, Room } from './room';

export type RelayOptions = {
  port: number;
  host: string;
  /** Folder for playtest logs. Without it, logs are not accepted. */
  logDirectory?: string;
  /** Replaceable so tests do not depend on the machine's network. */
  readNetwork?: () => Promise<NetworkInfo>;
};
export type Relay = { port: number; room: string; close(): Promise<void> };

const HELLO_TIMEOUT_MS = 5000;
const LIVENESS_MS = 5000;
const NETWORK_POLL_MS = 2000;
/** Above this backlog the receiver is stalled, so stale messages are dropped instead of queued. */
const HOST_BACKLOG_BYTES = 256 * 1024;
const PHONE_BACKLOG_BYTES = 64 * 1024;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_LOG_BYTES = 2 * 1024 * 1024;

function parse(data: RawData): unknown {
  try {
    return JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : '');
  } catch {
    return undefined;
  }
}

/** Only a page opened on this computer may be the game screen. */
function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export async function startRelay(options: RelayOptions): Promise<Relay> {
  const pollNetwork = options.readNetwork ?? readNetwork;
  const room = new Room(makeRoomCode(), randomUUID);
  const phones = new Map<number, WebSocket>();
  const alive = new WeakSet<WebSocket>();
  let host: WebSocket | null = null;
  let network = await pollNetwork();
  let rosterDirty = false;

  const sendHost = (message: ToHost) => {
    if (host?.readyState === WebSocket.OPEN) host.send(JSON.stringify(message));
  };
  const sendPhone = (socket: WebSocket, message: ToPhone) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const broadcastRoster = () => {
    rosterDirty = false;
    sendHost({ t: 'roster', seats: room.snapshot(Date.now()) });
  };

  function attachHost(socket: WebSocket, request: IncomingMessage, version: number): void {
    if (version !== PROTOCOL_VERSION || !isLocalOrigin(request.headers.origin)) {
      socket.send(JSON.stringify({ t: 'refused', reason: version !== PROTOCOL_VERSION ? 'version' : 'notLocal' } satisfies ToHost));
      socket.close(CLOSE.refused);
      return;
    }
    // The first game screen keeps the room. A second one waits its turn instead of taking over mid-match;
    // a reloaded screen gets in as soon as its old connection has closed. The roster stays either way.
    if (host && host.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ t: 'refused', reason: 'busy' } satisfies ToHost));
      socket.close(CLOSE.refused);
      return;
    }
    host = socket;
    sendHost({ t: 'hosted', room: room.code, seats: room.snapshot(Date.now()), network });
    phones.forEach(phone => sendPhone(phone, { t: 'host', present: true }));

    socket.on('message', data => {
      const parsed = hostMessageSchema.safeParse(parse(data));
      if (!parsed.success) return;
      const { seat, msg } = parsed.data;
      for (const [index, phone] of phones) {
        if ((seat === 'all' || seat === index) && phone.bufferedAmount < PHONE_BACKLOG_BYTES) sendPhone(phone, msg);
      }
    });
    socket.on('close', () => {
      if (host !== socket) return;
      host = null;
      phones.forEach(phone => sendPhone(phone, { t: 'host', present: false }));
    });
  }

  function attachPhone(socket: WebSocket, request: IncomingMessage, hello: PhoneHello): void {
    const refuse = (reason: 'version' | 'room' | 'full') => {
      sendPhone(socket, { t: 'refused', reason });
      socket.close(CLOSE.refused);
    };
    if (hello.v !== PROTOCOL_VERSION) return refuse('version');
    if (hello.room.toUpperCase() !== room.code) return refuse('room');
    const joined = room.join(hello.name, hello.token, { device: deviceOf(request.headers['user-agent']), sinceMs: hello.sinceMs ?? null });
    if (!joined.ok) return refuse(joined.reason);

    const seat = joined.seat;
    // The same phone opened again (a second tab, or a reconnect racing the old socket): the newest wins.
    phones.get(seat)?.close(CLOSE.replaced);
    phones.set(seat, socket);
    sendPhone(socket, { t: 'welcome', seat, token: joined.token, hostPresent: host !== null });
    broadcastRoster();

    let windowStart = Date.now();
    let received = 0;
    socket.on('message', data => {
      const parsed = phoneMessageSchema.safeParse(parse(data));
      if (!parsed.success) return;
      const message = parsed.data;

      const time = Date.now();
      if (time - windowStart >= 1000) {
        windowStart = time;
        received = 0;
      }
      received++;
      // A flood loses stick frames first. Button presses survive up to twice the limit.
      if (received > MAX_MESSAGES_PER_SECOND * (message.t === 'input' ? 1 : 2)) return;

      if (message.t === 'ping') {
        room.setRtt(seat, message.rtt);
        rosterDirty = true;
        sendPhone(socket, { t: 'pong', id: message.id });
      } else if (message.t === 'button' || !host || host.bufferedAmount < HOST_BACKLOG_BYTES) {
        sendHost({ ...message, seat });
      }
    });
    socket.on('close', () => {
      if (phones.get(seat) !== socket) return;
      phones.delete(seat);
      room.disconnect(seat, Date.now());
      broadcastRoster();
    });
  }

  const server = createServer((request, response) => {
    if (request.url === '/api/room') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ room: room.code }));
    } else if (request.url === '/api/playtest' && request.method === 'POST' && options.logDirectory && isLocalOrigin(request.headers.origin)) {
      // Only the game screen on this computer may write a log, and only into the log folder under a name chosen here.
      const directory = options.logDirectory;
      const chunks: Buffer[] = [];
      let size = 0;
      request.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_LOG_BYTES) request.destroy();
        else chunks.push(chunk);
      });
      request.on('end', () => {
        const log = parse(Buffer.concat(chunks));
        if (typeof log !== 'object' || log === null || Array.isArray(log)) return void response.writeHead(400).end();
        // The game screen knows the match; only the relay knows how each phone's connection went.
        const began = 'startedAt' in log && typeof log.startedAt === 'string' ? Date.parse(log.startedAt) : 0;
        const saved = { ...log, phones: room.takeConnections(began || 0) };
        const body = JSON.stringify(saved);
        const stem = new Date().toISOString().replace(/[:.]/g, '-');
        const name = `${stem}.json`;
        // Beside the log goes the same match written out for a person to read. If that cannot be
        // written (an odd log, say), the log itself is still saved.
        let summary: string | null = null;
        try {
          summary = summariseMatch(saved);
        } catch {
          summary = null;
        }
        void mkdir(directory, { recursive: true })
          .then(() => writeFile(`${directory}/${name}`, body))
          .then(() => (summary === null ? undefined : writeFile(`${directory}/${stem}.md`, summary).catch(() => undefined)))
          .then(
            () => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ file: name })),
            () => response.writeHead(500).end(),
          );
      });
    } else {
      response.writeHead(404).end();
    }
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });

  server.on('upgrade', (request, socket, head) => {
    if (new URL(request.url ?? '/', 'http://relay').pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, client => {
      alive.add(client);
      client.on('pong', () => alive.add(client));
      client.on('error', () => client.terminate());
      const helloTimer = setTimeout(() => client.close(CLOSE.refused), HELLO_TIMEOUT_MS);
      client.once('message', data => {
        clearTimeout(helloTimer);
        const hello = parse(data);
        const asHost = hostHelloSchema.safeParse(hello);
        if (asHost.success) return attachHost(client, request, asHost.data.v);
        const asPhone = phoneHelloSchema.safeParse(hello);
        if (asPhone.success) return attachPhone(client, request, asPhone.data);
        client.close(CLOSE.refused);
      });
      client.on('close', () => clearTimeout(helloTimer));
    });
  });

  // Timers live here, not in the host page: a hidden browser tab throttles its timers.
  const everySecond = setInterval(() => {
    if (room.expire(Date.now()).length > 0 || rosterDirty) broadcastRoster();
  }, 1000);
  const liveness = setInterval(() => {
    for (const client of sockets.clients) {
      if (!alive.has(client)) {
        client.terminate();
        continue;
      }
      alive.delete(client);
      client.ping();
    }
  }, LIVENESS_MS);
  const networkWatch = setInterval(() => {
    void pollNetwork().then(next => {
      if (next.address === network.address && next.ssid === network.ssid) return;
      network = next;
      sendHost({ t: 'network', network });
    });
  }, NETWORK_POLL_MS);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  return {
    port: (server.address() as AddressInfo).port,
    room: room.code,
    close() {
      [everySecond, liveness, networkWatch].forEach(clearInterval);
      sockets.clients.forEach(client => client.terminate());
      sockets.close();
      return new Promise(resolve => server.close(() => resolve()));
    },
  };
}
