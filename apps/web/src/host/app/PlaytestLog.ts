// Counts everything about a match that the report later judges the game's balance by, from the
// simulation's own events, and sends it to the relay when the match ends. The relay saves one log per
// match in `playtests/` with a readable summary beside it. `@boom/stats` defines what a log holds.
import type { Game, GameEvent, SampledInput } from '@boom/game';
import { POWERS, rankOf, tuning } from '@boom/game';
import type { SeatInfo } from '@boom/protocol';
import { emptyPlayer, LOG_FORMAT, type CauseName, type MatchLog, type PlayerStats, type RoundStats } from '@boom/stats';
import { VERSION } from '../../shared/version';

type Seat = {
  stats: PlayerStats;
  idleSeconds: number;
  playSeconds: number;
  latency: number[];
  /** Round time since which this seat has been on the platform, or null while it is out. */
  aliveSince: number | null;
  /** Round time at which a power began waiting on its button. */
  readyAt: number | null;
};
type RoundCount = { firstKnockoutAt: number | null; knockouts: number; winners: number[] };

const round2 = (value: number) => Number(value.toFixed(2));

export class PlaytestLog {
  private startedAt = '';
  private seed = 0;
  private rounds = 0;
  private readonly seats = new Map<number, Seat>();
  private eliminations: MatchLog['eliminations'] = [];
  private rolls: MatchLog['rolls'] = [];
  private powers: MatchLog['powers'] = {};
  private gachas: MatchLog['gachas'] = [];
  /** The power each seat started last: a knockout "by power" is that power's doing. */
  private readonly lastPower = new Map<number, string>();
  private roundStats: RoundStats[] = [];
  private winners: number[][] = [];
  private current: RoundCount = { firstKnockoutAt: null, knockouts: 0, winners: [] };
  /** Follows the phase events, so the knockout that ends a round still counts as part of it. */
  private playing = false;

  begin(game: Game, seed: number): void {
    this.startedAt = new Date().toISOString();
    this.seed = seed;
    this.rounds = game.rounds;
    this.seats.clear();
    for (const seat of game.seats) {
      this.seats.set(seat.seat, { stats: emptyPlayer(seat.seat, seat.name, seat.bot !== null), idleSeconds: 0, playSeconds: 0, latency: [], aliveSince: null, readyAt: null });
    }
    this.eliminations = [];
    this.rolls = [];
    this.powers = {};
    this.gachas = [];
    this.lastPower.clear();
    this.roundStats = [];
    this.winners = [];
    this.playing = false;
  }

  /**
   * Call once per tick during play with each human's input: no stick and no buttons counts as idle.
   * `frozen` is a tick in which standing still is the game (the cat is looking): it is not counted either way.
   */
  sampleInput(seat: number, input: SampledInput, frozen = false): void {
    const log = this.seats.get(seat);
    if (!log || frozen) return;
    log.playSeconds += tuning.STEP;
    if (Math.hypot(input.x, input.y) < 0.1 && !input.a && !input.b) log.idleSeconds += tuning.STEP;
  }

  sampleLatency(roster: SeatInfo[]): void {
    for (const seat of roster) if (seat.rtt !== null) this.seats.get(seat.seat)?.latency.push(seat.rtt);
  }

