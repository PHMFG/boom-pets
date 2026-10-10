import { RELAY_PORT } from '@boom/protocol';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRelay } from './relay';

const port = Number(process.env.BOOM_RELAY_PORT) || RELAY_PORT;

try {
  // Bound to this computer only. Phones reach it through the web server's /ws proxy.
  // Relative paths are taken from the repository root, wherever the relay was started from.
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const logDirectory = resolve(root, process.env.BOOM_PLAYTEST_DIR ?? 'playtests');
  const relay = await startRelay({ port, host: '127.0.0.1', logDirectory });
  console.log(`Relay listening on 127.0.0.1:${relay.port}, room ${relay.room}`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
  console.error(`Port ${port} is already used by another program. Start again with BOOM_RELAY_PORT set to a free port, for example: BOOM_RELAY_PORT=47822 pnpm dev`);
  process.exit(1);
}
