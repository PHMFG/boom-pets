// Temporary: screenshots for looking at a change. Not committed.
import { expect, test } from '@playwright/test';

const MODE = process.env.LOOK_MODE ?? 'paint';
const AT = (process.env.LOOK_AT ?? '6,18,36').split(',').map(Number);

test('look', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`/?solo&autostart&modes=${MODE}`);
  await page.waitForFunction(() => (window as any).__BOOM__?.game.phase === 'play', null, { timeout: 90_000 });
  for (const seconds of AT) {
    await page.evaluate(until => { const { game, skip } = (window as any).__BOOM__; for (let guard = 0; guard < 4000 && game.phase === 'play' && game.round.time < until - 0.6; guard++) skip(0.05); }, seconds);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/look-${MODE}-${seconds}.png` });
  }
  expect(errors).toEqual([]);
});
