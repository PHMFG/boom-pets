import { describe, expect, it } from 'vitest';
import { analyse, emptyPlayer, LOG_FORMAT, readLog, summariseMatch, type MatchLog, type PlayerStats } from './index.ts';

/** A full-detail match of four people, with whatever each test wants changed. */
function match(change: (players: PlayerStats[], log: MatchLog) => void = () => undefined, version = '9.9.9'): MatchLog {
  const players = ['Ana', 'Bia', 'Caio', 'Davi'].map((name, seat) => {
    const player = emptyPlayer(seat, name, false);
    Object.assign(player, { place: seat + 1, score: 30 - seat * 4, roundsWon: seat === 0 ? 2 : 1, aliveSeconds: 90, idleShare: 0.05, firstDashAt: 2, latencyMedianMs: 10, latency95Ms: 30 });
    player.points = { kill: 12, place: player.score - 12, swap: 0, bounty: 0 };
    player.a = { taps: 8, charged: 20, chargeTotal: 15, hits: 14, misses: 14, whileResting: 4, overcharges: 0 };
    player.b = { grabs: 6, misses: 4, throws: 5, throwHits: 1, barrelGrabs: 2, barrelThrows: 2, grabbed: 6, escapes: 2 };
    player.powers = { rolled: 3, cursed: 1, supers: 0, ready: 2, used: 2, heldSeconds: 5 };
    player.knockouts = { dash: 3, throw: 1 };
    player.deaths = { dash: 3, throw: 1, fall: 1 };
    return player;
  });
  const log: MatchLog = {
    format: LOG_FORMAT, version, startedAt: `2026-10-11T10:00:0${Math.floor(Math.random() * 9)}.000Z`, seconds: 150, seed: 1, rounds: 5, players,
    roundStats: [1, 2, 3, 4, 5].map(round => ({ round, seconds: 30, firstKnockoutAt: 9, endedBy: 'knockout' as const, winners: [round === 1 ? 0 : round % 4], knockouts: 4 })),
    eliminations: [],
    eliminationsByCause: { dash: 12, throw: 4, fall: 4 },
    rolls: [{ round: 1, seat: 0, tier: 'common', power: 'rocket', rank: 'middle' }],
    powers: { rocket: { rolled: 4, used: 4, knockouts: 0 } },
    gachas: [],
    roundWinners: [[0], [1], [2], [3], [0]],
    standings: players.map(player => ({ seat: player.seat, score: player.score, place: player.place, award: null })),
  };
  change(players, log);
  return log;
}

describe('reading logs of every age', () => {
  it('reads a log from the first build, which only had scores, knockouts and latency', () => {
    const log = readLog({
      startedAt: '2026-10-09T22:26:40.235Z', seed: 5, rounds: 5,
      players: [
        { seat: 0, name: 'Lia', bot: false, idleShare: 0.09, firstDashAt: 3.3, latencyMedianMs: 7, latency95Ms: 20 },
        { seat: 1, name: 'Robô 1', bot: true, idleShare: null, firstDashAt: 1, latencyMedianMs: null, latency95Ms: null },
      ],
      eliminationsByCause: { dash: 1 },
      eliminations: [{ round: 1, at: 12, seat: 1, cause: 'dash', killer: 0 }],
      rolls: [], roundWinners: [[0]],
      standings: [{ seat: 0, score: 8, place: 1, award: 'thrower' }, { seat: 1, score: 3, place: 2, award: null }],
    });
    expect(log).toMatchObject({ detail: 'basic', version: '0.1.0', format: 0 });
    expect(log.players[0]).toMatchObject({ name: 'Lia', place: 1, score: 8, award: 'thrower', roundsWon: 1, knockouts: { dash: 1 }, a: { taps: 0, charged: 0 } });
    expect(log.players[1]!.deaths).toEqual({ dash: 1 });
  });

  it('reads a log from the builds that counted moves, and maps their counts onto today\'s', () => {
    const log = readLog({
      startedAt: '2026-10-10T14:00:00.000Z', seed: 5, rounds: 5,
      players: [{ seat: 0, name: 'ph', bot: false, idleShare: 0.1, firstDashAt: 1, latencyMedianMs: 8, latency95Ms: 20, moves: { taps: 64, dashes: 19, tired: 269, grabs: 8, grabMisses: 4, throws: 4, powers: 2 } }],
      eliminationsByCause: {}, eliminations: [], rolls: [], roundWinners: [], standings: [{ seat: 0, score: 22, place: 2 }],
    });
    expect(log).toMatchObject({ detail: 'moves', version: '0.2 to 0.4.2' });
    expect(log.players[0]).toMatchObject({ a: { taps: 64, charged: 19, whileResting: 269 }, b: { grabs: 8, misses: 4, throws: 4 }, powers: { used: 2 } });
    expect(log.players[0]).not.toHaveProperty('moves');
    expect(summariseMatch(log)).toContain('Saved by an older build');
  });
});

