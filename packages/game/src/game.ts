// The whole game: the lobby, then a match of several rounds with scores, bots, slow motion and the gacha.
// `tick` advances one sixtieth of a real second. Physics runs inside it at the current game speed,
// so slow motion is simply fewer physics steps, and the result depends only on the seed and the inputs.
import { BotBrain } from './bots';
import type { ButtonEdge, SampledInput } from './input';
import { pickPower, rollTier, SUPER_CURSE } from './odds';
import { createRng, type Rng } from './rng';
import { Field } from './minis/field';
import { makeRules } from './minis';
import { Round } from './round';
import type { AnyRound } from './rounds';
import { assignAwards, emptyStats, placementPoints, rankOf, standings, type SeatStats } from './scoring';
import { gacha as gachaTune, match, STEP } from './tuning';
import type { BotStyle, GachaView, GameEvent, GameMode, Phase, PowerId, SeatSetup, Standing } from './types';

const BOT_STYLES: readonly BotStyle[] = ['coward', 'kamikaze', 'thrower'];
const NEUTRAL: SampledInput = { x: 0, y: 0, a: false, b: false, stale: true, edges: [] };
/** The games a match can draw. A game joins this list when it can be played from start to finish. */
export const PLAYABLE_MODES: readonly GameMode[] = ['brawl', 'paint'];

export type MatchOptions = {
  rounds: number;
  /** Fill empty seats with bots, up to four players. */
  bots: boolean;
  /** Pet ids bots may use. */
  petPool: readonly string[];
  botName(index: number): string;
  /** The game of each round, in order, instead of drawing them. One entry is repeated for every round. For tests and tools. */
  modes?: readonly GameMode[];
};

export class Game {
  phase: Phase = 'lobby';
  round: AnyRound;
  /** 1 for the first round of a match; 0 in the lobby. */
  roundIndex = 0;
  rounds: number = match.rounds;
  /** Real seconds left in a timed phase (intro, countdown, round end, finale). */
  phaseLeft = 0;
  /** The game of the round being played, or about to be. In the lobby, the brawl. */
  gameMode: GameMode = 'brawl';
  /** During an intro: false while the roulette still spins, true once the game is drawn and its round built. */
  revealed = true;
  seats: SeatSetup[] = [];
  readonly scores = new Map<number, number>();
  /** Mystery Cube rolls since each seat's last SUPER. */
  readonly pity = new Map<number, number>();
  /** The seat currently leading, worth extra points to knock out. */
  bounty: number | null = null;
  gacha: GachaView | null = null;
  standings: Standing[] = [];
  /** Current game speed: 1 normally, lower during slow motion. */
  dilation = 1;
  /** How far into the next physics step the game is, 0 to 1, for drawing between steps. */
  stepFraction = 0;
  /** Everything that happened during the latest tick. */
  events: GameEvent[] = [];

  private readonly seed: number;
  private readonly rolls: Rng;
  private readonly botRng: Rng;
  private readonly modeRng: Rng;
  private spawns: Rng;
  /** Games still to come before every game has had a turn. */
  private bag: GameMode[] = [];
  private forced: readonly GameMode[] | null = null;
  /** Games already explained once in this session: their card is shorter the next time. */
  private readonly seen = new Set<GameMode>();
  private matches = 0;
  private finaleShown = 0;
  private readonly brains = new Map<number, BotBrain>();
  private readonly stats = new Map<number, SeatStats>();
  private readonly roundKills = new Map<number, number>();
  private readonly latest = new Map<number, SampledInput>();
  private readonly edges = new Map<number, ButtonEdge[]>();
  private gachaPet = 0;
  /** The brawl round a gacha is playing in. */
  private gachaRound: Round | null = null;
  private slowLeft = 0;
  private slowScale = 1;
  private sinceSlow = Infinity;
  private lastCount = 0;
  private roundsMade = 0;

  constructor(seed: number) {
    this.seed = seed;
    this.rolls = createRng(seed, 'rolls');
    this.botRng = createRng(seed, 'bots');
    // Made once, so a rematch draws a new order of games instead of repeating the last one.
    this.modeRng = createRng(seed, 'modes');
    this.spawns = createRng(seed, 'spawns');
    this.round = this.newRound('lobby');
  }

  get isFinalRound(): boolean {
    return this.phase !== 'lobby' && this.roundIndex === this.rounds;
  }

  /** Seconds left before the round is called. */
  get timeLeft(): number {
    return Math.max(0, this.round.cap - this.round.time);
  }