  handle(event: GameEvent, game: Game): void {
    if (event.t === 'phase') {
      if (event.phase === 'play') {
        this.playing = true;
        this.current = { firstKnockoutAt: null, knockouts: 0, winners: [] };
        for (const seat of this.seats.values()) {
          seat.aliveSince = 0;
          seat.readyAt = null;
        }
      } else if (this.playing) {
        this.playing = false;
        this.endRound(game);
      }
      return;
    }
    if (!this.playing) return;

    const time = game.round.time;
    const round = game.roundIndex;
    // How the buttons were used is counted for the brawl only: in another game a press of A is a different move,
    // and would be read as a tap that hit nothing.
    const brawl = game.gameMode === 'brawl';
    /** The player behind a pet. Clones do not count as their owner's moves. */
    const of = (pet: number): Seat | undefined => {
      const found = game.round.petById(pet);
      return found && !found.decoy ? this.seats.get(found.seat) : undefined;
    };

    switch (event.t) {
      case 'dash': {
        if (!brawl) break;
        const seat = of(event.pet);
        if (!seat) break;
        seat.stats.a[event.charge < tuning.dash.shoveBelow ? 'taps' : 'charged']++;
        seat.stats.a.chargeTotal = round2(seat.stats.a.chargeTotal + event.charge);
        if (round === 1 && seat.stats.firstDashAt === null) seat.stats.firstDashAt = round2(time);
        break;
      }
      case 'dashEnd': {
        if (!brawl) break;
        const seat = of(event.pet);
        if (seat) seat.stats.a[event.hit ? 'hits' : 'misses']++;
        break;
      }
      case 'tired': {
        if (!brawl) break;
        const seat = of(event.pet);
        if (seat) seat.stats.a.whileResting++;
        break;
      }
      case 'grab': {
        if (!brawl) break;
        const seat = of(event.pet);
        if (seat) seat.stats.b[event.kind === 'pet' ? 'grabs' : 'barrelGrabs']++;
        const victim = event.kind === 'pet' ? of(event.target) : undefined;
        if (victim) victim.stats.b.grabbed++;
        break;
      }
      case 'grabMiss': {
        if (!brawl) break;
        const seat = of(event.pet);
        if (seat) seat.stats.b.misses++;
        break;
      }
      case 'throw': {
        if (!brawl) break;
        const seat = of(event.pet);
        if (seat) seat.stats.b[event.kind === 'pet' ? 'throws' : 'barrelThrows']++;
        break;
      }
      case 'throwHit': {
        if (!brawl) break;
        const seat = event.seat === null ? undefined : this.seats.get(event.seat);
        if (seat) seat.stats.b.throwHits++;
        break;
      }
      case 'escape': {
        if (!brawl) break;
        const seat = of(event.pet);
        if (seat) seat.stats.b.escapes++;
        break;
      }
      case 'eliminated': {
        if (event.decoy) break;
        const cause = event.cause as CauseName;
        this.eliminations.push({ round, at: round2(time), seat: event.seat, cause, killer: event.killer });
        this.current.knockouts++;
        this.current.firstKnockoutAt ??= round2(time);
        const victim = this.seats.get(event.seat);
        if (victim) {
          victim.stats.deaths[cause] = (victim.stats.deaths[cause] ?? 0) + 1;
          if (cause === 'overcharge') victim.stats.a.overcharges++;
          if (victim.aliveSince !== null) victim.stats.aliveSeconds = round2(victim.stats.aliveSeconds + time - victim.aliveSince);
          victim.aliveSince = null;
        }
        const killer = event.killer === null ? undefined : this.seats.get(event.killer);
        if (killer) killer.stats.knockouts[cause] = (killer.stats.knockouts[cause] ?? 0) + 1;
        const power = cause === 'power' && event.killer !== null ? this.lastPower.get(event.killer) : undefined;
        if (power) this.power(power).knockouts++;
        break;
      }
      case 'revengeSwap': {
        const ghost = this.seats.get(event.ghost);
        if (!ghost) break;
        ghost.stats.swaps++;
        // It is back on the platform from this moment.
        ghost.aliveSince = time;
        break;
      }
      case 'meteorCall': {
        // A Meteor Shower also calls meteors; only a ghost's own count as its move.
        if (game.round.ghosts.some(ghost => ghost.seat === event.owner)) {
          const seat = this.seats.get(event.owner);
          if (seat) seat.stats.meteors++;
        }
        break;
      }
      case 'roll': {
        this.rolls.push({ round, seat: event.seat, tier: event.tier, power: event.power, rank: rankOf(game.scores, event.seat) });
        this.power(event.power).rolled++;
        const seat = this.seats.get(event.seat);
        if (!seat) break;
        seat.stats.powers.rolled++;
        if (event.tier === 'cursed') seat.stats.powers.cursed++;
        if (event.tier === 'super') seat.stats.powers.supers++;
        break;
      }
      case 'powerReady': {
        const seat = this.seats.get(event.seat);
        if (!seat) break;
        seat.stats.powers.ready++;
        seat.readyAt = time;
        break;
      }
      case 'powerStart': {
        this.power(event.power).used++;
        this.lastPower.set(event.seat, event.power);
        const seat = this.seats.get(event.seat);
        const tier = POWERS[event.power].tier;
        // Only a power the player chose to start counts as "used": curses and SUPERs start by themselves.
        if (!seat || (tier !== 'common' && tier !== 'rare') || seat.readyAt === null) break;
        seat.stats.powers.used++;
        seat.stats.powers.heldSeconds = round2(seat.stats.powers.heldSeconds + time - seat.readyAt);
        seat.readyAt = null;
        break;
      }
      case 'gachaReveal':
        this.gachas.push({ round, seat: event.seat, jinx: game.gacha?.jinx ?? 0, cursed: event.cursed });
        break;
      case 'score': {
        const seat = this.seats.get(event.seat);
        if (seat) seat.stats.points[event.reason] += event.points;
        break;
      }
      case 'roundWinner':
        this.current.winners = event.seats;
        this.winners.push(event.seats);
        for (const winner of event.seats) {
          const seat = this.seats.get(winner);
          if (seat) seat.stats.roundsWon++;
        }
        break;
      default:
        break;
    }
  }