describe('the report', () => {
  it('has nothing to warn about when the game is in balance', () => {
    // A different winner each time.
    const wonBy = (winner: number) =>
      match((players, log) => {
        players.forEach((player, index) => (player.place = ((index - winner + 4) % 4) + 1));
        log.standings = players.map(player => ({ seat: player.seat, score: 34 - player.place * 4, place: player.place, award: null }));
        players.forEach(player => (player.score = 34 - player.place * 4));
      });
    const report = analyse([wonBy(0), wonBy(1), wonBy(2)]);
    expect(report.build).toBe('9.9.9');
    expect(report.warnings).toEqual([]);
    for (const heading of ['## Build by build', '## Balance of build 9.9.9', '### What each move pays', '### The buttons', '### Rounds', '### Cubes, powers and luck', '### Scores', '## Players, over every build', '## Definition of done']) {
      expect(report.text).toContain(heading);
    }
  });

  it('says so when one move is the answer to everything', () => {
    const thrown = () =>
      match((players, log) => {
        log.eliminationsByCause = { throw: 17, dash: 1, fall: 2 };
        for (const player of players) player.b = { ...player.b, grabs: 10, misses: 30, throws: 8 };
      });
    const { warnings } = analyse([thrown(), thrown()]);
    expect(warnings.some(warning => warning.includes('"Throw a rival" pays'))).toBe(true);
    expect(warnings.some(warning => warning.includes('"throw" is 85% of knockouts'))).toBe(true);
    expect(warnings.some(warning => warning.includes('of throws ended in a knockout'))).toBe(true);
    expect(warnings.some(warning => warning.includes('of grabs missed'))).toBe(true);
  });

  it('says so when a SUPER is not worth getting, and when it decides rounds by itself', () => {
    const weak = analyse([match((_, log) => void (log.powers.kaiju = { rolled: 5, used: 5, knockouts: 1 }))]);
    expect(weak.text).toContain('A SUPER ran 5 times and made 1 knockout (0.20 per run).');
    expect(weak.warnings.some(warning => warning.includes('not worth getting'))).toBe(true);
    const fair = analyse([match((_, log) => void (log.powers.meteorShower = { rolled: 5, used: 5, knockouts: 4 }))]);
    expect(fair.warnings.some(warning => warning.includes('A SUPER made'))).toBe(false);
    const wild = analyse([match((_, log) => void (log.powers.kaiju = { rolled: 4, used: 4, knockouts: 11 }))]);
    expect(wild.warnings.some(warning => warning.includes('decides the round by itself'))).toBe(true);
    // A log from before knockouts were counted per power says nothing either way.
    const old = analyse([match((_, log) => { log.format = 2; log.powers.kaiju = { rolled: 5, used: 5 } as never; })]);
    expect(old.warnings.some(warning => warning.includes('A SUPER made'))).toBe(false);
  });

  it('says so when A is mashed, nobody charges, powers go unused and one player runs away with it', () => {
    const mashed = () =>
      match((players, log) => {
        for (const player of players) {
          player.a = { ...player.a, taps: 40, charged: 2, whileResting: 150 };
          player.powers = { ...player.powers, ready: 4, used: 1, heldSeconds: 12 };
        }
        players[0]!.score = 80;
        log.standings[0]!.score = 80;
      });
    const { warnings } = analyse([mashed(), mashed(), mashed()]);
    expect(warnings.some(warning => warning.includes('of dashes were charged'))).toBe(true);
    expect(warnings.some(warning => warning.includes('while resting for every dash'))).toBe(true);
    expect(warnings.some(warning => warning.includes('of waiting powers were used'))).toBe(true);
    expect(warnings.some(warning => warning.includes('before being used'))).toBe(true);
    expect(warnings.some(warning => warning.includes('runaways'))).toBe(true);
    expect(warnings.some(warning => warning.includes('Ana won 3 of the 3'))).toBe(true);
    expect(warnings.some(warning => warning.includes('Ana tapped A instead of charging'))).toBe(true);
  });

  it('judges the newest build, sets the builds side by side, and can be pointed at another', () => {
    const old = match((_, log) => {
      log.startedAt = '2026-10-01T10:00:00.000Z';
      log.eliminationsByCause = { throw: 18, dash: 2 };
    }, '1.0.0');
    const report = analyse([old, match(), match()]);
    expect(report.build).toBe('9.9.9');
    expect(report.warnings.some(warning => warning.includes('"throw"'))).toBe(false);
    expect(report.text).toMatch(/\| 1\.0\.0 +\| 1 /);
    expect(report.text).toMatch(/\| 9\.9\.9 +\| 2 /);
    expect(analyse([old, match()], { build: '1.0.0' }).warnings.some(warning => warning.includes('"throw" is 90%'))).toBe(true);
  });

  it('leaves bots out of how people played, and still reports a folder with no matches', () => {
    const withBot = match(players => {
      players[3]!.bot = true;
      players[3]!.a.taps = 9999;
    });
    expect(analyse([withBot]).text).not.toContain('9999');
    const empty = analyse([]);
    expect(empty).toMatchObject({ matches: 0, build: null, warnings: [] });
    expect(empty.text).toContain('No matches logged yet');
    expect(empty.text).toContain('not yet  1  Six phones join');
  });
});