  /** Lobby only: who is on the platform. Joins, leaves and pet changes show at once. */
  setLobbySeats(seats: readonly SeatSetup[]): void {
    if (this.phase !== 'lobby') return;
    this.seats = [...seats];
    // Bots in the lobby are the brawl behind the title screen. Each keeps its brain for as long as it stays.
    for (const seat of [...this.brains.keys()]) if (!seats.some(wanted => wanted.seat === seat && wanted.bot)) this.brains.delete(seat);
    for (const seat of seats) if (seat.bot && !this.brains.has(seat.seat)) this.brains.set(seat.seat, new BotBrain(seat.seat, seat.bot, this.botRng));
    if (this.round.gameMode === 'brawl') this.round.syncSeats(seats);
  }

  startMatch(options: MatchOptions): void {
    const seats = this.seats.filter(seat => seat.bot === null);
    const taken = new Set(seats.map(seat => seat.pet));
    const free = options.petPool.filter(pet => !taken.has(pet));
    for (let seat = 0, bots = 0; options.bots && seats.length < match.fillTo && seat < 6; seat++) {
      if (seats.some(existing => existing.seat === seat)) continue;
      const pet = free.splice(this.botRng.int(Math.max(1, free.length)), 1)[0] ?? options.petPool[0] ?? '';
      seats.push({ seat, pet, name: options.botName(bots), bot: BOT_STYLES[bots % BOT_STYLES.length]! });
      bots++;
    }
    this.seats = seats.sort((a, b) => a.seat - b.seat);
    this.rounds = options.rounds;
    this.forced = options.modes && options.modes.length > 0 ? options.modes : null;
    this.matches++;
    this.roundIndex = 0;
    this.bounty = null;
    this.standings = [];
    this.scores.clear();
    this.pity.clear();
    this.stats.clear();
    this.brains.clear();
    for (const seat of this.seats) {
      this.scores.set(seat.seat, 0);
      this.pity.set(seat.seat, 0);
      this.stats.set(seat.seat, emptyStats());
      if (seat.bot) this.brains.set(seat.seat, new BotBrain(seat.seat, seat.bot, this.botRng));
    }
    this.startIntro();
  }

  /** A player whose phone is gone for good is played by a bot for the rest of the match. */
  handToBot(seat: number): void {
    const setup = this.seats.find(candidate => candidate.seat === seat);
    if (!setup || this.phase === 'lobby' || this.brains.has(seat)) return;
    setup.bot = 'coward';
    this.brains.set(seat, new BotBrain(seat, 'coward', this.botRng));
  }

  returnToLobby(): void {
    this.round.free();
    this.phase = 'lobby';
    this.roundIndex = 0;
    this.gameMode = 'brawl';
    this.revealed = true;
    this.gacha = null;
    this.slowLeft = 0;
    this.brains.clear();
    this.seats = this.seats.filter(seat => seat.bot === null);
    this.round = this.newRound('lobby');
    this.emit({ t: 'phase', phase: 'lobby', round: 0 });
  }

  /** Advances one sixtieth of a real second. `read` gives each human seat's input. */
  tick(read: (seat: number) => SampledInput): void {
    this.events = [];
    this.sinceSlow += STEP;

    const winner = this.gacha?.seat ?? null;
    for (const seat of this.seats) {
      const brain = this.brains.get(seat.seat);
      const input = brain ? brain.input(this.round, winner) : read(seat.seat);
      this.latest.set(seat.seat, input);
      // Physics may not step this tick (slow motion), so presses wait here until a step takes them.
      if (input.edges.length > 0) this.edges.set(seat.seat, [...(this.edges.get(seat.seat) ?? []), ...input.edges]);
      if (this.gacha) this.gachaInput(seat.seat, input);
    }

    if (this.phase === 'intro') this.tickIntro();
    else if (this.phase === 'countdown') this.tickCountdown();
    else if (this.phase === 'roundEnd') this.tickRoundEnd();
    else if (this.phase === 'finale') this.tickFinale();
    if (this.gacha) this.tickGacha();

    this.slowLeft = Math.max(0, this.slowLeft - STEP);
    // Speed returns over the last moments of a slow-motion beat instead of snapping back.
    const easing = this.slowLeft > 0 ? Math.min(1, this.slowLeft / 0.15) : 0;
    this.dilation = this.gacha ? gachaTune.dilation : 1 + (this.slowScale - 1) * easing;

    this.stepFraction += this.dilation;
    while (this.stepFraction >= 1) {
      this.stepFraction -= 1;
      this.round.step(seat => this.inputFor(seat));
      if (this.round.gameMode === 'brawl' && this.round.superPending && !this.gacha) this.startGacha(this.round);
      if (this.phase === 'play' && this.round.finished) this.endRound();
    }
  }

