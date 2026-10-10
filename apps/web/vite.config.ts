import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
// Relative import: the config is bundled before the workspace packages are resolvable.
import { RELAY_PORT, WS_PATH } from '../../packages/protocol/src/index.ts';

// The version shown on the title screen and on the phone's join page: the one in the root package.json.
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')) as { version: string };
const relayPort = Number(process.env.BOOM_RELAY_PORT) || RELAY_PORT;
// The browser tests run a second copy of the game on other ports, beside a session that may be in use.
const webPort = Number(process.env.BOOM_WEB_PORT) || 5173;

// One project, two pages: `/` is the game screen, `/c/` is the phone controller.
// Phones reach this server over the Wi-Fi; the relay stays on 127.0.0.1 behind the `/ws` proxy.
const network = {
  host: true,
  port: webPort,
  strictPort: true,
  proxy: {
    [WS_PATH]: { target: `ws://127.0.0.1:${relayPort}`, ws: true },
    '/api': { target: `http://127.0.0.1:${relayPort}` },
  },
};

/** Stamps the version into both pages, where a page already open can read it back to learn it has gone stale. */
const versionStamp = {
  name: 'boom-version-stamp',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'boom-version', content: version }, injectTo: 'head' as const }],
};

export default defineConfig({
  plugins: [react(), versionStamp],
  define: { __BOOM_VERSION__: JSON.stringify(version) },
  appType: 'mpa',
  server: network,
  preview: network,
  build: {
    // The manifest lets tools/check-bundle.ts measure what the phone page downloads.
    manifest: true,
    // The host bundle carries Three.js and is only ever loaded from this computer.
    chunkSizeWarningLimit: 8000,
    rolldownOptions: {
      input: { host: resolve(import.meta.dirname, 'index.html'), controller: resolve(import.meta.dirname, 'c/index.html') },
    },
  },
});
