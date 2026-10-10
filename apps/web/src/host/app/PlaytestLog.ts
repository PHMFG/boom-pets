// Records what the playtest plan asks for and saves it as one JSON file per match:
// idle time, time to first dash, knockouts by cause, rolls by rank, the winner and latency.
import type { Game, GameEvent, SampledInput, Tier } from '@boom/game';
import { rankOf, tuning } from '@boom/game';
import type { SeatInfo } from '@boom/protocol';

type SeatLog = { name: string; bot: boolean; idleSeconds: number; playSeconds: number; firstDashAt: number | null; latency: number[] };

export class PlaytestLog {
  private startedAt = '';
  private seed = 0;
  private rounds = 0;
  private readonly seats = new Map<number, SeatLog>();
  private eliminations: { round: number; at: number; seat: number; cause: string; killer: number | null }[] = [];
  private rolls: { round: number; seat: number; tier: Tier; power: string; rank: string }[] = [];
  private winners: number[][] = [];

  begin(game: Game, seed: number): void {
    this.startedAt = new Date().toISOString();
    this.seed = seed;
    this.rounds = game.rounds;
    this.seats.clear();
    for (const seat of game.seats) this.seats.set(seat.seat, { name: seat.name, bot: seat.bot !== null, idleSeconds: 0, playSeconds: 0, firstDashAt: null, latency: [] });
    this.eliminations = [];
    this.rolls = [];
    this.winners = [];
  }

  /** Call once per tick during play with each human's input: no stick and no buttons counts as idle. */
  sampleInput(seat: number, input: SampledInput): void {
    const log = this.seats.get(seat);
    if (!log) return;
    log.playSeconds += tuning.STEP;
    if (Math.hypot(input.x, input.y) < 0.1 && !input.a && !input.b) log.idleSeconds += tuning.STEP;
  }

  sampleLatency(roster: SeatInfo[]): void {
    for (const seat of roster) if (seat.rtt !== null) this.seats.get(seat.seat)?.latency.push(seat.rtt);
  }

  handle(event: GameEvent, game: Game): void {
    if (event.t === 'eliminated' && !event.decoy && game.phase === 'play') {
      this.eliminations.push({ round: game.roundIndex, at: Number(game.round.time.toFixed(2)), seat: event.seat, cause: event.cause, killer: event.killer });
    } else if (event.t === 'roll') {
      this.rolls.push({ round: game.roundIndex, seat: event.seat, tier: event.tier, power: event.power, rank: rankOf(game.scores, event.seat) });
    } else if (event.t === 'dash' && game.roundIndex === 1) {
      const seat = game.round.petById(event.pet)?.seat;
      const log = seat === undefined ? undefined : this.seats.get(seat);
      if (log && log.firstDashAt === null) log.firstDashAt = Number(game.round.time.toFixed(2));
    } else if (event.t === 'roundWinner') {
      this.winners.push(event.seats);
    }
  }

  /** Sends the finished match to the relay, which writes it into the playtests folder. */
  save(game: Game): void {
    const percentile = (values: number[], share: number) => {
      if (values.length === 0) return null;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]!;
    };
    const causes: Record<string, number> = {};
    for (const entry of this.eliminations) causes[entry.cause] = (causes[entry.cause] ?? 0) + 1;
    const body = {
      startedAt: this.startedAt,
      seed: this.seed,
      rounds: this.rounds,
      players: [...this.seats].map(([seat, log]) => ({
        seat,
        name: log.name,
        bot: log.bot,
        idleShare: log.playSeconds > 0 ? Number((log.idleSeconds / log.playSeconds).toFixed(3)) : null,
        firstDashAt: log.firstDashAt,
        latencyMedianMs: percentile(log.latency, 0.5),
        latency95Ms: percentile(log.latency, 0.95),
      })),
      eliminationsByCause: causes,
      eliminations: this.eliminations,
      rolls: this.rolls,
      roundWinners: this.winners,
      standings: game.standings,
    };
    void fetch('/api/playtest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
  }
}