  // ── Rounds ─────────────────────────────────────────────────────────────────

  private newRound(mode: 'lobby' | 'match'): AnyRound {
    // A different stream for every round of every match, so a rematch does not repeat its maps.
    this.spawns = createRng(this.seed + this.roundIndex * 7919 + Math.max(0, this.matches - 1) * 104_729, 'spawns');
    const firstId = 1 + this.roundsMade++ * 100_000;
    // The lobby is always the brawl's platform. In a match, each game brings its own kind of round.
    if (mode === 'match' && this.gameMode !== 'brawl') {
      return new Field(makeRules(this.gameMode), this.seats, this.spawns, { emit: event => this.emit(event) }, firstId);
    }
    return new Round(mode, this.seats, this.spawns, {
      emit: event => this.emit(event),
      roll: seat => this.roll(seat),
      freeCommon: () => pickPower(this.rolls, 'common'),
      blastBonus: seat => (this.phase !== 'lobby' && rankOf(this.scores, seat) === 'last' ? match.underdogRadius : 1),
    }, firstId);
  }

  /**
   * The screen between games. A roulette spins over whatever was on stage; then the next game is drawn,
   * its round is built, and its card explains it while the pets drop in. All timed here, so it never waits
   * for anyone and a fast-forwarded match passes through it.
   */
  private startIntro(): void {
    this.roundIndex++;
    this.roundKills.clear();
    this.gacha = null;
    this.edges.clear();
    this.revealed = false;
    this.phase = 'intro';
    this.phaseLeft = match.introRoulette;
    this.emit({ t: 'phase', phase: 'intro', round: this.roundIndex });
  }

  private tickIntro(): void {
    this.phaseLeft -= STEP;
    if (this.phaseLeft > 0) return;
    if (this.revealed) return this.startCountdown();
    // The game is drawn only now: nothing on a screen or a phone can give it away while the roulette spins.
    this.gameMode = this.drawMode();
    const first = !this.seen.has(this.gameMode);
    this.seen.add(this.gameMode);
    this.round.free();
    this.round = this.newRound('match');
    this.brains.forEach(brain => brain.reset());
    this.revealed = true;
    this.phaseLeft = first ? match.introCardFirst : match.introCard;
    this.emit({ t: 'reveal', mode: this.gameMode, round: this.roundIndex, final: this.isFinalRound, first });
  }

  /** The next game: the one a test asked for, or the next out of the bag, which is refilled when every game has had its turn. */
  private drawMode(): GameMode {
    if (this.forced) return this.forced[Math.min(this.roundIndex - 1, this.forced.length - 1)]!;
    if (this.bag.length === 0) {
      const last = this.gameMode;
      this.bag = [...PLAYABLE_MODES];
      for (let index = this.bag.length - 1; index > 0; index--) {
        const other = this.modeRng.int(index + 1);
        [this.bag[index], this.bag[other]] = [this.bag[other]!, this.bag[index]!];
      }
      // The same game twice in a row, across a refill, would look like a mistake.
      if (this.bag.length > 1 && this.bag.at(-1) === last && this.roundIndex > 1) this.bag.unshift(this.bag.pop()!);
    }
    return this.bag.pop()!;
  }

  private startCountdown(): void {
    this.phase = 'countdown';
    this.phaseLeft = match.countdown;
    this.lastCount = match.countdown + 1;
    this.emit({ t: 'phase', phase: 'countdown', round: this.roundIndex });
  }

  private tickCountdown(): void {
    this.phaseLeft -= STEP;
    const count = Math.ceil(this.phaseLeft);
    if (count !== this.lastCount && count > 0) {
      this.lastCount = count;
      this.emit({ t: 'countdown', n: count });
    }
    if (this.phaseLeft > 0) return;
    // Whatever was pressed while waiting is forgotten: nobody dashes or jumps by accident at GO.
    this.edges.clear();
    this.phase = 'play';
    this.round.playing = true;
    this.emit({ t: 'countdown', n: 0 });
    this.emit({ t: 'phase', phase: 'play', round: this.roundIndex });
  }

