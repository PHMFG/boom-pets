// The shape of one match's log. Everything here is counted by the game screen from the simulation's
// events, except `phones`, which the relay adds because only it sees the connections.
import type { PhoneConnection } from '@boom/protocol';

/** Goes up when a field is added or changes meaning. `readLog` still reads every older log. */
export const LOG_FORMAT = 3;

/** How a pet can be knocked out, in the order reports list them. */
export const CAUSES = ['dash', 'throw', 'barrel', 'meteor', 'power', 'fall', 'overcharge'] as const;
export type CauseName = (typeof CAUSES)[number];
export type ByCause = Partial<Record<CauseName, number>>;

export type PlayerStats = {
  seat: number;
  name: string;
  bot: boolean;
  place: number;
  score: number;
  award: string | null;
  /** Where the score came from. */
  points: { kill: number; place: number; swap: number; bounty: number };
  roundsWon: number;
  /** Seconds on the platform, summed over the rounds. */
  aliveSeconds: number;
  /** Share of its time alive with no stick and no button. */
  idleShare: number | null;
  /** Seconds into the first round before its first dash. */
  firstDashAt: number | null;
  latencyMedianMs: number | null;
  latency95Ms: number | null;
  /** The A button. A tap is a dash below the shove threshold. `chargeTotal` adds up the charge (0 to 1) of every dash. */
  a: { taps: number; charged: number; chargeTotal: number; hits: number; misses: number; whileResting: number; overcharges: number };
  /** The B button. `grabs` and `throws` are of pets; barrels are counted apart. `grabbed` and `escapes` are as the victim. */
  b: { grabs: number; misses: number; throws: number; throwHits: number; barrelGrabs: number; barrelThrows: number; grabbed: number; escapes: number };
  /** `ready` powers waited on the button; `used` of them were started; `heldSeconds` is how long those waited in all. */
  powers: { rolled: number; cursed: number; supers: number; ready: number; used: number; heldSeconds: number };
  /** Knockouts credited to this player, and the ways it was knocked out itself. */
  knockouts: ByCause;
  deaths: ByCause;
  /** As a ghost. */
  meteors: number;
  swaps: number;
};

export type RoundStats = { round: number; seconds: number; firstKnockoutAt: number | null; endedBy: 'knockout' | 'time'; winners: number[]; knockouts: number };

export type MatchLog = {
  format: number;
  /** The build that played it. */
  version: string;
  startedAt: string;
  /** Seconds of play, countdowns and pauses between rounds left out. */
  seconds: number;
  seed: number;
  rounds: number;
  players: PlayerStats[];
  roundStats: RoundStats[];
  eliminations: { round: number; at: number; seat: number; cause: string; killer: number | null }[];
  eliminationsByCause: Record<string, number>;
  rolls: { round: number; seat: number; tier: string; power: string; rank: string }[];
  /** For each power: how often it was rolled, how often it actually ran, and how many rivals it knocked out (counted from format 3 on). */
  powers: Record<string, { rolled: number; used: number; knockouts: number }>;
  gachas: { round: number; seat: number; jinx: number; cursed: boolean }[];
  roundWinners: number[][];
  standings: { seat: number; score: number; place: number; award?: string | null }[];
  phones?: PhoneConnection[];
};

/**
 * How much a log knows. `full` has every counter. `moves` (builds 0.2.0 to 0.4.2) counted only taps,
 * charged dashes, grabs, throws and powers used. `basic` (0.1.0) has scores, knockouts and latency.
 */
export type Detail = 'full' | 'moves' | 'basic';
export type ReadLog = MatchLog & { detail: Detail };

export function emptyPlayer(seat: number, name: string, bot: boolean): PlayerStats {
  return {
    seat, name, bot, place: 0, score: 0, award: null,
    points: { kill: 0, place: 0, swap: 0, bounty: 0 },
    roundsWon: 0, aliveSeconds: 0, idleShare: null, firstDashAt: null, latencyMedianMs: null, latency95Ms: null,
    a: { taps: 0, charged: 0, chargeTotal: 0, hits: 0, misses: 0, whileResting: 0, overcharges: 0 },
    b: { grabs: 0, misses: 0, throws: 0, throwHits: 0, barrelGrabs: 0, barrelThrows: 0, grabbed: 0, escapes: 0 },
    powers: { rolled: 0, cursed: 0, supers: 0, ready: 0, used: 0, heldSeconds: 0 },
    knockouts: {}, deaths: {}, meteors: 0, swaps: 0,
  };
}

type OldMoves = { taps: number; dashes: number; tired: number; grabs: number; grabMisses: number; throws: number; powers: number };
type OldPlayer = Partial<PlayerStats> & { seat: number; name: string; bot: boolean; moves?: OldMoves };

/** Reads a saved log of any age into today's shape, filling what an older build did not count with zeros. */
export function readLog(raw: unknown): ReadLog {
  const log = raw as Omit<Partial<MatchLog>, 'players'> & { players: OldPlayer[] };
  const standings = log.standings ?? [];
  const eliminations = log.eliminations ?? [];
  const full = (log.format ?? 0) >= 2;
  const moves = !full && log.players.some(player => player.moves !== undefined);
  const players = log.players.map(old => {
    const player = { ...emptyPlayer(old.seat, old.name, old.bot), ...old } as PlayerStats & { moves?: OldMoves };
    const standing = standings.find(entry => entry.seat === old.seat);
    if (!full) {
      player.place = standing?.place ?? 0;
      player.score = standing?.score ?? 0;
      player.award = standing?.award ?? null;
      player.roundsWon = (log.roundWinners ?? []).filter(seats => seats.includes(old.seat)).length;
      for (const out of eliminations) {
        const cause = out.cause as CauseName;
        if (out.seat === old.seat) player.deaths[cause] = (player.deaths[cause] ?? 0) + 1;
        if (out.killer === old.seat) player.knockouts[cause] = (player.knockouts[cause] ?? 0) + 1;
      }
      if (old.moves) {
        player.a = { ...player.a, taps: old.moves.taps, charged: old.moves.dashes, whileResting: old.moves.tired };
        player.b = { ...player.b, grabs: old.moves.grabs, misses: old.moves.grabMisses, throws: old.moves.throws };
        player.powers = { ...player.powers, used: old.moves.powers };
      }
    }
    delete player.moves;
    return player;
  });
  return {
    format: log.format ?? (moves ? 1 : 0),
    // Builds before 0.4.3 did not write their version. Which counters a log has tells the two eras apart.
    version: log.version ?? (moves ? '0.2 to 0.4.2' : '0.1.0'),
    startedAt: log.startedAt ?? '',
    seconds: log.seconds ?? 0,
    seed: log.seed ?? 0,
    rounds: log.rounds ?? 0,
    players,
    roundStats: log.roundStats ?? [],
    eliminations,
    eliminationsByCause: log.eliminationsByCause ?? {},
    rolls: log.rolls ?? [],
    powers: Object.fromEntries(Object.entries(log.powers ?? {}).map(([power, uses]) => [power, { ...uses, knockouts: uses.knockouts ?? 0 }])),
    gachas: log.gachas ?? [],
    roundWinners: log.roundWinners ?? [],
    standings,
    phones: log.phones,
    detail: full ? 'full' : moves ? 'moves' : 'basic',
  };
}
