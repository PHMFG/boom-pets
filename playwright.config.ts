import { defineConfig } from '@playwright/test';

// The browser tests start their own copy of the game on these ports, so they never
// take the room from a game screen that is already open on the usual ones.
const WEB_PORT = 5183;
const RELAY_PORT = 47831;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${WEB_PORT}` },
  webServer: {
    command: 'pnpm dev',
    env: { BOOM_WEB_PORT: String(WEB_PORT), BOOM_RELAY_PORT: String(RELAY_PORT), BOOM_PLAYTEST_DIR: 'test-results/playtests' },
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