  private endRound(): void {
    this.round.playing = false;
    const factor = this.isFinalRound ? match.finalRoundFactor : 1;
    // Best first; seats in one group tied. Each kind of round knows how its own places are decided.
    const groups = this.round.ranking();
    for (const [seat, points] of placementPoints(groups, factor)) {
      if (points === 0) continue;
      const pet = this.round.petOfSeat(seat);
      this.addScore(seat, points, 'place', pet?.x ?? null, pet?.z ?? null);
    }
    // Winning a brawl without knocking anyone out is its own kind of luck.
    if (this.round.gameMode === 'brawl') {
      for (const seat of groups[0] ?? []) {
        if ((this.roundKills.get(seat) ?? 0) === 0) this.stat(seat, 'accident', 1);
      }
    }
    this.emit({ t: 'roundWinner', seats: groups[0] ?? [] });

    const best = Math.max(...this.scores.values());
    const leaders = [...this.scores].filter(([, score]) => score === best).map(([seat]) => seat);
    const bounty = best > 0 ? (this.bounty !== null && leaders.includes(this.bounty) ? this.bounty : leaders[0]!) : null;
    if (bounty !== this.bounty) {
      this.bounty = bounty;
      this.emit({ t: 'bounty', seat: bounty });
    }

    // The deciding blow always gets its slow-motion moment.
    this.slow(0.2, 1);
    this.phase = 'roundEnd';
    this.phaseLeft = match.roundEnd;
    this.emit({ t: 'phase', phase: 'roundEnd', round: this.roundIndex });
  }

  private tickRoundEnd(): void {
    this.phaseLeft -= STEP;
    if (this.phaseLeft > 0) return;
    if (this.roundIndex < this.rounds) return this.startIntro();
    this.standings = standings(this.scores, assignAwards(this.stats));
    this.finaleShown = 0;
    this.phase = 'finale';
    this.phaseLeft = match.finale;
    this.emit({ t: 'phase', phase: 'finale', round: this.roundIndex });
  }

