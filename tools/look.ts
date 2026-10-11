// Takes pictures of the game to look at: passing tests do not show that something looks right.
// It starts its own copy of the game screen on a port of its own (bots only, no relay), plays to the
// moments asked for and saves 1920x1080 pictures into test-results/look/.
//
// Usage:
//   pnpm look potato                     a round of that game with four bots, at 3 s and 9 s
//   pnpm look lava --at=2,6,14           at those seconds of the round
//   pnpm look frita --six                six pets nobody is steering (a pale one, a dark one, all six colours)
//   pnpm look race --card                the game's card between rounds, as well
//   pnpm look paint --frames=8 --every=80
//                                        at each moment, that many pictures that many milliseconds apart: to judge motion
//   pnpm look title | how | lobby        those screens
//   pnpm look finale                     a one-round match through the winner's moment to the table
//   pnpm look brawl,lava --flow          a whole match of those games, a picture every 0.5 s of the screens between rounds
//   --port=5207                          serve on that port (otherwise a free one is found); a game already served there is used as it is
//   pnpm look brawl,lava --flow --video  the same match filmed, and the moments that pass too fast for a picture every 0.5 s
//                                        (the end of each round, the reel stopping and the world changing) tiled frame by frame
//   pnpm look lava --at=0.8,9.5 --video --for=3
//                                        from each of those seconds of the round, three seconds filmed in real time and tiled
//                                        ten frames a second: to judge something that moves (furniture falling, a tile blinking)
//   pnpm look lava --perf                no pictures: how long frames take in a round of that game, on the graphics card
//                                        and again with the processor slowed four times, with draw calls and triangles
//   pnpm look --soak                     no pictures: three matches of every game twice over, fast-forwarded, counting what is
//                                        held after each change of world (shapes, textures, things in the scene, memory):
//                                        the numbers must stop growing, or something is never let go
//   --name=before                        a word to put in the file names
// A burst (--frames) and a flow are also tiled into one picture, sheet-*.png, to see the whole run at a glance (needs ffmpeg).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'test-results/look');
const args = process.argv.slice(2);
const flag = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const has = (name: string) => args.includes(`--${name}`);
const what = args.find(arg => !arg.startsWith('--')) ?? 'brawl';
/** A port nobody is using, so several of these can run at once, each showing its own copy of the code. */
const freePort = () =>
  new Promise<number>(done => {
    const probe = createServer();
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
const port = flag('port') ? Number(flag('port')) : await freePort();
const times = (flag('at') ?? '3,9').split(',').map(Number);
const frames = Number(flag('frames') ?? 1);
const every = Number(flag('every') ?? 100);
const label = flag('name') ? `${flag('name')}-` : '';
/** With --video in a round: how many seconds are filmed from each moment asked for. */
const watchFor = Number(flag('for') ?? 3);
const base = `http://localhost:${port}`;

type Boom = { game: { phase: string; revealed: boolean; round: { time: number }; setLobbySeats(seats: unknown[]): void; startMatch(options: unknown): void; events: unknown[] }; session: { onEvent(event: unknown): void }; skip(seconds: number): void };
declare const window: { __BOOM__: Boom; location: { search: string } };
// The few things of a page that the measuring code touches: this file is checked without the browser's types.
type Counts = { render: { calls: number; triangles: number }; autoReset: boolean; reset(): void };
type Held = { memory: { geometries: number; textures: number }; programs?: unknown[] };
declare const performance: { now(): number };
declare const document: { getElementsByTagName(name: string): { length: number }; querySelector(selector: string): { getContext(kind: string): { getExtension(name: string): { UNMASKED_RENDERER_WEBGL: number } | null; getParameter(name: number): unknown } | null } | null };
declare const requestAnimationFrame: (step: (now: number) => void) => void;

const reachable = async () => {
  try {
    return (await fetch(base)).ok;
  } catch {
    return false;
  }
};

const server = (await reachable()) ? null : spawn('pnpm', ['--filter', '@boom/web', 'dev'], { cwd: root, env: { ...process.env, BOOM_WEB_PORT: String(port) }, stdio: 'ignore', detached: true });
for (let tries = 0; tries < 120 && !(await reachable()); tries++) await new Promise(wait => setTimeout(wait, 250));

mkdirSync(out, { recursive: true });
// Measuring wants the real graphics card; pictures are the same either way.
const browser = await chromium.launch(has('soak') ? { args: ['--js-flags=--expose-gc'] } : has('perf') ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'] } : {});
const filming = has('video');
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ...(filming ? { recordVideo: { dir: out, size: { width: 1280, height: 720 } } } : {}) });
const page = await context.newPage();
/** When the film started, to find a moment in it afterwards. */
const filmStart = Date.now();
const marks: { name: string; at: number }[] = [];
const mark = (name: string) => marks.push({ name, at: (Date.now() - filmStart) / 1000 });
const errors: string[] = [];
page.on('pageerror', error => errors.push(String(error)));
const saved: string[] = [];

async function shoot(name: string): Promise<void> {
  for (let frame = 0; frame < frames; frame++) {
    const file = join(out, `${label}${name}${frames > 1 ? `-f${frame}` : ''}.png`);
    await page.screenshot({ path: file });
    saved.push(file);
    if (frame < frames - 1) await page.waitForTimeout(every);
  }
}

/** Tiles every picture whose name starts with `prefix` into one, in order, three to a row. */
function sheet(prefix: string): void {
  const count = readdirSync(out).filter(name => name.startsWith(prefix) && name.endsWith('.png')).length;
  if (count < 2) return;
  const file = join(out, `sheet-${prefix.replace(/-$/, '')}.png`);
  const made = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-pattern_type', 'glob', '-i', join(out, `${prefix}*.png`), '-vf', `scale=640:-1,tile=3x${Math.ceil(count / 3)}`, '-frames:v', '1', file]);
  if (made.status === 0) saved.push(file);
}

/** Pictures left by an earlier run with the same names would be tiled in with the new ones. */
function clear(prefix: string): void {
  for (const name of readdirSync(out)) if (name.startsWith(prefix) || name.startsWith(`sheet-${prefix}`)) rmSync(join(out, name));
}

const phase = (target: Page) => target.evaluate(() => window.__BOOM__?.game.phase);
const waitFor = (name: string, timeout = 90_000) => page.waitForFunction(wanted => window.__BOOM__?.game.phase === wanted, name, { timeout });
/** Fast-forwards the round to a second of its clock, then lets the screen settle for a moment in real time. */
async function playTo(seconds: number): Promise<void> {
  await page.evaluate(until => {
    const { game, skip } = window.__BOOM__;
    for (let guard = 0; guard < 6000 && game.phase === 'play' && game.round.time < until - 0.5; guard++) skip(0.05);
  }, seconds);
  await page.waitForTimeout(500);
}

try {
  if (what === 'title' || what === 'how' || what === 'lobby') {
    await page.goto(`${base}/?solo`);
    await page.locator('.menu-item.is-selected').waitFor({ timeout: 90_000 });
    await page.waitForTimeout(1200);
    if (what === 'how') {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    } else if (what === 'lobby') {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }
    await shoot(what);
  } else if (has('soak')) {
    const games = ['brawl', 'paint', 'lava', 'grow', 'race', 'color', 'potato', 'frita'];
    const order = [...games, ...games];
    const count = () =>
      page.evaluate(async () => {
        const stage = (window.__BOOM__.session as unknown as { stage: { renderer: Record<string, { info?: Held }>; scene: { traverse(visit: () => void): void } } }).stage;
        const info = Object.values(stage.renderer).find(value => value?.info?.memory)?.info;
        let things = 0;
        stage.scene.traverse(() => things++);
        (globalThis as unknown as { gc?: () => void }).gc?.();
        await new Promise<void>(done => requestAnimationFrame(() => done()));
        const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
        return { shapes: info?.memory.geometries ?? 0, textures: info?.memory.textures ?? 0, programs: info?.programs?.length ?? 0, things, heap: Math.round(heap / 1e6), nodes: document.getElementsByTagName('*').length };
      });
    /** Runs the simulation on to the next round being played, or to the end of the match. */
    const toNext = () =>
      page.evaluate(() => {
        const { game, skip } = window.__BOOM__;
        for (let guard = 0; guard < 6000 && game.phase === 'play'; guard++) skip(0.05);
        for (let guard = 0; guard < 6000 && game.phase !== 'play' && game.phase !== 'matchEnd'; guard++) skip(0.05);
        return game.phase;
      });
    await page.goto(`${base}/?solo&autostart&modes=${order.join(',')}`);
    await waitFor('play');
    const rows: Awaited<ReturnType<typeof count>>[] = [];
    // Three matches: the first makes everything for the first time (and the podium at its end), so the second and third are the ones to compare.
    for (let match = 1; match <= 3; match++) {
      for (const [round, game] of order.entries()) {
        // A few frames of the new world really drawn, so what it needs is really made.
        await page.waitForTimeout(700);
        const held = await count();
        rows.push(held);
        console.log(`match ${match} round ${String(round + 1).padStart(2)} ${game.padEnd(7)} shapes ${String(held.shapes).padStart(4)}  textures ${String(held.textures).padStart(3)}  programs ${String(held.programs).padStart(3)}  in the scene ${String(held.things).padStart(5)}  page nodes ${String(held.nodes).padStart(4)}  memory ${held.heap} MB`);
        await toNext();
      }
      if (match < 3) {
        // The podium, the table, and a rematch from it.
        await page.waitForTimeout(1500);
        await page.keyboard.press('Enter');
        await waitFor('play');
      }
    }
    // Each round of the third match against the same round of the second.
    const first = rows.slice(16, 32);
    const second = rows.slice(32, 48);
    const grew = (key: 'shapes' | 'textures' | 'things' | 'heap' | 'nodes') => Math.max(...second.map((row, index) => row[key] - first[index]![key]));
    console.log(`From one match to the next, at most: shapes ${grew('shapes') >= 0 ? '+' : ''}${grew('shapes')}, textures ${grew('textures') >= 0 ? '+' : ''}${grew('textures')}, things in the scene ${grew('things') >= 0 ? '+' : ''}${grew('things')}, page nodes ${grew('nodes') >= 0 ? '+' : ''}${grew('nodes')}, memory ${grew('heap') >= 0 ? '+' : ''}${grew('heap')} MB`);
  } else if (has('perf')) {
    // Frame times over five seconds of a round, as the page sees them, then the same with the processor slowed.
    const cdp = await context.newCDPSession(page);
    const sample = () =>
      page.evaluate(async () => {
        const stage = (window.__BOOM__.session as unknown as { stage: { renderer: Record<string, { info?: Counts }> } }).stage;
        const info = Object.values(stage.renderer).find(value => value?.info?.render)?.info;
        // Counted over one whole frame: left to itself the count starts again at every pass, and the last pass is one rectangle.
        let calls = 0;
        let triangles = 0;
        if (info) {
          info.autoReset = false;
          await new Promise<void>(done => requestAnimationFrame(() => done()));
          info.reset();
          await new Promise<void>(done => requestAnimationFrame(() => done()));
          calls = info.render.calls;
          triangles = info.render.triangles;
          info.autoReset = true;
        }
        const gl = document.querySelector('canvas')?.getContext('webgl2');
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        const times: number[] = [];
        let last = performance.now();
        const start = last;
        await new Promise<void>(done => {
          const step = (now: number) => {
            times.push(now - last);
            last = now;
            if (now - start < 5000) requestAnimationFrame(step);
            else done();
          };
          requestAnimationFrame(step);
        });
        const sorted = times.slice(5).sort((a, b) => a - b);
        const at = (share: number) => Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]!.toFixed(1));
        return { frames: sorted.length, median: at(0.5), p95: at(0.95), p99: at(0.99), worst: at(1), over33: sorted.filter(time => time > 33).length, calls, triangles, card: debug && gl ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown' };
      });
    for (const game of what.split(',')) {
      await page.goto(`${base}/?solo&autostart&modes=${game}`);
      await waitFor('play');
      await page.waitForTimeout(1500);
      const plain = await sample();
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const slowed = await sample();
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      console.log(`${game.padEnd(7)} ${String(plain.calls).padStart(4)} draw calls, ${String(plain.triangles).padStart(7)} triangles | frame median ${plain.median} ms, 95th ${plain.p95}, 99th ${plain.p99}, worst ${plain.worst}, over 33 ms: ${plain.over33} of ${plain.frames} | processor slowed 4x: median ${slowed.median}, 95th ${slowed.p95}, worst ${slowed.worst}, over 33 ms: ${slowed.over33} of ${slowed.frames} | ${plain.card}`);
    }
  } else if (what === 'finale') {
    await page.goto(`${base}/?solo&autostart&modes=${flag('mode') ?? 'paint'}`);
    await waitFor('play');
    await page.evaluate(() => {
      const { game, skip } = window.__BOOM__;
      for (let guard = 0; guard < 6000 && game.phase === 'play'; guard++) skip(0.05);
    });
    await shoot('finale-round-end');
    await waitFor('finale');
    // The winner's banner is put on the page the moment the winner is named, whenever that falls on this machine's clock.
    void page.waitForFunction(() => document.querySelector('.finale-winner') !== null, null, { timeout: 60_000 }).then(() => mark('finale-winner'), () => undefined);
    for (const second of [1, 2.4, 3.6, 5.2, 6.5, 8.4]) {
      await page.waitForTimeout(second === 1 ? 1000 : 1200);
      await shoot(`finale-${second}`);
    }
    await waitFor('matchEnd');
    await page.waitForTimeout(1800);
    await shoot('finale-table');
  } else if (has('flow')) {
    // The screens between rounds, as they are: a picture every half second from the end of each round to the next GO.
    clear(`${label}flow-`);
    await page.goto(`${base}/?solo&autostart&modes=${what}`);
    const games = what.split(',');
    for (let round = 0; round < games.length; round++) {
      await waitFor('play');
      await page.waitForTimeout(1500);
      await shoot(`flow-${round + 1}-${games[round]}-play`);
      await page.evaluate(() => {
        const { game, skip } = window.__BOOM__;
        for (let guard = 0; guard < 6000 && game.phase === 'play'; guard++) skip(0.05);
      });
      if (filming) {
        // No pictures, which would make the film stutter: only note when each thing happens.
        mark(`round${round + 1}-end`);
        let last = 'roundEnd';
        let revealed = false;
        for (let guard = 0; guard < 600; guard++) {
          const now = await page.evaluate(() => ({ phase: window.__BOOM__.game.phase, revealed: window.__BOOM__.game.revealed }));
          if (now.phase !== last) mark(`round${round + 1}-${now.phase}`);
          if (now.phase === 'intro' && now.revealed && !revealed) mark(`round${round + 1}-reveal`);
          last = now.phase;
          revealed = now.revealed;
          if (now.phase === 'play' || now.phase === 'matchEnd') break;
          await page.waitForTimeout(50);
        }
        continue;
      }
      for (let step = 0; step < 40 && (await phase(page)) !== 'play' && (await phase(page)) !== 'matchEnd'; step++) {
        await shoot(`flow-${round + 1}-${games[round]}-after-${String(step).padStart(2, '0')}-${await phase(page)}`);
        await page.waitForTimeout(500);
      }
      sheet(`${label}flow-${round + 1}-`);
    }
  } else {
    const six = has('six');
    await page.goto(`${base}/?solo${six ? '' : '&autostart'}&modes=${what}`);
    if (six) {
      await page.locator('.menu-item.is-selected').waitFor({ timeout: 90_000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        const { game, session } = window.__BOOM__;
        // A pale pet, a charcoal one, and four more: all six seat colours, nobody steering.
        const pets = ['polar', 'penguin', 'fox', 'pig', 'bunny', 'koala'];
        game.setLobbySeats(pets.map((pet, seat) => ({ seat, pet, name: `Jog ${seat + 1}`, bot: null })));
        game.startMatch({ rounds: 1, bots: false, petPool: pets, botName: (index: number) => `R${index}`, modes: [new URLSearchParams(window.location.search).get('modes')] });
        for (const event of game.events) session.onEvent(event);
      });
    }
    if (has('card')) {
      await page.waitForFunction(() => window.__BOOM__?.game.phase === 'intro' && window.__BOOM__.game.revealed, null, { timeout: 90_000 });
      await page.waitForTimeout(2600);
      await shoot(`${what}-card`);
    }
    await waitFor('play');
    for (const seconds of times) {
      await playTo(seconds);
      if (filming) {
        // Filmed from here in real time. No picture meanwhile: taking one makes the film stutter.
        mark(`watch-${what}-${seconds}`);
        await page.waitForTimeout(watchFor * 1000);
        continue;
      }
      await shoot(`${what}${six ? '-six' : ''}-${seconds}`);
      if (frames > 1) sheet(`${label}${what}${six ? '-six' : ''}-${seconds}-f`);
    }
  }
} finally {
  const film = filming ? await page.video()?.path() : undefined;
  await context.close();
  await browser.close();
  if (server?.pid) process.kill(-server.pid);
  if (film) {
    saved.push(film);
    // Ten frames a second around each moment worth watching, tiled five to a row.
    const window = (name: string, from: number, seconds: number) => {
      const file = join(out, `${label}film-${name}.png`);
      const count = Math.round(seconds * 10);
      const made = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.max(0, from)), '-t', String(seconds), '-i', film, '-vf', `fps=10,scale=384:-1,tile=5x${Math.ceil(count / 5)}`, '-frames:v', '1', file]);
      if (made.status === 0) saved.push(file);
    };
    for (const moment of marks) {
      if (moment.name.endsWith('-end')) window(moment.name, moment.at - 0.2, 3);
      if (moment.name.endsWith('-reveal')) window(moment.name, moment.at - 1.2, 3);
      if (moment.name.endsWith('-finale')) window(moment.name, moment.at - 0.8, 3);
      if (moment.name === 'finale-winner') window(moment.name, moment.at - 0.4, 3);
      if (moment.name.endsWith('-countdown')) window(moment.name, moment.at - 0.5, 2);
      if (moment.name.startsWith('watch-')) window(moment.name, moment.at, watchFor);
    }
    console.log(marks.map(moment => `${moment.name} at ${moment.at.toFixed(1)} s`).join(', '));
  }
}
for (const file of saved) console.log(file);
if (errors.length > 0) {
  console.error(`The page reported errors:\n${errors.join('\n')}`);
  process.exit(1);
}
