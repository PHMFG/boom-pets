// Plays bot-only matches without a screen and prints pacing numbers, to check a tuning change.
// Usage: pnpm balance [matches=20] [--mode=lava]   (one game only; without it, games are drawn as in a real match)
//        pnpm balance 20 --players=2           (that many players instead of four: people play in twos and in sixes,
//                                               and a game whose rounds depend on who is left is a different length for each)
import { Game, GAME_MODES, initPhysics, type GameMode, type SampledInput } from '../packages/game/src/index.ts';

const matches = Number(process.argv[2]) || 20;
const players = Math.min(6, Math.max(2, Number(process.argv.find(arg => arg.startsWith('--players='))?.split('=')[1]) || 4));
const wanted = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1]?.split(',') ?? [];
const modes = wanted.filter((mode): mode is GameMode => (GAME_MODES as readonly string[]).includes(mode));
if (wanted.length !== modes.length) {
  console.error(`Unknown game in --mode. The games are: ${GAME_MODES.join(', ')}.`);
  process.exit(1);
}
/** For each game: how long its rounds were, how many hit the time cap, how many were ties, and who won. */
const games: Record<string, { seconds: number[]; capped: number; ties: number; winners: Record<number, number> }> = {};
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
  if (players === 4) game.startMatch({ rounds: 5, bots: true, petPool: pets, botName: index => `Bot ${index + 1}`, modes: modes.length > 0 ? modes : undefined });
  else {
    // A match only fills itself with bots up to four. Any other number is seated as people and each handed to a
    // bot, the way the game does for a phone that has gone for good.
    game.setLobbySeats(Array.from({ length: players }, (_, seat) => ({ seat, pet: pets[seat]!, name: `Bot ${seat + 1}`, bot: null })));
    game.startMatch({ rounds: 5, bots: false, petPool: pets, botName: index => `Bot ${index + 1}`, modes: modes.length > 0 ? modes : undefined });
    for (let seat = 0; seat < players; seat++) game.handToBot(seat);
  }
  let sawKnockout = false;
  /** The power each seat started last: a knockout "by power" is that power's doing. */
  const lastPower = new Map<number, string>();
  for (let tick = 0; tick < 60 * 600 && game.phase !== 'matchEnd'; tick++) {
    game.tick(() => idle);
    for (const event of game.events) {
      if (event.t === 'eliminated' && !event.decoy && game.phase === 'play' && game.gameMode === 'brawl') {
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
      else if (event.t === 'roundWinner') {
        const entry = (games[game.gameMode] ??= { seconds: [], capped: 0, ties: 0, winners: {} });
        if (event.seats.length > 1) entry.ties++;
        for (const seat of event.seats) entry.winners[seat] = (entry.winners[seat] ?? 0) + 1;
      } else if (event.t === 'phase' && event.phase === 'roundEnd') {
        const entry = (games[game.gameMode] ??= { seconds: [], capped: 0, ties: 0, winners: {} });
        entry.seconds.push(game.round.time);
        if (game.round.time >= game.round.cap - 0.1) entry.capped++;
        sawKnockout = false;
        // The brawl's own pacing numbers below are from brawl rounds only.
        if (game.gameMode !== 'brawl') continue;
        rounds++;
        roundSeconds.push(game.round.time);
        if (game.round.time >= game.round.cap - 0.1) capped++;
      }
    }
  }
  game.round.free();
}

const average = (values: number[]) => (values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(1);
console.log(`${matches} matches${players === 4 ? '' : ` of ${players} players`}`);
console.log('Each game: rounds, average length, shortest to longest, how many hit the time cap, ties for first, and wins by seat (bots take the seats in a fixed order of styles).');
for (const [mode, entry] of Object.entries(games)) {
  const sorted = [...entry.seconds].sort((a, b) => a - b);
  const wins = Object.entries(entry.winners).map(([seat, times]) => `seat ${Number(seat) + 1}: ${times}`).join(', ');
  console.log(`  ${mode.padEnd(7)} ${String(entry.seconds.length).padStart(4)} rounds, ${average(entry.seconds).padStart(5)} s (${sorted[0]?.toFixed(1)} to ${sorted.at(-1)?.toFixed(1)}), cap ${entry.capped}, ties ${entry.ties}, wins ${wins}`);
}
if (rounds > 0) {
  const sorted = [...roundSeconds].sort((a, b) => a - b);
  console.log(`Bate-Bate, ${rounds} rounds`);
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
}