  /** The finale shows third place, then second, then the winner, each at its moment, and then hands over to the results. */
  private tickFinale(): void {
    this.phaseLeft -= STEP;
    const elapsed = match.finale - this.phaseLeft;
    while (this.finaleShown < match.finaleReveal.length && elapsed >= match.finaleReveal[this.finaleShown]!) {
      const place = (3 - this.finaleShown) as 1 | 2 | 3;
      this.finaleShown++;
      const seats = this.standings.filter(entry => entry.place === place).map(entry => entry.seat);
      // With a tie for first there is no second place, and a duel has no third.
      if (seats.length > 0) this.emit({ t: 'finale', place, seats });
    }
    if (this.phaseLeft > 0) return;
    this.phase = 'matchEnd';
    this.emit({ t: 'phase', phase: 'matchEnd', round: this.roundIndex });
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private inputFor(seat: number): SampledInput {
    if (this.phase === 'intro' || this.phase === 'countdown' || this.phase === 'finale') return NEUTRAL;
    const input = this.latest.get(seat) ?? NEUTRAL;
    let edges = this.edges.get(seat) ?? [];
    this.edges.delete(seat);
    // During a gacha, A belongs to the lever and to ZICA, not to dashes or meteors.
    if (this.gacha) edges = edges.filter(edge => edge.button !== 'a');
    return { ...input, edges };
  }

  // ── Scoring and stats ──────────────────────────────────────────────────────

  private emit(event: GameEvent): void {
    this.events.push(event);
    if (this.phase === 'lobby') return;
    const factor = this.isFinalRound ? match.finalRoundFactor : 1;
    switch (event.t) {
      case 'eliminated':
        if (event.decoy || this.phase !== 'play') break;
        if (event.cause === 'overcharge') this.stat(event.seat, 'selfDestruct', 1);
        if (event.cause === 'fall') this.stat(event.seat, 'faller', 1);
        if (event.killer !== null) {
          this.roundKills.set(event.killer, (this.roundKills.get(event.killer) ?? 0) + 1);
          this.addScore(event.killer, match.killPoints * factor, 'kill', event.x, event.z);
          if (event.seat === this.bounty) this.addScore(event.killer, match.bountyPoints * factor, 'bounty', event.x, event.z);
        }
        if (this.sinceSlow >= match.slowMoGap) this.slow(match.slowMo, match.slowMoTime);
        break;
      case 'revengeSwap':
        if (this.phase === 'play') this.addScore(event.ghost, match.swapPoints * factor, 'swap', null, null);
        break;
      case 'throw':
        if (event.kind === 'pet') this.stat(this.round.petById(event.pet)?.seat, 'thrower', 1);
        break;
      case 'roll':
        if (event.tier === 'cursed') this.stat(event.seat, 'unlucky', 1);
        break;
      case 'meteorCall':
        this.stat(event.owner, 'meteor', 1);
        break;
      case 'explosion':
        if (event.cause === 'barrel' && event.owner !== null) {
          const stats = this.stats.get(event.owner);
          if (stats) stats.chain = Math.max(stats.chain, event.chain + 1);
        }
        break;
      case 'honk':
        this.stat(this.round.petById(event.pet)?.seat, 'honker', 1);
        break;
    }
  }

  private addScore(seat: number, points: number, reason: 'kill' | 'place' | 'swap' | 'bounty', x: number | null, z: number | null): void {
    if (!this.scores.has(seat)) return;
    this.scores.set(seat, (this.scores.get(seat) ?? 0) + points);
    this.events.push({ t: 'score', seat, points, reason, x, z });
  }

  private stat(seat: number | undefined, key: keyof SeatStats, amount: number): void {
    const stats = seat === undefined ? undefined : this.stats.get(seat);
    if (stats) stats[key] += amount;
  }

  private slow(scale: number, seconds: number): void {
    this.slowScale = scale;
    this.slowLeft = seconds;
    this.sinceSlow = 0;
    this.events.push({ t: 'slowMo', scale, seconds });
  }

  // ── Mystery Cube and gacha ─────────────────────────────────────────────────

  private roll(seat: number): { tier: 'common' | 'rare' | 'cursed' | 'super'; power: PowerId; pity: number } {
    // Only one SUPER at a time: a gacha in progress or a SUPER power still running blocks another.
    const brawl = this.round.gameMode === 'brawl' ? this.round : null;
    const superBusy = this.gacha !== null || (brawl?.superPending ?? null) !== null || this.round.pets.some(pet => pet.power === 'kaiju' || pet.power === 'meteorShower' || pet.slot?.tier === 'super');
    const result = rollTier(this.rolls, rankOf(this.scores, seat), this.pity.get(seat) ?? 0, superBusy);
    this.pity.set(seat, result.pity);
    return { tier: result.tier, power: pickPower(this.rolls, result.tier), pity: result.pity };
  }

  private startGacha(round: Round): void {
    const pending = round.superPending!;
    round.superPending = null;
    round.chargeFrozen = true;
    this.gachaRound = round;
    this.gachaPet = pending.pet;
    this.gacha = { seat: pending.seat, time: 0, lever: 0, pulled: false, jinx: 0, cursed: null, power: pending.power };
    this.emit({ t: 'gachaStart', seat: pending.seat, pet: pending.pet });
  }

  /** The winner's stick pulls the lever; everyone else's A is a ZICA tap that raises the curse chance. */
  private gachaInput(seat: number, input: SampledInput): void {
    const gacha = this.gacha!;
    if (seat === gacha.seat) {
      if (gacha.time >= gachaTune.leverFrom && !gacha.pulled) gacha.lever = Math.max(gacha.lever, Math.min(1, Math.max(0, -input.y)));
      return;
    }
    if (gacha.cursed !== null) return;
    const taps = input.edges.filter(edge => edge.button === 'a' && edge.down).length;
    if (taps === 0 || gacha.jinx >= gachaTune.maxCurse) return;
    gacha.jinx = Math.min(gachaTune.maxCurse, gacha.jinx + taps);
    this.emit({ t: 'gachaJinx', seat, total: gacha.jinx });
  }

  private tickGacha(): void {
    const gacha = this.gacha!;
    gacha.time += STEP;
    if (!gacha.pulled && gacha.time >= gachaTune.leverFrom && (gacha.lever >= 0.9 || gacha.time >= gachaTune.leverUntil)) {
      gacha.pulled = true;
      gacha.lever = 1;
      this.emit({ t: 'gachaLever', seat: gacha.seat });
    }
    if (gacha.cursed === null && gacha.time >= gachaTune.revealAt) {
      gacha.cursed = this.rolls.chance(gacha.jinx / 100);
      if (gacha.cursed) {
        gacha.power = SUPER_CURSE;
        this.stat(gacha.seat, 'unlucky', 2);
      }
      this.emit({ t: 'gachaReveal', seat: gacha.seat, cursed: gacha.cursed, power: gacha.power });
    }
    if (gacha.time < gachaTune.duration) return;
    this.gacha = null;
    if (this.gachaRound) {
      this.gachaRound.chargeFrozen = false;
      this.gachaRound.applyPower(this.gachaPet, gacha.power);
      this.gachaRound = null;
    }
    this.emit({ t: 'gachaEnd', seat: gacha.seat });
  }
}
