import { defineConfig } from 'vitest/config';

// Unit tests only. The browser tests in e2e/ belong to Playwright (pnpm test:e2e).
export default defineConfig({
  // Vite stamps the real version at build time; tests only need the name to exist.
  define: { __BOOM_VERSION__: JSON.stringify('test') },
  test: { exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'] },
});
