// Bots fill empty seats. A bot produces the same kind of input a phone does, so the round
// cannot tell them apart. Each decides ten times a second and acts a quarter second late, like a person.
import type { ButtonEdge, SampledInput } from './input';
import type { Rng } from './rng';
import type { Round } from './round';
import { arena, bot as botTune, dash, grab, STEP } from './tuning';
import { TILE, type BotStyle, type Pet } from './types';

type Plan = {
  x: number;
  z: number;
  /** Seconds to hold A before letting go; 0 for no attack. */
  charge: number;
  tapB: boolean;
  mash: boolean;
};

const REST: Plan = { x: 0, z: 0, charge: 0, tapB: false, mash: false };
const REACTION_STEPS = Math.round(botTune.reaction / STEP);

export class BotBrain {
  readonly seat: number;
  private readonly style: BotStyle;
  private readonly rng: Rng;
  private thinkIn = 0;
  private plan: Plan = REST;
  private readonly pending: { at: number; plan: Plan }[] = [];
  private holdLeft = 0;
  private attackRest = 0;
  private a = false;
  private b = false;
  private mashClock = 0;
  /** The bot's own step count. The round's restarts every round, which would strand queued plans. */
  private clock = 0;

  constructor(seat: number, style: BotStyle, rng: Rng) {
    this.seat = seat;
    this.style = style;
    this.rng = rng;
  }

  /** Forgets everything it was doing. Called when a new round begins. */
  reset(): void {
    this.pending.length = 0;
    this.plan = REST;
    this.thinkIn = 0;
    this.holdLeft = 0;
    this.attackRest = 0;
  }

  /** `gachaWinner` is the seat pulling the lever while a gacha plays, or null. */
  input(round: Round, gachaWinner: number | null): SampledInput {
    this.clock++;
    this.thinkIn -= STEP;
    if (this.thinkIn <= 0) {
      this.thinkIn = botTune.think;
      this.pending.push({ at: this.clock + REACTION_STEPS, plan: this.decide(round) });
    }
    while (this.pending[0] && this.pending[0].at <= this.clock) this.plan = this.pending.shift()!.plan;

    let a = false;
    let b = false;
    let x = this.plan.x;
    let z = this.plan.z;
    this.mashClock++;

    if (gachaWinner !== null) {
      // The winner pulls the lever; everyone else mashes ZICA.
      if (gachaWinner === this.seat) return this.emit(0, -1, false, false);
      return this.emit(0, 0, this.mashClock % 8 < 4, false);
    }

    if (this.plan.mash) {
      a = this.mashClock % 8 < 4;
    } else {
      this.attackRest = Math.max(0, this.attackRest - STEP);
      if (this.holdLeft > 0) {
        this.holdLeft -= STEP;
        a = this.holdLeft > 0;
        if (!a) this.attackRest = this.rng.range(0.5, 1.3);
      } else if (this.plan.charge > 0 && this.attackRest === 0) {
        this.holdLeft = this.plan.charge;
        a = true;
      }
      // B is a tap: down for one step, then up, so a held plan does not grab and throw in the same breath.
      b = this.plan.tapB && !this.b && this.mashClock % 20 === 0;
    }
    if (a) {
      // A charging bot keeps aiming, slightly off, the way a thumb would.
      const wobble = (this.rng.range(-botTune.aimNoise, botTune.aimNoise) * Math.PI) / 180 / 6;
      const angle = Math.atan2(x, z) + wobble;
      const length = Math.hypot(x, z);
      x = Math.sin(angle) * length;
      z = Math.cos(angle) * length;
    }
    return this.emit(x, z, a, b);
  }

  private emit(x: number, z: number, a: boolean, b: boolean): SampledInput {
    const edges: ButtonEdge[] = [];
    if (a !== this.a) edges.push({ button: 'a', down: a });
    if (b !== this.b) edges.push({ button: 'b', down: b });
    this.a = a;
    this.b = b;
    return { x, y: -z, a, b, stale: false, edges };
  }

