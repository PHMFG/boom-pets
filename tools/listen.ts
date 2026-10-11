// Measures every sound the game makes, for whoever cannot or need not listen to all of them: it plays each
// event through the game's own audio engine in a browser with no window, records what reaches the master
// (before the limiter), and prints how loud each is, how hard it peaks and how long it lasts. A sound far
// louder or quieter than its neighbours shows up here before it shows up in a living room.
//
// Usage:
//   pnpm listen            every event sound, quietest first, with the outliers marked
//   pnpm listen --voice    the announcer's lines instead
//
// "Loud" is the level of the loudest 300 ms of the sound (dB below full scale); "peak" is its highest sample.
// The announcer is stubbed out while events are measured, so an event's own sound is not hidden under his voice.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const voice = process.argv.includes('--voice');
/** Marks: more than this many dB from the middle sound is worth a second look, and a peak this near full scale leans on the limiter. */
const FAR = 12;
const HOT = -1;

const port = await new Promise<number>(done => {
  const probe = createServer();
  probe.listen(0, () => {
    const { port } = probe.address() as { port: number };
    probe.close(() => done(port));
  });
});
const base = `http://localhost:${port}`;
const server = spawn('pnpm', ['--filter', '@boom/web', 'dev'], { cwd: root, env: { ...process.env, BOOM_WEB_PORT: String(port) }, stdio: 'ignore', detached: true });
const up = async () => {
  try {
    return (await fetch(base)).ok;
  } catch {
    return false;
  }
};
for (let tries = 0; tries < 120 && !(await up()); tries++) await new Promise(wait => setTimeout(wait, 250));

