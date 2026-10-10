// Connects simulated phones that wander, hop and spin, to test the game without real people.
// Usage: node tools/fake-phones.ts [count=4] [--seconds=N]   (the game must be running: pnpm dev)
import { BUTTON_BITS, PROTOCOL_VERSION, RELAY_PORT, WS_PATH, type ButtonName, type PhoneMessage, type ToPhone } from '../packages/protocol/src/index.ts';

const count = Math.min(6, Math.max(1, Number(process.argv[2]) || 4));
const seconds = Number(process.argv.find(arg => arg.startsWith('--seconds='))?.split('=')[1]) || 0;
const relay = `127.0.0.1:${Number(process.env.BOOM_RELAY_PORT) || RELAY_PORT}`;

const response = await fetch(`http://${relay}/api/room`).catch(() => null);
if (!response?.ok) {
  console.error(`No game found on ${relay}. Start it first with: pnpm dev`);
  process.exit(1);
}
const { room } = (await response.json()) as { room: string };

function startPhone(index: number): WebSocket {
  const socket = new WebSocket(`ws://${relay}${WS_PATH}`);
  const send = (message: PhoneMessage) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));
  let seq = 0;
  let heading = Math.random() * Math.PI * 2;
  let held = 0;
  let sentAt = 0;
  let rtt: number | null = null;

  const press = (button: ButtonName, down: boolean) => {
    held = down ? held | BUTTON_BITS[button] : held & ~BUTTON_BITS[button];
    send({ t: 'button', button, down });
  };

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ t: 'hello', role: 'phone', v: PROTOCOL_VERSION, room, name: `Teste ${index + 1}`, token: '' }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as ToPhone;
    if (message.t === 'welcome') console.log(`Teste ${index + 1} sat in seat ${message.seat + 1}`);
    // Say ready whenever the game is waiting for it, so fake phones can play match after match on their own.
    if (message.t === 'status' && (message.screen === 'lobby' || message.screen === 'results') && !message.ready) send({ t: 'ready', ready: true });
    if (message.t === 'refused') console.error(`Teste ${index + 1} was refused: ${message.reason}`);
    if (message.t === 'pong') rtt = performance.now() - sentAt;
  });

  setInterval(() => {
    // Drift the heading, with an occasional sharp turn, so the phones cover the platform.
    heading += (Math.random() - 0.5) * 0.5 + (Math.random() < 0.02 ? Math.PI * Math.random() : 0);
    const push = Math.random() < 0.9 ? 1 : 0;
    send({ t: 'input', seq: seq++, x: Number((Math.sin(heading) * push).toFixed(2)), y: Number((Math.cos(heading) * push).toFixed(2)), held });
  }, 33);
  setInterval(() => {
    if (Math.random() < 0.5) {
      press('a', true);
      setTimeout(() => press('a', false), 200 + Math.random() * 900);
    } else {
      press('b', true);
      setTimeout(() => press('b', false), 80);
    }
  }, 1500 + Math.random() * 1500);
  setInterval(() => {
    sentAt = performance.now();
    send({ t: 'ping', id: seq, rtt: rtt === null ? null : Math.round(rtt) });
  }, 2000);
  return socket;
}

const phones = Array.from({ length: count }, (_, index) => startPhone(index));
console.log(`${count} fake phones joining room ${room}. Press Ctrl+C to stop.`);
if (seconds > 0) {
  setTimeout(() => {
    phones.forEach(phone => phone.close());
    process.exit(0);
  }, seconds * 1000);
}