  private decide(round: Round): Plan {
    const me = round.petOfSeat(this.seat);
    if (!me) return this.decideGhost(round);
    if (me.carriedBy !== null) return { ...REST, mash: true };

    const toward = (x: number, z: number, speed = 1): { x: number; z: number } => {
      const distance = Math.hypot(x - me.x, z - me.z);
      return distance < 0.05 ? { x: 0, z: 0 } : { x: ((x - me.x) / distance) * speed, z: ((z - me.z) / distance) * speed };
    };

    // 1. Stay on the platform: back away from missing tiles and off tiles that are shaking.
    const column = Math.floor(me.x + arena.size / 2);
    const row = Math.floor(me.z + arena.size / 2);
    const shaking = round.tiles[column * arena.size + row] === TILE.warning;
    let unsafe = shaking;
    for (let step = 0; step < 8 && !unsafe; step++) {
      const angle = (step / 8) * Math.PI * 2;
      if (!round.isFloor(me.x + Math.sin(angle) * botTune.edgeFear, me.z + Math.cos(angle) * botTune.edgeFear)) unsafe = true;
    }
    if (unsafe && me.dashTime <= 0) return { ...REST, ...toward(0, 0) };

    const rivals = round.pets.filter(pet => pet.alive && pet.seat !== this.seat);
    const nearest = (list: Pet[]): { pet: Pet; distance: number } | null => {
      let best: { pet: Pet; distance: number } | null = null;
      for (const pet of list) {
        const distance = Math.hypot(pet.x - me.x, pet.z - me.z);
        if (!best || distance < best.distance) best = { pet, distance };
      }
      return best;
    };

    // 2. A Mystery Cube is worth a detour.
    if (round.cube && !me.slot && Math.hypot(round.cube.x - me.x, round.cube.z - me.z) < 9) return { ...REST, ...toward(round.cube.x, round.cube.z) };

    const target = nearest(rivals);

    // 3. Throwers fetch a barrel and lob it at the nearest rival.
    if (this.style === 'thrower') {
      if (me.carrying) {
        if (!target) return REST;
        return { ...REST, ...toward(target.pet.x, target.pet.z), tapB: target.distance < 6.5 };
      }
      let barrel: { x: number; z: number; distance: number } | null = null;
      for (const candidate of round.barrels) {
        if (candidate.fuse !== null || candidate.carriedBy !== null) continue;
        const distance = Math.hypot(candidate.x - me.x, candidate.z - me.z);
        if (distance < 7 && (!barrel || distance < barrel.distance)) barrel = { x: candidate.x, z: candidate.z, distance };
      }
      if (barrel) return { ...REST, ...toward(barrel.x, barrel.z), tapB: barrel.distance < grab.range };
    }
    if (!target) return REST;

    // 4. Fight, each in its own way.
    const aim = toward(target.pet.x, target.pet.z);
    // A dash that would carry on past the target and off the platform is a bad idea, unless the
    // target is too close to miss. Otherwise get round to the middle side of it first, and push outward.
    const beyond = target.distance + 1.8;
    if (!round.isFloor(me.x + aim.x * beyond, me.z + aim.z * beyond) && target.distance > 1.5) {
      return { ...REST, ...toward(target.pet.x * 0.55, target.pet.z * 0.55) };
    }
    if (this.style === 'kamikaze') {
      const crowd = rivals.filter(pet => Math.hypot(pet.x - me.x, pet.z - me.z) < 3).length;
      // With two or more rivals close, hold past the limit and take them along.
      if (crowd >= 2 && this.rng.chance(0.5)) return { ...REST, ...aim, charge: dash.overchargeAt + 0.2 };
      return { ...REST, ...aim, charge: target.distance < 3.4 ? this.rng.range(0.7, 1.1) : 0 };
    }
    if (this.style === 'coward') {
      if (target.distance < 2.6) return { ...REST, ...aim, charge: this.rng.range(0.12, 0.4) };
      // Keeps its distance: circles instead of closing in.
      if (target.distance < 4.5) return { ...REST, x: aim.z * 0.8, z: -aim.x * 0.8 };
      return { ...REST, ...toward(target.pet.x, target.pet.z, 0.7) };
    }
    return { ...REST, ...aim, charge: target.distance < 3.2 ? this.rng.range(0.4, 0.8) : 0 };
  }

  /** A knocked-out bot steers its meteor cursor over the nearest pet and drops when it is roughly on target. */
  private decideGhost(round: Round): Plan {
    const ghost = round.ghosts.find(candidate => candidate.seat === this.seat);
    if (!ghost) return REST;
    let best: { x: number; z: number; distance: number } | null = null;
    for (const pet of round.pets) {
      if (!pet.alive || pet.decoy) continue;
      // Lead the target by most of the meteor's fall time, with some error.
      const x = pet.x + pet.vx * 0.7 + this.rng.range(-0.8, 0.8);
      const z = pet.z + pet.vz * 0.7 + this.rng.range(-0.8, 0.8);
      const distance = Math.hypot(x - ghost.x, z - ghost.z);
      if (!best || distance < best.distance) best = { x, z, distance };
    }
    if (!best) return REST;
    const reach = Math.max(best.distance, 0.01);
    const speed = Math.min(1, best.distance / 1.5);
    return { ...REST, x: ((best.x - ghost.x) / reach) * speed, z: ((best.z - ghost.z) / reach) * speed, charge: ghost.cooldown === 0 && best.distance < 1.3 ? 0.05 : 0 };
  }
}