/** Every event that has a sound, with what its sound depends on filled in, and how long to listen for. */
const EVENTS: [name: string, event: Record<string, unknown>, seconds?: number][] = [
  ['countdown 3', { t: 'countdown', n: 3 }],
  ['countdown GO', { t: 'countdown', n: 0 }],
  ['dash (tap)', { t: 'dash', pet: 1, charge: 0 }],
  ['dash (full charge)', { t: 'dash', pet: 1, charge: 1 }],
  ['dash hit', { t: 'dashHit', pet: 1, seat: 0, victims: [2], charge: 0.8, x: 0, z: 0 }],
  ['land', { t: 'land', pet: 1, speed: 9, x: 0, z: 0 }],
  ['tired', { t: 'tired', pet: 1 }],
  ['grab miss', { t: 'grabMiss', pet: 1 }],
  ['grab', { t: 'grab', pet: 1, kind: 'pet' }],
  ['throw', { t: 'throw', pet: 1, kind: 'pet' }],
  ['throw hit', { t: 'throwHit', pet: 1, victim: 2, x: 0, z: 0 }],
  ['power ready', { t: 'powerReady', seat: 0, power: 'rocket' }],
  ['escape', { t: 'escape', pet: 1 }],
  ['fall', { t: 'fall', pet: 1 }],
  ['eliminated', { t: 'eliminated', pet: 1, seat: 0, cause: 'fall', killer: null, decoy: false, x: 0, z: 0 }],
  ['explosion (barrel)', { t: 'explosion', x: 0, y: 0, z: 0, radius: 2.5, cause: 'barrel', owner: 0, chain: 0 }],
  ['explosion (big, chain 3)', { t: 'explosion', x: 0, y: 0, z: 0, radius: 4, cause: 'barrel', owner: 0, chain: 3 }],
  ['barrel armed', { t: 'barrelArmed', id: 1 }],
  ['tile warn', { t: 'tileWarn', index: 1 }],
  ['tile fall', { t: 'tileFall', index: 1 }],
  ['cube spawn', { t: 'cubeSpawn', x: 0, z: 0 }],
  ['cube collected', { t: 'cubeCollected', seat: 0 }],
  ['roll (common)', { t: 'roll', seat: 0, tier: 'common', power: 'rocket' }],
  ['roll (super)', { t: 'roll', seat: 0, tier: 'super', power: 'kaiju' }, 2.5],
  ['power start', { t: 'powerStart', seat: 0, pet: 1, power: 'rocket' }],
  ['honk', { t: 'honk', pet: 1 }],
  ['gacha start', { t: 'gachaStart', seat: 0 }, 2.5],
  ['gacha lever', { t: 'gachaLever', seat: 0 }],
  ['gacha jinx', { t: 'gachaJinx', seat: 1, total: 20 }],
  ['gacha reveal', { t: 'gachaReveal', seat: 0, power: 'kaiju', cursed: false }, 2.5],
  ['meteor call', { t: 'meteorCall', owner: 0, x: 0, z: 0, delay: 1 }],
  ['revenge swap', { t: 'revengeSwap', ghost: 0, victim: 1 }, 2],
  ['score', { t: 'score', seat: 0, points: 6, reason: 'place', x: 0, z: 0 }],
  ['round winner (and the list of places)', { t: 'roundWinner', seats: [0] }, 3],
  ['roulette (the reel, its landing, the curtain)', { t: 'phase', phase: 'intro', round: 2 }, 2.6],
  ['reveal', { t: 'reveal', mode: 'lava', round: 2, final: false, first: true }, 2],
  ['lava alarm', { t: 'lava', phase: 'alarm', wave: 1, seconds: 2.5 }, 3],
  ['lava flood', { t: 'lava', phase: 'flood', wave: 1, seconds: 2 }, 2],
  ['furniture falling (a sofa)', { t: 'furniture', phase: 'fall', id: 1, kind: 'sofa', x: 0, z: 0, seconds: 1.3 }, 2],
  ['furniture landing (a sofa)', { t: 'furniture', phase: 'land', id: 1, kind: 'sofa', x: 0, z: 0, seconds: 0 }],
  ['furniture landing (a pouf)', { t: 'furniture', phase: 'land', id: 2, kind: 'pouf', x: 0, z: 0, seconds: 0 }],
  ['colour shown', { t: 'colorShow', wave: 1 }],
  ['colour called', { t: 'colorCall', color: 1, wave: 1, seconds: 3 }],
  ['colour drop', { t: 'colorDrop', color: 1 }],
  ['eat (apple)', { t: 'eat', pet: 1, seat: 0, kind: 'apple', x: 0, z: 0 }],
  ['eat (melon)', { t: 'eat', pet: 1, seat: 0, kind: 'melon', x: 0, z: 0 }],
  ['eat (pepper)', { t: 'eat', pet: 1, seat: 0, kind: 'pepper', x: 0, z: 0 }],
  ['bite', { t: 'bite', pet: 1, seat: 0, victim: 2, lost: 3 }],
  ['jump', { t: 'jump', pet: 1 }],
  ['finish (first)', { t: 'finish', pet: 1, seat: 0, place: 1 }, 2],
  ['finish (second)', { t: 'finish', pet: 1, seat: 0, place: 2 }],
  ['swept', { t: 'swept', pet: 1 }],
  ['respawn', { t: 'respawn', pet: 1, seat: 0, x: 0, z: 0 }],
  ['bucket falling', { t: 'bucket', id: 1, x: 0, z: 0, delay: 1.2 }, 1.8],
  ['splash', { t: 'splash', seat: 0, x: 0, z: 0, radius: 2.3 }],
  ['bomb handed out', { t: 'potato', holder: 0, from: null, fuse: 7 }],
  ['bomb passed', { t: 'potato', holder: 1, from: 0, fuse: 5 }],
  ['bomb goes off', { t: 'potatoBoom', seat: 0, x: 0, z: 0 }, 2],
  ['the cat sings', { t: 'watch', phase: 'sing', seconds: 2 }, 2.6],
  ['the cat turns', { t: 'watch', phase: 'watch', seconds: 2 }],
  ['caught moving', { t: 'caught', pet: 1, seat: 0, x: 0, z: 0 }],
  ['finale: third place', { t: 'finale', place: 3, seats: [2] }],
  ['finale: the winner', { t: 'finale', place: 1, seats: [0] }, 3.5],
];

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.goto(`${base}/?solo`);
  await page.waitForFunction('window.__BOOM__ !== undefined', null, { timeout: 90_000 });
  const rows = (await page.evaluate(
    `(async () => {
      const audio = window.__BOOM__.session.audio;
      audio.unlock();
      await audio.context.resume();
      audio.setSong(null);
      // Bots are brawling behind the title screen: nothing of theirs may reach the engine while it is being measured.
      const handle = audio.handle.bind(audio);
      const tone = audio.tone.bind(audio);
      const announce = audio.announce.bind(audio);
      audio.handle = () => undefined;
      audio.update = () => undefined;
      audio.setSong = () => undefined;
      audio.announce = () => undefined;
      // Recordings and samples load in the background.
      await new Promise(done => setTimeout(done, 3000));
      const context = audio.context;
      let heard = [];
      const tap = context.createScriptProcessor(2048, 1, 1);
      tap.onaudioprocess = event => heard.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      audio.master.connect(tap);
      tap.connect(context.destination);
      const dB = value => (value > 0 ? 20 * Math.log10(value) : -Infinity);
      const measure = async (name, play, seconds) => {
        await new Promise(done => setTimeout(done, 250));
        heard = [];
        let error = null;
        try { play(); } catch (thrown) { error = String(thrown); }
        await new Promise(done => setTimeout(done, seconds * 1000));
        const all = new Float32Array(heard.reduce((sum, chunk) => sum + chunk.length, 0));
        let at = 0;
        for (const chunk of heard) { all.set(chunk, at); at += chunk.length; }
        let peak = 0;
        for (const sample of all) peak = Math.max(peak, Math.abs(sample));
        // The loudest 300 ms, stepping 50 ms at a time.
        const size = Math.round(context.sampleRate * 0.3);
        const hop = Math.round(context.sampleRate * 0.05);
        let loudest = 0;
        for (let start = 0; start + size <= all.length; start += hop) {
          let sum = 0;
          for (let index = start; index < start + size; index++) sum += all[index] * all[index];
          loudest = Math.max(loudest, Math.sqrt(sum / size));
        }
        // How long it can be heard at all: from the first to the last 20 ms that rises over -50 dB.
        const step = Math.round(context.sampleRate * 0.02);
        let first = -1;
        let last = -1;
        for (let start = 0; start + step <= all.length; start += step) {
          let top = 0;
          for (let index = start; index < start + step; index++) top = Math.max(top, Math.abs(all[index]));
          if (top > 0.00316) { if (first < 0) first = start; last = start + step; }
        }
        return { name, loud: +dB(loudest).toFixed(1), peak: +dB(peak).toFixed(1), seconds: first < 0 ? 0 : +((last - first) / context.sampleRate).toFixed(2), error };
      };
      const out = [];
      if (${JSON.stringify(voice)}) {
        for (const line of [...audio.lines.keys()]) out.push(await measure(line, () => announce(line), 3));
      } else {
        for (const [name, event, seconds] of ${JSON.stringify(EVENTS)}) out.push(await measure(name, () => handle(event), seconds ?? 1.4));
        // The two sounds that come from the state of the round, not from an event.
        out.push(await measure('last seconds tick', () => tone(880, 0.09, 'square', 0.11), 1));
        out.push(await measure('bomb tick (hot)', () => tone(1600, 0.04, 'square', 0.12), 1));
      }
      return out;
    })()`,
  )) as { name: string; loud: number; peak: number; seconds: number; error: string | null }[];

  const heard = rows.filter(row => Number.isFinite(row.loud));
  const sorted = [...heard].sort((a, b) => a.loud - b.loud);
  const middle = sorted[Math.floor(sorted.length / 2)]?.loud ?? 0;
  console.log(`${voice ? 'The announcer' : 'Event sounds'}, quietest first. The middle one is ${middle} dB.`);
  for (const row of sorted) {
    const marks = [row.loud < middle - FAR ? 'QUIET' : '', row.loud > middle + FAR ? 'LOUD' : '', row.peak > HOT ? 'PEAKS INTO THE LIMITER' : ''].filter(Boolean).join(', ');
    console.log(`${row.name.padEnd(46)} loud ${String(row.loud).padStart(6)} dB   peak ${String(row.peak).padStart(6)} dB   ${String(row.seconds).padStart(5)} s   ${marks}`);
  }
  for (const row of rows.filter(row => !Number.isFinite(row.loud) || row.error)) console.log(`${row.name.padEnd(46)} ${row.error ?? 'SILENT'}`);
} finally {
  await browser.close();
  if (server.pid) process.kill(-server.pid);
}