  /** The finished match as it is saved. */
  build(game: Game): MatchLog {
    const percentile = (values: number[], share: number) => {
      if (values.length === 0) return null;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]!;
    };
    const causes: Record<string, number> = {};
    for (const entry of this.eliminations) causes[entry.cause] = (causes[entry.cause] ?? 0) + 1;
    const players = [...this.seats.values()].map(seat => {
      const standing = game.standings.find(entry => entry.seat === seat.stats.seat);
      return {
        ...seat.stats,
        place: standing?.place ?? 0,
        score: standing?.score ?? 0,
        award: standing?.award ?? null,
        idleShare: seat.playSeconds > 0 ? Number((seat.idleSeconds / seat.playSeconds).toFixed(3)) : null,
        latencyMedianMs: percentile(seat.latency, 0.5),
        latency95Ms: percentile(seat.latency, 0.95),
      };
    });
    return {
      format: LOG_FORMAT,
      version: VERSION,
      startedAt: this.startedAt,
      seconds: round2(this.roundStats.reduce((sum, round) => sum + round.seconds, 0)),
      seed: this.seed,
      rounds: this.rounds,
      players,
      roundStats: this.roundStats,
      eliminations: this.eliminations,
      eliminationsByCause: causes,
      rolls: this.rolls,
      powers: this.powers,
      gachas: this.gachas,
      roundWinners: this.winners,
      standings: game.standings,
    };
  }

  /** Sends the finished match to the relay, which writes it into the playtests folder. */
  save(game: Game): void {
    void fetch('/api/playtest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(this.build(game)) }).catch(() => undefined);
  }

  private power(id: string): MatchLog['powers'][string] {
    return (this.powers[id] ??= { rolled: 0, used: 0, knockouts: 0 });
  }

  private endRound(game: Game): void {
    const length = game.round.time;
    for (const seat of this.seats.values()) {
      if (seat.aliveSince !== null) seat.stats.aliveSeconds = round2(seat.stats.aliveSeconds + length - seat.aliveSince);
      seat.aliveSince = null;
    }
    const metric: Record<number, number> = {};
    for (const seat of this.seats.keys()) {
      const value = game.round.metric(seat);
      if (typeof value === 'number') metric[seat] = value;
    }
    this.roundStats.push({
      round: game.roundIndex,
      mode: game.gameMode,
      metric,
      seconds: round2(length),
      firstKnockoutAt: this.current.firstKnockoutAt,
      endedBy: length >= game.round.cap - tuning.STEP ? 'time' : 'knockout',
      winners: this.current.winners,
      knockouts: this.current.knockouts,
    });
  }
}
