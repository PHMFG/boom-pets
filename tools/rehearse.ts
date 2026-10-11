// A dress rehearsal with nobody in the room: its own copy of the game (relay and web server on free ports),
// a real game screen drawn on the graphics card in a browser with no window, and simulated phones that join
// by the relay, ready up and play match after match in real time. It watches for what a long evening would
// show and a short test does not: errors, a match that never ends, frames that hitch, phones that drop.
// The matches are logged like any others, into test-results/rehearsal/, and judged by the playtest report.
//
// Usage:
//   pnpm rehearse                 five phones, ten minutes
//   pnpm rehearse 6 --minutes=20
//
// The simulated phones wander and press buttons at random (tools/fake-phones.ts): what they prove is that the
// game holds together, not that it is fun. Their logs must never go into playtests/.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const phones = Math.min(6, Math.max(1, Number(args.find(arg => !arg.startsWith('--'))) || 5));
const minutes = Number(args.find(arg => arg.startsWith('--minutes='))?.split('=')[1]) || 10;
const logs = join(root, 'test-results/rehearsal');

const freePort = () =>
  new Promise<number>(done => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
const webPort = await freePort();
const relayPort = await freePort();
const base = `http://localhost:${webPort}`;
const env = { ...process.env, BOOM_WEB_PORT: String(webPort), BOOM_RELAY_PORT: String(relayPort), BOOM_PLAYTEST_DIR: logs };

rmSync(logs, { recursive: true, force: true });
mkdirSync(logs, { recursive: true });
const stack = spawn('pnpm', ['dev'], { cwd: root, env, stdio: 'ignore', detached: true });
const reachable = async (url: string) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};
for (let tries = 0; tries < 160 && !((await reachable(base)) && (await reachable(`http://127.0.0.1:${relayPort}/api/room`))); tries++) await new Promise(wait => setTimeout(wait, 250));

type Frames = { count: number; over25: number; over50: number; worst: number; total: number; long: { ms: number; during: string }[] };
declare const window: { __BOOM__: { game: { phase: string; gameMode: string; revealed: boolean } }; __frames: Frames; __curtain: () => boolean };
declare const document: { querySelector(selector: string): unknown };
declare const requestAnimationFrame: (step: (now: number) => void) => void;
declare const performance: { now(): number };

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const problems: string[] = [];
let crowd: ReturnType<typeof spawn> | null = null;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => problems.push(`page error: ${String(error)}`));
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  await page.goto(base);
  await page.locator('.menu-item.is-selected').waitFor({ timeout: 90_000 });
  await page.keyboard.press('Enter');
  // Every frame the screen draws from here on is timed.
  await page.evaluate(() => {
    const frames: Frames = { count: 0, over25: 0, over50: 0, worst: 0, total: 0, long: [] };
    window.__frames = frames;
    let last = performance.now();
    const step = (now: number) => {
      const took = now - last;
      last = now;
      frames.count++;
      frames.total += took;
      if (took > 25) frames.over25++;
      if (took > 50) frames.over50++;
      // A long frame is noted with what was on screen: one behind the curtain between worlds is seen by nobody.
      if (took > 25) {
        const game = window.__BOOM__.game;
        const hidden = document.querySelector('.iris.is-closed') !== null;
        frames.long.push({ ms: Math.round(took), during: `${game.gameMode} ${game.phase}${game.phase === 'intro' ? (game.revealed ? ' (card)' : ' (roulette)') : ''}${hidden ? ', behind the curtain' : ''}` });
      }
      frames.worst = Math.max(frames.worst, took);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  crowd = spawn('node', [join(root, 'tools/fake-phones.ts'), String(phones)], { cwd: root, env, stdio: 'ignore', detached: true });

  const until = Date.now() + minutes * 60_000;
  const played = new Map<string, number>();
  let matches = 0;
  let last = 'lobby';
  let lastChange = Date.now();
  while (Date.now() < until) {
    await page.waitForTimeout(500);
    const now = await page.evaluate(() => ({ phase: window.__BOOM__.game.phase, game: window.__BOOM__.game.gameMode }));
    if (now.phase !== last) {
      if (now.phase === 'play') played.set(now.game, (played.get(now.game) ?? 0) + 1);
      if (now.phase === 'matchEnd') matches++;
      last = now.phase;
      lastChange = Date.now();
    }
    // No phase of the game lasts two minutes. One that does is stuck.
    if (Date.now() - lastChange > 120_000) {
      problems.push(`stuck in "${last}" for two minutes`);
      break;
    }
  }
  const frames = await page.evaluate(() => window.__frames);
  console.log(`${phones} phones, ${minutes} minutes: ${matches} matches finished, ${[...played.values()].reduce((sum, rounds) => sum + rounds, 0)} rounds played (${[...played].map(([game, rounds]) => `${game} ${rounds}`).join(', ')}).`);
  console.log(`Frames: ${frames.count} drawn, ${(frames.total / frames.count).toFixed(1)} ms on average, ${frames.over25} over 25 ms, ${frames.over50} over 50 ms, the worst ${frames.worst.toFixed(0)} ms.`);
  for (const frame of frames.long) console.log(`  ${String(frame.ms).padStart(4)} ms during ${frame.during}`);
} finally {
  await browser.close();
  if (crowd?.pid) process.kill(-crowd.pid);
  if (stack.pid) process.kill(-stack.pid);
}

console.log(problems.length === 0 ? 'No errors on the game screen.' : `${problems.length} problems:\n${[...new Set(problems)].slice(0, 20).join('\n')}`);
const saved = readdirSync(logs).filter(name => name.endsWith('.json')).length;
console.log(`${saved} match logs in ${logs}. What the report makes of them:`);
const report = spawnSync('node', [join(root, 'tools/playtest-report.ts'), logs], { cwd: root, encoding: 'utf8' });
const text = report.stdout ?? '';
const section = (title: string) => {
  const start = text.indexOf(title);
  if (start < 0) return '';
  const end = text.indexOf('\n## ', start + 1);
  const sub = text.indexOf('\n### ', start + 1);
  return text.slice(start, Math.min(...[end, sub].filter(index => index > 0), text.length)).trim();
};
console.log(section('### The games'));
// The simulated phones mash and wander, so what the report says about how people used the buttons means nothing here; what it says about the games does.
console.log(
  text
    .split('\n')
    .filter(line => line.startsWith('- ') && /"(paint|lava|grow|race|color|potato|frita)"|Rounds last|ran out the clock/.test(line))
    .join('\n') || 'No warning about any game.',
);
if (problems.length > 0) process.exit(1);
