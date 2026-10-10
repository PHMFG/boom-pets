import { Game, initPhysics, type GameMode, type SampledInput } from '@boom/game';
import { LOG_FORMAT, readLog, summariseMatch } from '@boom/stats';
import { beforeAll, describe, expect, it } from 'vitest';
import { PlaytestLog } from './PlaytestLog';

const idle: SampledInput = { x: 0, y: 0, a: false, b: false, stale: false, edges: [] };
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const count = (by: Record<string, number | undefined>) => sum(Object.values(by).map(value => value ?? 0));

beforeAll(() => initPhysics());

/** A whole bot match, with every event fed to the log the way the game screen feeds it. */
function playAndLog(seed: number, rounds: number, modes: readonly GameMode[] = ['brawl']) {
  const game = new Game(seed);
  const log = new PlaytestLog();
  game.startMatch({ rounds, bots: true, petPool: ['fox', 'cat', 'dog', 'pig'], botName: index => `Bot ${index + 1}`, modes });
  log.begin(game, seed);
  for (const event of game.events) log.handle(event, game);
  for (let tick = 0; tick < rounds * 110 * 60 && game.phase !== 'matchEnd'; tick++) {
    game.tick(() => idle);
    for (const event of game.events) log.handle(event, game);
  }
  const built = log.build(game);
  game.round.free();
  return built;
}

describe('the match log', () => {
  it('adds up: every knockout, point and second is accounted for', () => {
    const log = playAndLog(7, 3);
    expect(log).toMatchObject({ format: LOG_FORMAT, version: 'test', rounds: 3, seed: 7 });
    expect(log.players).toHaveLength(4);
    expect(log.roundStats.map(round => round.round)).toEqual([1, 2, 3]);

    // Each knockout is one death, and at most one credited knockout.
    expect(sum(log.players.map(player => count(player.deaths)))).toBe(log.eliminations.length);
    expect(sum(log.players.map(player => count(player.knockouts)))).toBe(log.eliminations.filter(out => out.killer !== null).length);
    expect(count(log.eliminationsByCause)).toBe(log.eliminations.length);
    expect(sum(log.roundStats.map(round => round.knockouts))).toBe(log.eliminations.length);

    for (const player of log.players) {
      // A score is exactly the points it was given, by reason.
      expect(player.points.kill + player.points.place + player.points.swap + player.points.bounty, `${player.name}'s points`).toBe(player.score);
      expect(player.place).toBeGreaterThan(0);
      // A dash ends once, hit or miss, unless the pet was knocked out of it.
      expect(player.a.hits + player.a.misses).toBeLessThanOrEqual(player.a.taps + player.a.charged);
      expect(player.a.chargeTotal).toBeLessThanOrEqual(player.a.taps + player.a.charged);
      // Nobody is on the platform longer than the match was played.
      expect(player.aliveSeconds).toBeGreaterThan(0);
      expect(player.aliveSeconds).toBeLessThanOrEqual(log.seconds + 0.1);
      expect(player.b.throws).toBeLessThanOrEqual(player.b.grabs);
      expect(player.powers.used).toBeLessThanOrEqual(player.powers.ready);
    }
    // Someone is grabbed exactly as often as someone grabs.
    expect(sum(log.players.map(player => player.b.grabbed))).toBe(sum(log.players.map(player => player.b.grabs)));
    expect(sum(log.players.map(player => player.roundsWon))).toBeGreaterThanOrEqual(3);
    expect(sum(log.players.map(player => player.powers.rolled))).toBe(log.rolls.length);
    expect(sum(Object.values(log.powers).map(power => power.rolled))).toBe(log.rolls.length);
    // Every knockout a power is credited with is one of the knockouts "by power".
    expect(sum(Object.values(log.powers).map(power => power.knockouts))).toBeLessThanOrEqual(log.eliminationsByCause.power ?? 0);
    for (const round of log.roundStats) {
      expect(round.seconds).toBeGreaterThan(0);
      if (round.firstKnockoutAt !== null) expect(round.firstKnockoutAt).toBeLessThanOrEqual(round.seconds);
    }
  });

  it('says which game each round was, with the game\'s own numbers, and keeps the brawl\'s counts to the brawl', () => {
    const log = playAndLog(5, 2, ['paint', 'brawl']);
    expect(log.roundStats.map(round => round.mode)).toEqual(['paint', 'brawl']);
    const [paint, brawl] = log.roundStats;
    // Every seat painted something, nobody was knocked out, and the clock ended it.
    expect(Object.keys(paint!.metric)).toHaveLength(4);
    expect(Object.values(paint!.metric).every(tiles => tiles > 0)).toBe(true);
    expect(paint!.knockouts).toBe(0);
    expect(paint!.endedBy).toBe('time');
    expect(brawl!.metric).toEqual({});
    expect(log.eliminations.every(entry => entry.round === 2)).toBe(true);
    // Points from both games add up to the score, as ever.
    for (const player of log.players) expect(player.points.kill + player.points.place + player.points.swap + player.points.bounty).toBe(player.score);
    const summary = summariseMatch(log);
    expect(summary).toContain('| paint');
    expect(readLog(JSON.parse(JSON.stringify(log))).roundStats[0]).toMatchObject({ mode: 'paint' });
  });

  it('is the same log every time for the same seed', () => {
    const strip = (log: ReturnType<typeof playAndLog>) => ({ ...log, startedAt: '' });
    expect(strip(playAndLog(11, 2))).toEqual(strip(playAndLog(11, 2)));
  });

  it('reads back as a full log and writes out as a summary a person can read', () => {
    const log = playAndLog(7, 2);
    const read = readLog(JSON.parse(JSON.stringify(log)));
    expect(read.detail).toBe('full');
    const summary = summariseMatch(log);
    for (const heading of ['## Result', '## How each player used the buttons', '## Knockouts', '## Rounds', '## Cubes and powers']) expect(summary).toContain(heading);
    for (const player of log.players) expect(summary).toContain(player.name);
  });
});
