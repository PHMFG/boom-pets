// Plays bot-only matches without a screen and prints pacing numbers, to check a tuning change.
// Usage: pnpm balance [matches=20]
import { Game, initPhysics, type SampledInput } from '../packages/game/src/index.ts';

const matches = Number(process.argv[2]) || 20;
const idle: SampledInput = { x: 0, y: 0, a: false, b: false, stale: false, edges: [] };
const pets = ['fox', 'cat', 'dog', 'pig', 'cow', 'bee'];

await initPhysics();
const roundSeconds: number[] = [];
const firstKnockout: number[] = [];
const causes: Record<string, number> = {};
const tiers: Record<string, number> = {};
let rounds = 0;
let capped = 0;
let supers = 0;
let curses = 0;
let swaps = 0;
/** For each power: how often it ran, and how many knockouts it made. */
const powers: Record<string, { ran: number; knockouts: number }> = {};

for (let seed = 1; seed <= matches; seed++) {
  const game = new Game(seed * 977);
  game.startMatch({ rounds: 5, bots: true, petPool: pets, botName: index => `Bot ${index + 1}` });
  let sawKnockout = false;
  /** The power each seat started last: a knockout "by power" is that power's doing. */
  const lastPower = new Map<number, string>();
  for (let tick = 0; tick < 60 * 600 && game.phase !== 'matchEnd'; tick++) {
    game.tick(() => idle);
    for (const event of game.events) {
      if (event.t === 'eliminated' && !event.decoy && game.phase === 'play') {
        causes[event.cause] = (causes[event.cause] ?? 0) + 1;
        if (!sawKnockout) firstKnockout.push(game.round.time);
        sawKnockout = true;
        const power = event.cause === 'power' && event.killer !== null ? lastPower.get(event.killer) : undefined;
        if (power) powers[power]!.knockouts++;
      } else if (event.t === 'powerStart') {
        (powers[event.power] ??= { ran: 0, knockouts: 0 }).ran++;
        lastPower.set(event.seat, event.power);
      } else if (event.t === 'roll') tiers[event.tier] = (tiers[event.tier] ?? 0) + 1;
      else if (event.t === 'gachaReveal') event.cursed ? curses++ : supers++;
      else if (event.t === 'revengeSwap') swaps++;
      else if (event.t === 'phase' && event.phase === 'roundEnd') {
        rounds++;
        roundSeconds.push(game.round.time);
        if (game.round.time >= 74.9) capped++;
        sawKnockout = false;
      }
    }
  }
  game.round.free();
}

const average = (values: number[]) => (values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(1);
const sorted = [...roundSeconds].sort((a, b) => a - b);
console.log(`${matches} matches, ${rounds} rounds`);
console.log(`Round length: average ${average(roundSeconds)} s, shortest ${sorted[0]?.toFixed(1)} s, longest ${sorted.at(-1)?.toFixed(1)} s, hit the time cap ${capped} times`);
console.log(`First knockout: average ${average(firstKnockout)} s into the round`);
console.log('Knockouts by cause:', causes);
console.log('Rolls by tier:', tiers, `| SUPER ${supers}, SUPER ZICA ${curses}, revenge swaps ${swaps}`);
console.log(
  'Knockouts per run of a power:',
  Object.entries(powers)
    .filter(([, power]) => power.knockouts > 0 || power.ran > 0)
    .map(([name, power]) => `${name} ${(power.knockouts / Math.max(1, power.ran)).toFixed(2)} (${power.knockouts} in ${power.ran})`)
    .join(', '),
);
