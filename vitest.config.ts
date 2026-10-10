import { defineConfig } from 'vitest/config';

// Unit tests only. The browser tests in e2e/ belong to Playwright (pnpm test:e2e).
export default defineConfig({
  test: { exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'] },
});
