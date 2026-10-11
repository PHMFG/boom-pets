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
const base = `http://localhost:${port}`;

type Boom = { game: { phase: string; revealed: boolean; round: { time: number }; setLobbySeats(seats: unknown[]): void; startMatch(options: unknown): void; events: unknown[] }; session: { onEvent(event: unknown): void }; skip(seconds: number): void };
declare const window: { __BOOM__: Boom; location: { search: string } };

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
const browser = await chromium.launch();
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
  } else if (what === 'finale') {
    await page.goto(`${base}/?solo&autostart&modes=${flag('mode') ?? 'paint'}`);
    await waitFor('play');
    await page.evaluate(() => {
      const { game, skip } = window.__BOOM__;
      for (let guard = 0; guard < 6000 && game.phase === 'play'; guard++) skip(0.05);
    });
    await shoot('finale-round-end');
    await waitFor('finale');
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
      if (moment.name.endsWith('-countdown')) window(moment.name, moment.at - 0.5, 2);
    }
    console.log(marks.map(moment => `${moment.name} at ${moment.at.toFixed(1)} s`).join(', '));
  }
}
for (const file of saved) console.log(file);
if (errors.length > 0) {
  console.error(`The page reported errors:\n${errors.join('\n')}`);
  process.exit(1);
}
