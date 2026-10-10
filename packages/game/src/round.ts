// One round on the platform: pets, barrels, tiles, cubes, meteors and ghosts, advanced one physics step at a time.
// The lobby is a round too, with no shrinking floor and pets that drop back in after falling.
import type { SampledInput } from './input';
import { Physics, type Body } from './physics';
import type { Rng } from './rng';
import { arena, barrel as barrelTune, cube as cubeTune, dash, grab, match, meteor as meteorTune, pet as petTune, STEP, supers } from './tuning';
import {
  POWERS,
  TILE,
  type Barrel,
  type Cause,
  type Credit,
  type Cube,
  type GameEvent,
  type Ghost,
  type Meteor,
  type Pet,
  type PowerId,
  type RoundCore,
  type SeatSetup,
  type Tier,
} from './types';

const SIZE = arena.size;
const HALF = SIZE / 2;
const CREDIT_STEPS = Math.round(match.creditWindow / STEP);
/** How far the ghost cursor may leave the platform. */
const CURSOR_LIMIT = HALF + 1;

const POWER_SCALE: Partial<Record<PowerId, number>> = { giant: 2, pebble: 0.5, kaiju: supers.kaijuScale };
const POWER_MASS: Partial<Record<PowerId, number>> = { giant: 3, pebble: 0.4, kaiju: supers.kaijuMass };
/** Share of a knockback each power lets through. Zero means immune. */
const POWER_KNOCK: Partial<Record<PowerId, number>> = { jelly: 0, kaiju: 0, giant: 0.4, pebble: 2.2 };
const POWER_SPEED: Partial<Record<PowerId, number>> = { rocket: 1.6, kaiju: supers.kaijuSpeed };

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export type RoundHooks = {
  emit(event: GameEvent): void;
  /** Decides a Mystery Cube roll for a seat. */
  roll(seat: number): { tier: Tier; power: PowerId; pity: number };
  /** A free common power, for whoever hits a Piñata. */
  freeCommon(): PowerId;
  /** Blast radius multiplier for a seat: the player in last place gets a bigger one. */
  blastBonus(seat: number): number;
};

/** Per-body state the outside world never needs. */
type Inner = {
  body: Body;
  dashSpeed: number;
  /** Force and radius multiplier of the current dash (2 for a Mega Dash). */
  dashBoost: number;
  /** Decoys: the direction they wander in. */
  heading: number;
  /** Seconds since this body was thrown. */
  thrownFor: number;
  thrower: number | null;
  /** Countdown to the next periodic effect of the active power. */
  pulse: number;
  /** How many of those effects the active power has had so far. */
  pulses: number;
};

export class Round implements RoundCore {
  readonly gameMode = 'brawl' as const;
  readonly mode: 'lobby' | 'match';
  readonly cap: number;
  readonly pets: Pet[] = [];
  readonly barrels: Barrel[] = [];
  readonly meteors: Meteor[] = [];
  readonly ghosts: Ghost[] = [];
  /** One TILE state per tile; index = column * size + row. */
  readonly tiles = new Uint8Array(SIZE * SIZE);
  cube: Cube | null = null;
  /** Seconds of play so far. */
  time = 0;
  steps = 0;
  /** False during the countdown and once the round is decided: pets still move, hazards stop. */
  playing = false;
  /** Set while a gacha plays, so nobody's charge runs on during the slow motion. */
  chargeFrozen = false;
  finished = false;
  /** Seats in the order they were knocked out. A revenge swap takes the returning seat off this list. */
  readonly out: number[] = [];
  /** A SUPER roll whose slot reels have stopped and now needs its gacha sequence. */
  superPending: { seat: number; pet: number; power: PowerId } | null = null;

  private readonly physics = new Physics();
  private readonly rng: Rng;
  private readonly hooks: RoundHooks;
  private readonly seats = new Map<number, SeatSetup>();
  private readonly inner = new Map<number, Inner>();
  private readonly respawns: { seat: number; left: number }[] = [];
  private readonly barrelRespawns: number[] = [];
  private nextId: number;
  private nextCubeIn: number;
  private ringsWarned = 0;
  private ringsFallen = 0;

  /** `firstId` keeps ids unique across rounds, so nothing on screen is ever mistaken for last round's pet. */
  constructor(mode: 'lobby' | 'match', seats: readonly SeatSetup[], rng: Rng, hooks: RoundHooks, firstId = 1) {
    this.mode = mode;
    this.cap = mode === 'match' ? match.roundCap : Infinity;
    this.nextId = firstId;
    this.rng = rng;
    this.hooks = hooks;
    this.nextCubeIn = rng.range(6, 10);
    seats.forEach((seat, index) => {
      this.seats.set(seat.seat, seat);
      const angle = (index / Math.max(1, seats.length)) * Math.PI * 2;
      // Match pets drop in from the sky one after another; lobby pets arrive from just overhead.
      this.spawnPet(seat, Math.sin(angle) * 4.5, mode === 'match' ? 9 + index * 0.7 : 4, Math.cos(angle) * 4.5, false);
    });
    const barrels = mode === 'match' ? barrelTune.count : barrelTune.lobbyCount;
    for (let index = 0; index < barrels; index++) this.spawnBarrel();
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  /** Advances one physics step. `read` returns each seat's input for this step. */
  step(read: (seat: number) => SampledInput): void {
    this.steps++;
    if (this.playing) this.time += STEP;
    for (const pet of this.pets) {
      pet.px = pet.x;
      pet.py = pet.y;
      pet.pz = pet.z;
    }
    for (const barrel of this.barrels) {
      barrel.px = barrel.x;
      barrel.py = barrel.y;
      barrel.pz = barrel.z;
    }

    this.tickTiles();
    this.tickRespawns();
    for (const pet of [...this.pets]) {
      if (pet.alive) this.controlPet(pet, pet.decoy ? this.decoyInput(pet) : read(pet.seat));
    }
    this.tickPowers();
    this.tickBarrels();
    this.tickMeteors();
    this.tickCube();
    this.tickGhosts(read);

    this.physics.step();

    for (const pet of [...this.pets]) if (pet.alive) this.settlePet(pet);
    for (const barrel of [...this.barrels]) this.settleBarrel(barrel);
    this.checkFinished();
  }

  /** Lobby only: makes the pets on the platform match the seats (joins, leaves and pet changes). */
  syncSeats(seats: readonly SeatSetup[]): void {
    const wanted = new Map(seats.map(seat => [seat.seat, seat]));
    for (const pet of [...this.pets]) {
      if (!wanted.has(pet.seat)) this.removePet(pet);
    }
    for (let index = this.respawns.length - 1; index >= 0; index--) {
      if (!wanted.has(this.respawns[index]!.seat)) this.respawns.splice(index, 1);
    }
    for (const seat of this.seats.keys()) if (!wanted.has(seat)) this.seats.delete(seat);
    for (const seat of seats) {
      const known = this.seats.has(seat.seat);
      this.seats.set(seat.seat, seat);
      const pet = this.petOfSeat(seat.seat);
      if (pet) pet.pet = seat.pet;
      else if (!known) {
        const spot = this.freeSpot();
        this.spawnPet(seat, spot.x, 5, spot.z, false);
      }
    }
  }

  petOfSeat(seat: number): Pet | undefined {
    return this.pets.find(pet => pet.seat === seat && !pet.decoy && pet.alive);
  }

  petById(id: number): Pet | undefined {
    return this.pets.find(pet => pet.id === id);
  }

  /** Seats that still have a living pet. */
  aliveSeats(): number[] {
    return this.pets.filter(pet => pet.alive && !pet.decoy).map(pet => pet.seat);
  }

  /** Everyone still standing shares first; then the knocked-out, last out first. */
  ranking(): number[][] {
    return [[...new Set(this.aliveSeats())], ...[...this.out].reverse().map(seat => [seat])].filter(group => group.length > 0);
  }

  /** The platform is flat. */
  floorY(): number {
    return 0;
  }

  /** The brawl has no number of its own: its card shows the score. */
  metric(): null {
    return null;
  }

  isFloor(x: number, z: number): boolean {
    const column = Math.floor(x + HALF);
    const row = Math.floor(z + HALF);
    if (column < 0 || row < 0 || column >= SIZE || row >= SIZE) return false;
    return this.tiles[column * SIZE + row] !== TILE.gone;
  }

  /** Starts a power on a pet, replacing any it already has. */
  applyPower(petId: number, power: PowerId): void {
    const pet = this.petById(petId);
    if (!pet || !pet.alive) return;
    this.endPower(pet);
    pet.power = power;
    pet.powerTotal = pet.powerLeft = POWERS[power].duration;
    const inner = this.inner.get(pet.id)!;
    inner.pulse = 0;
    inner.pulses = 0;
    this.rescale(pet, POWER_SCALE[power] ?? 1, POWER_MASS[power] ?? 1);
    if (power === 'decoys') {
      for (let index = 0; index < 3; index++) {
        const angle = pet.facing + ((index + 0.5) / 3) * Math.PI * 2;
        const setup = this.seats.get(pet.seat)!;
        this.spawnPet(setup, pet.x + Math.sin(angle) * 1.1, pet.y, pet.z + Math.cos(angle) * 1.1, true);
      }
    }
    this.hooks.emit({ t: 'powerStart', pet: pet.id, seat: pet.seat, power });
    // A SUPER lands like one: a strike where its owner stands, warned on the floor, that throws back everyone else in reach.
    if (POWERS[power].tier === 'super') this.callMeteor(pet.x, pet.z, supers.arrivalDelay, supers.arrivalRadius, supers.arrivalForce, 0, pet.seat, false);
  }

  /** A number that changes if anything about the round does: two runs with the same seed and inputs must match. */
  hash(): number {
    let hash = this.steps;
    const mix = (value: number) => {
      hash = (Math.imul(hash, 31) + Math.round(value * 1000)) | 0;
    };
    for (const pet of this.pets) [pet.id, pet.x, pet.y, pet.z, pet.vx, pet.vz, pet.facing].forEach(mix);
    for (const barrel of this.barrels) [barrel.id, barrel.x, barrel.y, barrel.z].forEach(mix);
    this.tiles.forEach(mix);
    this.out.forEach(mix);
    return hash;
  }

  free(): void {
    this.physics.free();
  }

  // ── Spawning ───────────────────────────────────────────────────────────────

  private spawnPet(setup: SeatSetup, x: number, y: number, z: number, decoy: boolean): Pet {
    const id = this.nextId++;
    const pet: Pet = {
      id, seat: setup.seat, decoy, pet: setup.pet, alive: true,
      x, y, z, px: x, py: y, pz: z, vx: 0, vy: 0, vz: 0,
      facing: Math.atan2(-x, -z), grounded: false, falling: false, teeter: false, scale: 1,
      chargeTime: 0, dashTime: 0, dashCharge: 0, dashX: 0, dashZ: 1, dashCooldown: 0, dashCooldownTotal: 0, authority: 1,
      reachTime: 0, reachTarget: null, carriedBy: null, carrying: null, carriedTime: 0, mash: 0, grabImmune: 0, grabTarget: null, grabLock: 0,
      thrown: false, lastHit: null, power: null, powerLeft: 0, powerTotal: 0, held: null, slot: null, respawnIn: 0,
    };
    this.pets.push(pet);
    this.inner.set(id, {
      body: this.physics.addCapsule(x, y, z, petTune.radius, petTune.halfHeight, 1),
      dashSpeed: 0, dashBoost: 1, heading: this.rng.range(0, Math.PI * 2), thrownFor: 0, thrower: null, pulse: 0, pulses: 0,
    });
    this.hooks.emit({ t: 'spawn', pet: id, seat: setup.seat });
    return pet;
  }

  private spawnBarrel(): void {
    const spot = this.freeSpot();
    const id = this.nextId++;
    const y = 6;
    this.barrels.push({ id, x: spot.x, y, z: spot.z, px: spot.x, py: y, pz: spot.z, fuse: null, chain: 0, owner: null, carriedBy: null, thrown: false, grounded: false });
    this.inner.set(id, {
      body: this.physics.addCylinder(spot.x, y, spot.z, barrelTune.radius, barrelTune.halfHeight, 1.2),
      dashSpeed: 0, dashBoost: 1, heading: 0, thrownFor: 0, thrower: null, pulse: 0, pulses: 0,
    });
    this.hooks.emit({ t: 'barrelSpawn', barrel: id });
  }

  /** A tile centre away from the edge and from everything already standing on the platform. */
  private freeSpot(): { x: number; z: number } {
    let fallback = { x: 0, z: 0 };
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = this.rng.int(SIZE - 4) + 2 - HALF + 0.5;
      const z = this.rng.int(SIZE - 4) + 2 - HALF + 0.5;
      if (!this.isFloor(x, z)) continue;
      fallback = { x, z };
      const crowded =
        this.pets.some(pet => Math.hypot(pet.x - x, pet.z - z) < 1.8) || this.barrels.some(barrel => Math.hypot(barrel.x - x, barrel.z - z) < 1.8);
      if (!crowded) return fallback;
    }
    return fallback;
  }

  private tickRespawns(): void {
    for (let index = this.respawns.length - 1; index >= 0; index--) {
      const waiting = this.respawns[index]!;
      waiting.left -= STEP;
      if (waiting.left > 0) continue;
      this.respawns.splice(index, 1);
      const setup = this.seats.get(waiting.seat);
      if (!setup) continue;
      const spot = this.freeSpot();
      this.spawnPet(setup, spot.x, 7, spot.z, false);
    }
    for (let index = this.barrelRespawns.length - 1; index >= 0; index--) {
      this.barrelRespawns[index]! -= STEP;
      if (this.barrelRespawns[index]! > 0) continue;
      this.barrelRespawns.splice(index, 1);
      this.spawnBarrel();
    }
  }

  // ── Pets: input to motion ──────────────────────────────────────────────────

  private controlPet(pet: Pet, input: SampledInput): void {
    const inner = this.inner.get(pet.id)!;
    pet.grabImmune = Math.max(0, pet.grabImmune - STEP);
    pet.grabLock = Math.max(0, pet.grabLock - STEP);
    pet.dashCooldown = Math.max(0, pet.dashCooldown - STEP);
    // A thrown pet tumbles: it cannot steer until it lands.
    pet.authority = pet.thrown ? 0 : Math.min(1, pet.authority + STEP / petTune.controlRecovery);
    pet.grabTarget = null;

    if (pet.carriedBy !== null) return this.tickCarried(pet, input);

    let stickX = input.x;
    let stickZ = -input.y;
    if (pet.power === 'reversed') {
      stickX = -stickX;
      stickZ = -stickZ;
    }

    for (const edge of input.edges) {
      if (!edge.down) continue;
      if (edge.button === 'b') this.pressB(pet, stickX, stickZ);
      else if (edge.button === 'c') this.usePower(pet, stickX, stickZ);
    }
    if (pet.reachTime > 0) {
      pet.reachTime -= STEP;
      if (pet.reachTime <= 0) this.finishReach(pet);
    }
    if (!pet.decoy && !pet.carrying && pet.reachTime <= 0 && pet.dashTime <= 0 && pet.grabLock <= 0) pet.grabTarget = this.inReach(pet, stickX, stickZ);

    if (!this.chargeFrozen && pet.dashTime <= 0 && !pet.carrying && !pet.decoy) {
      const pressed = input.edges.some(edge => edge.button === 'a' && edge.down);
      if (pet.dashCooldown > 0) {
        // Still catching its breath after the last dash: A does nothing, and a press says so.
        if (pressed) this.hooks.emit({ t: 'tired', pet: pet.id });
      } else if (input.a) {
        // A stalled connection pauses the charge: it must never run on into a detonation.
        if (!input.stale) pet.chargeTime += STEP;
        if (pet.chargeTime >= dash.overchargeAt) return this.overcharge(pet);
      } else if (pet.chargeTime > 0 || pressed) {
        // A tap that began and ended between two steps never shows as "held", so it is caught from its edges.
        this.startDash(pet, stickX, stickZ, false);
      }
    }

    const velocity = inner.body.linvel();
    let vx = velocity.x;
    let vz = velocity.z;
    if (pet.dashTime > 0) {
      pet.dashTime -= STEP;
      vx = pet.dashX * inner.dashSpeed;
      vz = pet.dashZ * inner.dashSpeed;
      inner.body.setLinvel({ x: vx, y: velocity.y, z: vz }, true);
      // A dash ends once: on whatever it touches, or, having touched nothing, when its time is up.
      if (!this.dashContacts(pet) && pet.dashTime <= 0) this.endDash(pet, false);
      return;
    }

    const prey = pet.reachTime > 0 && pet.reachTarget !== null ? this.petById(pet.reachTarget) : undefined;
    if (prey) {
      // Reaching is a lunge at the target, so walking away from a grab does not work. It stops short of a drop.
      const distance = Math.hypot(prey.x - pet.x, prey.z - pet.z) || 1;
      const dx = (prey.x - pet.x) / distance;
      const dz = (prey.z - pet.z) / distance;
      const go = distance > petTune.radius * (pet.scale + prey.scale) && this.isFloor(pet.x + dx * 0.6, pet.z + dz * 0.6) ? grab.lungeSpeed : 0;
      pet.facing = Math.atan2(dx, dz);
      inner.body.setLinvel({ x: dx * go, y: velocity.y, z: dz * go }, true);
      return;
    }

    const slowed = pet.chargeTime > 0 ? dash.chargingSpeed : 1;
    // A carried pet that wriggles drags its carrier's feet.
    const load = pet.carrying?.kind === 'pet' ? (this.petById(pet.carrying.id)?.mash ?? 0) / grab.escapeTaps : 0;
    const carry = pet.carrying ? grab.carrySpeed * (1 - grab.struggle * Math.min(1, load)) : 1;
    const speed = petTune.speed * (POWER_SPEED[pet.power ?? 'megaDash'] ?? 1) * carry * slowed;
    const blend = 1 - Math.exp(-petTune.control * pet.authority * STEP);
    vx += (stickX * speed - vx) * blend;
    vz += (stickZ * speed - vz) * blend;
    if (pet.grounded && pet.authority < 1) {
      const slide = Math.exp(-petTune.slideFriction * STEP);
      vx *= slide;
      vz *= slide;
    }
    inner.body.setLinvel({ x: vx, y: velocity.y, z: vz }, true);

    if (Math.hypot(stickX, stickZ) > 0.2 && pet.authority > 0.5) {
      const want = Math.atan2(stickX, stickZ);
      pet.facing += Math.atan2(Math.sin(want - pet.facing), Math.cos(want - pet.facing)) * (1 - Math.exp(-petTune.turnRate * STEP));
    }
  }

  /** Direction for a dash or throw: the stick, bent toward a rival near that line, or the nearest rival with the stick idle. */
  private aim(pet: Pet, stickX: number, stickZ: number): { x: number; z: number } {
    const rivals = this.pets.filter(other => other.alive && other.seat !== pet.seat && other.carriedBy !== pet.id);
    const stick = Math.hypot(stickX, stickZ);
    if (stick < 0.25) {
      let nearest: Pet | null = null;
      let best: number = dash.aimRange;
      for (const rival of rivals) {
        const distance = Math.hypot(rival.x - pet.x, rival.z - pet.z);
        if (distance < best) {
          best = distance;
          nearest = rival;
        }
      }
      if (!nearest || best < 0.01) return { x: Math.sin(pet.facing), z: Math.cos(pet.facing) };
      return { x: (nearest.x - pet.x) / best, z: (nearest.z - pet.z) / best };
    }
    const wanted = Math.atan2(stickX, stickZ);
    let bend = 0;
    let smallest = (dash.aimAssist * Math.PI) / 180;
    for (const rival of rivals) {
      const distance = Math.hypot(rival.x - pet.x, rival.z - pet.z);
      if (distance > dash.aimRange || distance < 0.01) continue;
      const toRival = Math.atan2(rival.x - pet.x, rival.z - pet.z);
      const off = Math.atan2(Math.sin(toRival - wanted), Math.cos(toRival - wanted));
      if (Math.abs(off) < smallest) {
        smallest = Math.abs(off);
        bend = off;
      }
    }
    return { x: Math.sin(wanted + bend), z: Math.cos(wanted + bend) };
  }

  /** `mega` is the Mega Dash power: a full charge and more, at once. */
  private startDash(pet: Pet, stickX: number, stickZ: number, mega: boolean): void {
    const inner = this.inner.get(pet.id)!;
    const charge = mega ? 1 : clamp(pet.chargeTime / dash.chargeTime, 0, 1);
    const direction = this.aim(pet, stickX, stickZ);
    pet.dashCharge = charge;
    pet.dashX = direction.x;
    pet.dashZ = direction.z;
    pet.dashTime = lerp(dash.minDuration, dash.maxDuration, charge);
    pet.chargeTime = 0;
    pet.authority = 0;
    pet.facing = Math.atan2(direction.x, direction.z);
    inner.dashSpeed = lerp(dash.minSpeed, dash.maxSpeed, charge) * (mega ? 1.3 : 1);
    inner.dashBoost = mega ? 2 : 1;
    this.hooks.emit({ t: 'dash', pet: pet.id, charge, x: pet.x, z: pet.z, dx: direction.x, dz: direction.z });
  }

  private endDash(pet: Pet, hit: boolean): void {
    pet.dashTime = 0;
    pet.authority = hit ? 0.35 : 0.5;
    // A dash has to be paid for before the next one, and a miss costs more: mashing A gets nowhere.
    pet.dashCooldown = pet.dashCooldownTotal = hit ? dash.cooldown : dash.cooldownMiss;
    if (pet.power === 'giant') this.breakTiles(pet.x, pet.z, 1.3);
    this.hooks.emit({ t: 'dashEnd', pet: pet.id, seat: pet.seat, hit });
  }

  /** While dashing: the first pet or barrel touched ends the dash with a blast. */
  /** Returns true if the dash ended on something. */
  private dashContacts(pet: Pet): boolean {
    const reach = petTune.radius * pet.scale + dash.reach;
    for (const other of this.pets) {
      if (!other.alive || other === pet || other.seat === pet.seat || other.carriedBy === pet.id) continue;
      if (Math.abs(other.y - pet.y) > 1.2 * Math.max(pet.scale, other.scale)) continue;
      if (Math.hypot(other.x - pet.x, other.z - pet.z) > reach + petTune.radius * other.scale) continue;
      this.dashImpact(pet, other);
      return true;
    }
    for (const barrel of this.barrels) {
      if (barrel.carriedBy !== null || Math.abs(barrel.y - pet.y) > 1.2) continue;
      if (Math.hypot(barrel.x - pet.x, barrel.z - pet.z) > reach + barrelTune.radius) continue;
      const body = this.inner.get(barrel.id)!.body;
      if (pet.dashCharge >= dash.barrelCharge) this.arm(barrel, barrelTune.chainDelay, pet.seat, 0);
      // Either way the barrel is shoved along, so a charged hit sends the blast away from the dasher.
      const shove = this.inner.get(pet.id)!.dashSpeed * 0.7;
      body.setLinvel({ x: pet.dashX * shove, y: 2, z: pet.dashZ * shove }, true);
      this.inner.get(pet.id)!.body.setLinvel({ x: -pet.dashX * 2, y: 0, z: -pet.dashZ * 2 }, true);
      this.endDash(pet, true);
      return true;
    }
    return false;
  }

  private dashImpact(attacker: Pet, victim: Pet): void {
    const inner = this.inner.get(attacker.id)!;
    const charge = attacker.dashCharge;
    const big = attacker.power === 'kaiju' ? supers.kaijuDash : 1;
    const force = lerp(dash.minSpeed, dash.maxSpeed, charge) * inner.dashBoost * big;
    const radius = lerp(dash.minRadius, dash.maxRadius, charge) * inner.dashBoost * big * this.hooks.blastBonus(attacker.seat);
    const x = (attacker.x + victim.x) / 2;
    const z = (attacker.z + victim.z) / 2;
    const credit: Credit = { seat: attacker.seat, step: this.steps, cause: 'dash' };

    if (victim.power === 'jelly') {
      // Jelly bounces the attacker back with their own force.
      this.endDash(attacker, true);
      this.knock(attacker, -attacker.dashX, -attacker.dashZ, force * 0.9, dash.lift, { seat: victim.seat, step: this.steps, cause: 'power' });
      this.hooks.emit({ t: 'dashHit', pet: attacker.id, seat: attacker.seat, x, y: attacker.y, z, charge, radius, victims: [] });
      return;
    }

    if (charge < dash.shoveBelow && inner.dashBoost === 1) {
      // A tap is only a shove: it nudges the one pet it touches, which carries on with whatever it was doing.
      const pushed = this.knock(victim, attacker.dashX, attacker.dashZ, dash.shoveForce, dash.shoveLift, credit, true);
      if (victim.power === 'pinata' && !attacker.decoy) this.grantFree(attacker);
      inner.body.setLinvel({ x: attacker.dashX * 1.5, y: 0, z: attacker.dashZ * 1.5 }, true);
      this.endDash(attacker, true);
      this.hooks.emit({ t: 'dashHit', pet: attacker.id, seat: attacker.seat, x, y: attacker.y, z, charge, radius: 0, victims: pushed ? [victim.id] : [] });
      return;
    }

    const victims: number[] = [];
    for (const other of [...this.pets]) {
      if (!other.alive || other === attacker || other.seat === attacker.seat) continue;
      const distance = Math.hypot(other.x - x, other.z - z);
      if (other !== victim && distance > radius) continue;
      const direct = other === victim;
      const share = direct ? 1 : lerp(1, dash.edgeFalloff, distance / radius);
      // The pet that was hit flies along the dash; bystanders are pushed away from the point of impact.
      const dx = direct || distance < 0.01 ? attacker.dashX : (other.x - x) / distance;
      const dz = direct || distance < 0.01 ? attacker.dashZ : (other.z - z) / distance;
      if (this.knock(other, dx, dz, force * share, dash.lift * share, credit)) victims.push(other.id);
      if (direct && other.power === 'pinata' && !attacker.decoy) this.grantFree(attacker);
    }
    if (charge >= dash.barrelCharge) {
      for (const barrel of this.barrels) {
        if (barrel.fuse === null && Math.hypot(barrel.x - x, barrel.z - z) <= radius * 0.6) this.arm(barrel, barrelTune.chainDelay, attacker.seat, 0);
      }
    }
    inner.body.setLinvel({ x: attacker.dashX * 1.5, y: 0, z: attacker.dashZ * 1.5 }, true);
    this.endDash(attacker, true);
    this.hooks.emit({ t: 'dashHit', pet: attacker.id, seat: attacker.seat, x, y: attacker.y, z, charge, radius, victims });
  }

  private overcharge(pet: Pet): void {
    const credit: Credit = { seat: pet.seat, step: this.steps, cause: 'overcharge' };
    this.explode(pet.x, pet.y, pet.z, dash.maxRadius * this.hooks.blastBonus(pet.seat), dash.overchargeForce, barrelTune.lift, credit, 0, { exclude: pet });
    this.eliminate(pet, 'overcharge');
  }

  /** Sends a pet flying. Returns false if a power makes it immune. Every knock stamps who did it, for kill credit. */
  private knock(pet: Pet, dx: number, dz: number, speed: number, lift: number, credit: Credit, light = false): boolean {
    const taken = POWER_KNOCK[pet.power ?? 'megaDash'] ?? 1;
    if (taken === 0) return false;
    if (light) {
      // A shove moves a pet without stopping its charge, its grab or what it carries.
      if (pet.carriedBy === null) this.inner.get(pet.id)!.body.setLinvel({ x: dx * speed * taken, y: lift, z: dz * speed * taken }, true);
      pet.authority = Math.min(pet.authority, dash.shoveControl);
      pet.lastHit = credit;
      return true;
    }
    this.dropCarried(pet, credit);
    if (pet.carriedBy !== null) this.release(pet, false);
    this.inner.get(pet.id)!.body.setLinvel({ x: dx * speed * taken, y: lift * Math.min(1.5, Math.sqrt(taken)), z: dz * speed * taken }, true);
    pet.authority = 0;
    pet.chargeTime = 0;
    pet.dashTime = 0;
    pet.reachTime = 0;
    pet.lastHit = credit;
    return true;
  }

  // ── Explosions and barrels ─────────────────────────────────────────────────

  private explode(
    x: number, y: number, z: number, radius: number, force: number, lift: number, credit: Credit, chain: number,
    options: { exclude?: Pet; spareSeat?: number; hole?: number } = {},
  ): void {
    this.hooks.emit({ t: 'explosion', x, y, z, radius, cause: credit.cause, chain, owner: credit.seat >= 0 ? credit.seat : null });
    for (const pet of [...this.pets]) {
      if (!pet.alive || pet === options.exclude || pet.seat === options.spareSeat) continue;
      const distance = Math.hypot(pet.x - x, pet.z - z);
      if (distance > radius + petTune.radius * pet.scale || Math.abs(pet.y - y) > radius + 1) continue;
      const share = lerp(1, 0.4, clamp(distance / radius, 0, 1));
      // Dead centre has no "away" direction, so one is picked.
      const angle = distance < 0.05 ? this.rng.range(0, Math.PI * 2) : Math.atan2(pet.x - x, pet.z - z);
      this.knock(pet, Math.sin(angle), Math.cos(angle), force * share, lift * share, credit);
    }
    for (const barrel of this.barrels) {
      if (barrel.fuse !== null || Math.hypot(barrel.x - x, barrel.z - z) > radius + barrelTune.radius) continue;
      this.arm(barrel, barrelTune.chainDelay, credit.seat >= 0 ? credit.seat : null, chain + 1);
    }
    const lateRound = this.mode === 'match' && this.playing && this.time >= this.cap - arena.explosionsBreakTilesInLast;
    if (options.hole) this.breakTiles(x, z, options.hole);
    else if (lateRound) this.breakTiles(x, z, radius * 0.55);
  }

  private arm(barrel: Barrel, delay: number, owner: number | null, chain: number): void {
    if (barrel.fuse !== null) return;
    barrel.fuse = delay;
    barrel.owner = owner;
    barrel.chain = chain;
    this.hooks.emit({ t: 'barrelArmed', barrel: barrel.id, delay });
  }

  private tickBarrels(): void {
    const honkers = this.pets.filter(pet => pet.alive && pet.power === 'honk');
    for (const barrel of [...this.barrels]) {
      const inner = this.inner.get(barrel.id)!;
      if (barrel.carriedBy !== null) {
        const carrier = this.petById(barrel.carriedBy);
        if (carrier?.alive) {
          const top = (petTune.radius + petTune.halfHeight) * carrier.scale + barrelTune.halfHeight + 0.1;
          inner.body.setTranslation({ x: carrier.x, y: carrier.y + top, z: carrier.z }, true);
          inner.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        continue;
      }
      if (barrel.thrown) inner.thrownFor += STEP;
      if (barrel.fuse !== null) {
        barrel.fuse -= STEP;
        if (barrel.fuse <= 0) {
          this.removeBarrel(barrel);
          this.explode(barrel.x, barrel.y, barrel.z, barrelTune.blastRadius, barrelTune.force, barrelTune.lift, { seat: barrel.owner ?? -1, step: this.steps, cause: 'barrel' }, barrel.chain);
        }
        continue;
      }
      if (!barrel.grounded) continue;
      const velocity = inner.body.linvel();
      let vx = velocity.x * Math.exp(-4 * STEP);
      let vz = velocity.z * Math.exp(-4 * STEP);
      // Honk Mode: barrels creep toward whoever is honking.
      let pull: Pet | null = null;
      let nearest = 10;
      for (const honker of honkers) {
        const distance = Math.hypot(honker.x - barrel.x, honker.z - barrel.z);
        if (distance < nearest) {
          nearest = distance;
          pull = honker;
        }
      }
      if (pull && nearest > 0.1) {
        vx += ((pull.x - barrel.x) / nearest) * 14 * STEP;
        vz += ((pull.z - barrel.z) / nearest) * 14 * STEP;
      }
      inner.body.setLinvel({ x: vx, y: velocity.y, z: vz }, true);
    }
  }

  private removeBarrel(barrel: Barrel): void {
    const index = this.barrels.indexOf(barrel);
    if (index < 0) return;
    this.barrels.splice(index, 1);
    this.physics.remove(this.inner.get(barrel.id)!.body);
    this.inner.delete(barrel.id);
    if (barrel.carriedBy !== null) {
      const carrier = this.petById(barrel.carriedBy);
      if (carrier) carrier.carrying = null;
    }
    if (this.mode === 'lobby') this.barrelRespawns.push(barrelTune.lobbyRespawn);
  }

  private settleBarrel(barrel: Barrel): void {
    const inner = this.inner.get(barrel.id)!;
    const position = inner.body.translation();
    if (barrel.carriedBy === null) {
      const velocity = inner.body.linvel();
      const landing = this.isFloor(position.x, position.z) && position.y <= barrelTune.halfHeight + 0.03 && barrel.py > barrelTune.halfHeight - petTune.stepUp && velocity.y <= 0.5;
      if (landing) {
        inner.body.setTranslation({ x: position.x, y: barrelTune.halfHeight, z: position.z }, true);
        inner.body.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
        inner.body.setGravityScale(0, true);
        position.y = barrelTune.halfHeight;
      } else {
        inner.body.setGravityScale(1, true);
      }
      barrel.grounded = landing;
      if (barrel.thrown && barrel.fuse === null) {
        // A thrown barrel goes off the moment it lands or touches anyone but the pet that just let go of it.
        const touching = this.pets.some(
          pet => pet.alive && (pet.id !== inner.thrower || inner.thrownFor > 0.25) && Math.hypot(pet.x - position.x, pet.z - position.z) < barrelTune.radius + petTune.radius * pet.scale + 0.1 && Math.abs(pet.y - position.y) < 1.1 * pet.scale,
        );
        if (landing || touching) barrel.fuse = 0;
      }
    }
    barrel.x = position.x;
    barrel.y = position.y;
    barrel.z = position.z;
    if (position.y < arena.killY) this.removeBarrel(barrel);
  }

  // ── Grab and throw ─────────────────────────────────────────────────────────

  private pressB(pet: Pet, stickX: number, stickZ: number): void {
    if (pet.carrying) return this.throwCarried(pet, stickX, stickZ);
    if (pet.reachTime > 0 || pet.dashTime > 0 || pet.decoy || pet.grabLock > 0) return;

    const found = this.inReach(pet, stickX, stickZ);
    const barrel = found?.kind === 'barrel' ? this.barrels.find(candidate => candidate.id === found.id) : undefined;
    const target = found?.kind === 'pet' ? this.petById(found.id) : undefined;
    if (!barrel && !target) {
      // Nothing there: the swipe is seen, and B rests a moment so it cannot be mashed either.
      pet.grabLock = grab.missLock;
      this.hooks.emit({ t: 'grabMiss', pet: pet.id });
      return;
    }

    if (barrel) {
      // Barrels are grabbed at once; only pets need the wind-up.
      barrel.carriedBy = pet.id;
      barrel.thrown = false;
      this.physics.setSolid(this.inner.get(barrel.id)!.body, false);
      this.inner.get(barrel.id)!.body.setGravityScale(0, true);
      pet.carrying = { kind: 'barrel', id: barrel.id };
      pet.chargeTime = 0;
      this.hooks.emit({ t: 'grab', pet: pet.id, kind: 'barrel', target: barrel.id });
    } else if (target) {
      pet.reachTime = grab.windUp;
      pet.reachTarget = target.id;
      pet.chargeTime = 0;
      this.hooks.emit({ t: 'reach', pet: pet.id, target: target.id });
    }
  }

  private canGrab(pet: Pet, other: Pet): boolean {
    if (!other.alive || other === pet || other.seat === pet.seat || other.carriedBy !== null || other.grabImmune > 0) return false;
    // A pet in mid-dash slips through the hands: a grab beats a charge, and a dash let go in time beats a grab.
    if (other.dashTime > 0) return false;
    // Giants and kaiju are too big to lift.
    return other.scale <= 1.5 && Math.abs(other.y - pet.y) <= 1.5;
  }

  /** What B would take right now: the barrel or rival in reach, favouring whatever the pet is heading toward. */
  private inReach(pet: Pet, stickX: number, stickZ: number): { kind: 'pet' | 'barrel'; id: number } | null {
    const heading = Math.hypot(stickX, stickZ) > 0.25 ? Math.atan2(stickX, stickZ) : pet.facing;
    let best: { kind: 'pet' | 'barrel'; id: number } | null = null;
    let lowest = Infinity;
    const consider = (kind: 'pet' | 'barrel', id: number, x: number, z: number, radius: number) => {
      const distance = Math.hypot(x - pet.x, z - pet.z);
      if (distance > grab.range + radius) return;
      const bearing = Math.atan2(x - pet.x, z - pet.z) - heading;
      // Something straight ahead counts as nearer than something behind.
      const score = distance * (1 + 0.5 * (Math.abs(Math.atan2(Math.sin(bearing), Math.cos(bearing))) / Math.PI));
      if (score < lowest) {
        lowest = score;
        best = { kind, id };
      }
    };
    for (const barrel of this.barrels) {
      if (barrel.carriedBy === null && barrel.fuse === null && Math.abs(barrel.y - pet.y) < 1.5) consider('barrel', barrel.id, barrel.x, barrel.z, barrelTune.radius);
    }
    for (const other of this.pets) if (this.canGrab(pet, other)) consider('pet', other.id, other.x, other.z, petTune.radius * other.scale);
    return best;
  }

  private finishReach(pet: Pet): void {
    pet.reachTime = 0;
    const wanted = pet.reachTarget;
    pet.reachTarget = null;
    if (wanted === null) return;
    // The lunge has closed most of the gap, so only a target that got well clear escapes.
    const target = this.petById(wanted);
    if (!target || !this.canGrab(pet, target) || Math.hypot(target.x - pet.x, target.z - pet.z) > grab.range + petTune.radius * target.scale + grab.slack) {
      pet.grabLock = grab.missLock;
      this.hooks.emit({ t: 'grabMiss', pet: pet.id });
      return;
    }
    this.dropCarried(target, null);
    target.carriedBy = pet.id;
    target.carriedTime = 0;
    target.mash = 0;
    target.chargeTime = 0;
    target.dashTime = 0;
    target.reachTime = 0;
    const body = this.inner.get(target.id)!.body;
    this.physics.setSolid(body, false);
    body.setGravityScale(0, true);
    pet.carrying = { kind: 'pet', id: target.id };
    this.hooks.emit({ t: 'grab', pet: pet.id, kind: 'pet', target: target.id });
  }

  private tickCarried(pet: Pet, input: SampledInput): void {
    const carrier = pet.carriedBy === null ? undefined : this.petById(pet.carriedBy);
    if (!carrier?.alive) return this.release(pet, false);
    pet.carriedTime += STEP;
    // The first moment in the air is the grabber's: wriggling only counts after it.
    if (pet.carriedTime >= grab.escapeGrace) pet.mash += input.edges.filter(edge => edge.down).length;
    if (pet.carriedTime >= grab.escapeTime || pet.mash >= grab.escapeTaps) {
      this.release(pet, true);
      this.hooks.emit({ t: 'escape', pet: pet.id });
      return;
    }
    const body = this.inner.get(pet.id)!.body;
    const height = (petTune.radius + petTune.halfHeight) * (carrier.scale + pet.scale) + 0.1;
    body.setTranslation({ x: carrier.x, y: carrier.y + height, z: carrier.z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    pet.facing = carrier.facing;
  }

  /** Lets go of a carried pet. `hop` is an escape: it jumps clear instead of just dropping. */
  private release(pet: Pet, hop: boolean): void {
    const carrier = pet.carriedBy === null ? undefined : this.petById(pet.carriedBy);
    if (carrier) carrier.carrying = null;
    pet.carriedBy = null;
    pet.grabImmune = grab.immunity;
    pet.authority = 0.3;
    const body = this.inner.get(pet.id)!.body;
    this.physics.setSolid(body, true);
    body.setGravityScale(1, true);
    const facing = carrier?.facing ?? pet.facing;
    body.setLinvel(hop ? { x: -Math.sin(facing) * 4, y: 7, z: -Math.cos(facing) * 4 } : { x: carrier?.vx ?? 0, y: 2, z: carrier?.vz ?? 0 }, true);
  }

  /** Whatever this pet was holding falls where it is. With a credit, a dropped pet remembers who caused it. */
  private dropCarried(pet: Pet, credit: Credit | null): void {
    const held = pet.carrying;
    if (!held) return;
    pet.carrying = null;
    if (held.kind === 'pet') {
      const carried = this.petById(held.id);
      if (!carried) return;
      this.release(carried, false);
      if (credit) carried.lastHit = credit;
    } else {
      const barrel = this.barrels.find(candidate => candidate.id === held.id);
      if (!barrel) return;
      barrel.carriedBy = null;
      const body = this.inner.get(barrel.id)!.body;
      this.physics.setSolid(body, true);
      body.setGravityScale(1, true);
    }
  }

  private throwCarried(pet: Pet, stickX: number, stickZ: number): void {
    const held = pet.carrying;
    if (!held) return;
    const direction = this.aim(pet, stickX, stickZ);
    const velocity = { x: direction.x * grab.throwSpeed + pet.vx * 0.4, y: grab.throwLift, z: direction.z * grab.throwSpeed + pet.vz * 0.4 };
    pet.carrying = null;
    pet.facing = Math.atan2(direction.x, direction.z);
    const inner = this.inner.get(held.id);
    if (!inner) return;
    this.physics.setSolid(inner.body, true);
    inner.body.setGravityScale(1, true);
    inner.body.setLinvel(velocity, true);
    inner.thrownFor = 0;
    inner.thrower = pet.id;
    if (held.kind === 'pet') {
      const carried = this.petById(held.id);
      if (carried) {
        carried.carriedBy = null;
        carried.thrown = true;
        carried.authority = 0;
        carried.grabImmune = grab.immunity;
        carried.lastHit = { seat: pet.seat, step: this.steps, cause: 'throw' };
      }
    } else {
      const barrel = this.barrels.find(candidate => candidate.id === held.id);
      if (barrel) {
        barrel.carriedBy = null;
        barrel.thrown = true;
        barrel.owner = pet.seat;
      }
    }
    this.hooks.emit({ t: 'throw', pet: pet.id, kind: held.kind, target: held.id });
  }

  // ── Pets: after physics ────────────────────────────────────────────────────

  /** Reads a pet back from physics and applies the floor: tiles hold it up, missing tiles let it fall. */
  private settlePet(pet: Pet): void {
    const inner = this.inner.get(pet.id)!;
    const position = inner.body.translation();
    const velocity = inner.body.linvel();

    if (pet.carriedBy === null) {
      const stand = (petTune.radius + petTune.halfHeight) * pet.scale;
      const floor = this.isFloor(position.x, position.z);
      // "Was above the floor a step ago" catches fast falls that would otherwise skip past it in one step.
      const landing = floor && position.y <= stand + 0.03 && pet.py > stand - petTune.stepUp && velocity.y <= 0.5;
      if (landing) {
        if (!pet.grounded && velocity.y < -2) this.hooks.emit({ t: 'land', pet: pet.id, speed: -velocity.y });
        if (pet.thrown) {
          velocity.x *= grab.landGrip;
          velocity.z *= grab.landGrip;
        }
        inner.body.setTranslation({ x: position.x, y: stand, z: position.z }, true);
        inner.body.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
        inner.body.setGravityScale(0, true);
        position.y = stand;
        velocity.y = 0;
        pet.thrown = false;
      } else {
        inner.body.setGravityScale(1, true);
      }
      pet.grounded = landing;
      if (!pet.falling && !floor && position.y < stand - petTune.stepUp) {
        pet.falling = true;
        this.hooks.emit({ t: 'fall', pet: pet.id, seat: pet.seat });
      }
    } else {
      pet.grounded = false;
    }

    pet.x = position.x;
    pet.y = position.y;
    pet.z = position.z;
    pet.vx = velocity.x;
    pet.vy = velocity.y;
    pet.vz = velocity.z;

    const reach = petTune.teeterDistance;
    pet.teeter =
      pet.grounded && Math.hypot(pet.vx, pet.vz) < 1.2 &&
      (!this.isFloor(pet.x + reach, pet.z) || !this.isFloor(pet.x - reach, pet.z) || !this.isFloor(pet.x, pet.z + reach) || !this.isFloor(pet.x, pet.z - reach));

    if (pet.thrown) {
      inner.thrownFor += STEP;
      // A thrown pet is a projectile: the first rival it touches is knocked, credited to the thrower.
      for (const other of this.pets) {
        if (!other.alive || other === pet || other.id === inner.thrower || other.carriedBy !== null) continue;
        if (Math.hypot(other.x - pet.x, other.z - pet.z) > petTune.radius * (pet.scale + other.scale) + 0.1 || Math.abs(other.y - pet.y) > 1.2) continue;
        const speed = Math.hypot(pet.vx, pet.vz) || 1;
        const thrower = inner.thrower === null ? undefined : this.petById(inner.thrower);
        this.knock(other, pet.vx / speed, pet.vz / speed, grab.throwHitForce, grab.throwHitLift, { seat: thrower?.seat ?? pet.seat, step: this.steps, cause: 'throw' });
        this.hooks.emit({ t: 'throwHit', pet: pet.id, victim: other.id, seat: thrower?.seat ?? null, x: (pet.x + other.x) / 2, z: (pet.z + other.z) / 2 });
        pet.thrown = false;
        break;
      }
    }

    if (pet.decoy) {
      // A decoy goes off the moment it touches anyone but its owner.
      const touched = this.pets.some(
        other => other.alive && other.seat !== pet.seat && Math.hypot(other.x - pet.x, other.z - pet.z) < petTune.radius * (pet.scale + other.scale) + 0.15 && Math.abs(other.y - pet.y) < 1.2,
      );
      if (touched) {
        this.explode(pet.x, pet.y, pet.z, 1.9, 10, 5, { seat: pet.seat, step: this.steps, cause: 'power' }, 0, { spareSeat: pet.seat });
        return this.removePet(pet);
      }
    }

    if (pet.y < arena.killY) this.eliminate(pet);
  }

  private eliminate(pet: Pet, forced?: Cause): void {
    const credit = pet.lastHit && this.steps - pet.lastHit.step <= CREDIT_STEPS ? pet.lastHit : null;
    const cause = forced ?? credit?.cause ?? 'fall';
    // A self-destruct is nobody's kill, and neither is being knocked off by your own blast.
    const killer = !forced && credit && credit.seat >= 0 && credit.seat !== pet.seat ? credit.seat : null;
    // Whoever this pet was carrying goes down with it, and that counts as the carrier's doing.
    this.dropCarried(pet, { seat: pet.seat, step: this.steps, cause: 'throw' });
    const { x, z, id, seat, decoy } = pet;
    this.removePet(pet);
    this.hooks.emit({ t: 'eliminated', pet: id, seat, decoy, cause, killer, x, z });
    if (decoy) return;

    if (this.mode === 'lobby') {
      this.respawns.push({ seat, left: match.lobbyRespawn });
      return;
    }
    this.out.push(seat);
    // Clones do not outlive their owner.
    for (const clone of this.pets.filter(other => other.decoy && other.seat === seat)) this.removePet(clone);

    const avenger = credit?.cause === 'meteor' && killer !== null ? this.ghosts.find(ghost => ghost.seat === killer) : undefined;
    if (avenger) {
      // Revenge swap: the ghost that landed the meteor takes a body again, and its victim haunts instead.
      this.ghosts.splice(this.ghosts.indexOf(avenger), 1);
      const position = this.out.indexOf(avenger.seat);
      if (position >= 0) this.out.splice(position, 1);
      const setup = this.seats.get(avenger.seat);
      const spot = this.freeSpot();
      if (setup) this.spawnPet(setup, spot.x, 7, spot.z, false);
      this.hooks.emit({ t: 'revengeSwap', ghost: avenger.seat, victim: seat });
    }
    const cooldown = avenger ? meteorTune.cooldownAfterSwap : 1.5;
    this.ghosts.push({ seat, x: clamp(x, -CURSOR_LIMIT, CURSOR_LIMIT), z: clamp(z, -CURSOR_LIMIT, CURSOR_LIMIT), cooldown, cooldownTotal: cooldown, cursor: true });
    this.hooks.emit({ t: 'ghost', seat, x, z });
  }

  /** Takes a pet off the platform without it counting as a knockout. */
  private removePet(pet: Pet): void {
    const index = this.pets.indexOf(pet);
    if (index < 0) return;
    this.dropCarried(pet, null);
    if (pet.carriedBy !== null) {
      const carrier = this.petById(pet.carriedBy);
      if (carrier) carrier.carrying = null;
    }
    pet.alive = false;
    this.pets.splice(index, 1);
    this.physics.remove(this.inner.get(pet.id)!.body);
    this.inner.delete(pet.id);
  }

  private checkFinished(): void {
    if (this.mode !== 'match' || !this.playing || this.finished) return;
    if (new Set(this.aliveSeats()).size <= 1 || this.time >= this.cap) this.finished = true;
  }

  // ── Tiles ──────────────────────────────────────────────────────────────────

  private tickTiles(): void {
    if (this.mode !== 'match' || !this.playing) return;
    const rings = (SIZE - arena.minSize) / 2;
    const warnAt = (ring: number) => arena.shrinkAfter + ring * arena.ringEvery;
    while (this.ringsWarned < rings && this.time >= warnAt(this.ringsWarned)) this.setRing(this.ringsWarned++, TILE.warning);
    while (this.ringsFallen < rings && this.time >= warnAt(this.ringsFallen) + arena.warnTime) this.setRing(this.ringsFallen++, TILE.gone);
  }

  /** Ring 0 is the outer edge of the platform, ring 1 the next one in, and so on. */
  private setRing(ring: number, state: number): void {
    for (let column = 0; column < SIZE; column++) {
      for (let row = 0; row < SIZE; row++) {
        if (Math.min(column, row, SIZE - 1 - column, SIZE - 1 - row) !== ring) continue;
        const index = column * SIZE + row;
        if (this.tiles[index] === TILE.gone) continue;
        this.tiles[index] = state;
        this.hooks.emit(state === TILE.warning ? { t: 'tileWarn', index } : { t: 'tileFall', index, broken: false });
      }
    }
  }

  private breakTiles(x: number, z: number, radius: number): void {
    for (let column = 0; column < SIZE; column++) {
      for (let row = 0; row < SIZE; row++) {
        const index = column * SIZE + row;
        if (this.tiles[index] === TILE.gone) continue;
        if (Math.hypot(column - HALF + 0.5 - x, row - HALF + 0.5 - z) > radius) continue;
        this.tiles[index] = TILE.gone;
        this.hooks.emit({ t: 'tileFall', index, broken: true });
      }
    }
  }

  // ── Mystery Cube and powers ────────────────────────────────────────────────

  private tickCube(): void {
    if (this.mode !== 'match' || !this.playing) return;
    if (!this.cube) {
      this.nextCubeIn -= STEP;
      if (this.nextCubeIn > 0) return;
      const spot = this.freeSpot();
      const index = Math.floor(spot.x + HALF) * SIZE + Math.floor(spot.z + HALF);
      // Not on a tile that is about to go: try again next step.
      if (this.tiles[index] !== TILE.solid) return;
      this.cube = { id: this.nextId++, x: spot.x, y: 12, z: spot.z, landed: false };
      this.hooks.emit({ t: 'cubeSpawn', x: spot.x, z: spot.z });
      return;
    }
    const cube = this.cube;
    if (!cube.landed) {
      cube.y -= ((12 - 0.5) / cubeTune.dropTime) * STEP;
      if (cube.y <= 0.5) {
        cube.y = 0.5;
        cube.landed = true;
      }
    }
    if (!this.isFloor(cube.x, cube.z)) {
      this.cube = null;
      this.nextCubeIn = this.rng.range(cubeTune.minGap, cubeTune.maxGap) / 2;
      return;
    }
    if (cube.y > 1.6) return;
    for (const pet of this.pets) {
      if (!pet.alive || pet.decoy || pet.slot || pet.carriedBy !== null) continue;
      if (Math.hypot(pet.x - cube.x, pet.z - cube.z) > cubeTune.pickupRadius * Math.max(1, pet.scale)) continue;
      // The result is decided now; the slot reels only show it.
      const roll = this.hooks.roll(pet.seat);
      pet.slot = { tier: roll.tier, power: roll.power, left: cubeTune.slotTime };
      this.hooks.emit({ t: 'cubeCollected', pet: pet.id, seat: pet.seat, x: cube.x, z: cube.z });
      this.hooks.emit({ t: 'roll', pet: pet.id, seat: pet.seat, tier: roll.tier, power: roll.power, pity: roll.pity, instant: false });
      this.cube = null;
      this.nextCubeIn = this.rng.range(cubeTune.minGap, cubeTune.maxGap);
      return;
    }
  }

  private grantFree(pet: Pet): void {
    const power = this.hooks.freeCommon();
    this.hooks.emit({ t: 'roll', pet: pet.id, seat: pet.seat, tier: 'common', power, pity: -1, instant: true });
    this.hold(pet, power);
  }

  /** Puts a power on the pet's power button, replacing one it had not used. */
  private hold(pet: Pet, power: PowerId): void {
    pet.held = power;
    this.hooks.emit({ t: 'powerReady', pet: pet.id, seat: pet.seat, power });
  }

  /** The power button: starts the power the pet is holding. */
  private usePower(pet: Pet, stickX: number, stickZ: number): void {
    const power = pet.held;
    if (!power || pet.decoy) return;
    if (power !== 'megaDash') {
      pet.held = null;
      return this.applyPower(pet.id, power);
    }
    // A Mega Dash is the dash itself, so it waits for a moment when the pet could dash.
    if (pet.dashTime > 0 || pet.carrying || pet.reachTime > 0 || this.chargeFrozen) return;
    pet.held = null;
    pet.chargeTime = 0;
    this.hooks.emit({ t: 'powerStart', pet: pet.id, seat: pet.seat, power });
    this.startDash(pet, stickX, stickZ, true);
    this.hooks.emit({ t: 'powerEnd', pet: pet.id, seat: pet.seat, power });
  }

  private tickPowers(): void {
    for (const pet of [...this.pets]) {
      if (!pet.alive) continue;
      if (pet.slot) {
        pet.slot.left -= STEP;
        if (pet.slot.left <= 0) {
          const { tier, power } = pet.slot;
          pet.slot = null;
          if (tier === 'super') this.superPending = { seat: pet.seat, pet: pet.id, power };
          // A curse does not wait to be asked. Anything good goes on the power button.
          else if (tier === 'cursed') this.applyPower(pet.id, power);
          else this.hold(pet, power);
        }
      }
      if (!pet.power) continue;
      pet.powerLeft -= STEP;
      if (pet.powerLeft <= 0) {
        this.endPower(pet);
        continue;
      }
      const inner = this.inner.get(pet.id)!;
      inner.pulse -= STEP;
      if (inner.pulse > 0) continue;
      if (pet.power === 'honk') {
        inner.pulse = 0.5;
        this.hooks.emit({ t: 'honk', pet: pet.id });
      } else if (pet.power === 'kaiju' && pet.grounded && Math.hypot(pet.vx, pet.vz) > 1.5) {
        // Every step of a kaiju shakes the floor around it.
        inner.pulse = supers.kaijuStepEvery;
        this.explode(pet.x, 0, pet.z, supers.kaijuStepRadius, supers.kaijuStepForce, supers.kaijuStepLift, { seat: pet.seat, step: this.steps, cause: 'power' }, 0, { spareSeat: pet.seat });
      } else if (pet.power === 'meteorShower') {
        inner.pulse = supers.showerEvery;
        this.showerMeteor(pet, inner.pulses++);
      }
    }
  }

  /** One meteor of a Meteor Shower. Most are aimed at a rival, each in turn, a little ahead of where it is running. */
  private showerMeteor(pet: Pet, shot: number): void {
    const far = (x: number, z: number) => Math.hypot(x - pet.x, z - pet.z) >= supers.showerSafe;
    const rivals = this.pets.filter(other => other.alive && !other.decoy && !other.falling && other.seat !== pet.seat);
    if (rivals.length > 0 && shot % 3 < supers.showerAimed) {
      const target = rivals[(Math.floor(shot / 3) * supers.showerAimed + (shot % 3)) % rivals.length]!;
      const lead = supers.showerDelay * supers.showerLead;
      const x = target.x + target.vx * lead;
      const z = target.z + target.vz * lead;
      // A rival standing right beside the caller is out of the shower's reach.
      if (far(x, z)) return this.callMeteor(x, z, supers.showerDelay, supers.showerRadius, supers.showerForce, supers.showerHole, pet.seat, false);
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = this.rng.range(-HALF, HALF);
      const z = this.rng.range(-HALF, HALF);
      if (!this.isFloor(x, z) || !far(x, z)) continue;
      return this.callMeteor(x, z, supers.showerDelay, supers.showerRadius, supers.showerForce, supers.showerHole, pet.seat, false);
    }
  }

  private endPower(pet: Pet): void {
    const power = pet.power;
    if (!power) return;
    pet.power = null;
    pet.powerLeft = 0;
    this.rescale(pet, 1, 1);
    if (power === 'decoys') for (const clone of this.pets.filter(other => other.decoy && other.seat === pet.seat)) this.eliminateQuietly(clone);
    this.hooks.emit({ t: 'powerEnd', pet: pet.id, seat: pet.seat, power });
  }

  /** A clone whose time is up pops like any knocked-out pet, but scores nothing. */
  private eliminateQuietly(pet: Pet): void {
    const { x, z, id, seat } = pet;
    this.removePet(pet);
    this.hooks.emit({ t: 'eliminated', pet: id, seat, decoy: true, cause: 'power', killer: null, x, z });
  }

  private rescale(pet: Pet, scale: number, mass: number): void {
    if (pet.scale === scale) return;
    const body = this.inner.get(pet.id)!.body;
    // Keep the feet where they are while the body grows or shrinks.
    const lift = (petTune.radius + petTune.halfHeight) * (scale - pet.scale);
    const position = body.translation();
    body.setTranslation({ x: position.x, y: position.y + Math.max(0, lift), z: position.z }, true);
    pet.scale = scale;
    this.physics.resizeCapsule(body, petTune.radius * scale, petTune.halfHeight * scale, mass);
  }

  private decoyInput(pet: Pet): SampledInput {
    const inner = this.inner.get(pet.id)!;
    inner.heading += this.rng.range(-0.25, 0.25);
    // Chase the nearest rival, and turn back toward the middle before running off an edge.
    let nearest = 6;
    for (const other of this.pets) {
      if (!other.alive || other.seat === pet.seat) continue;
      const distance = Math.hypot(other.x - pet.x, other.z - pet.z);
      if (distance < nearest) {
        nearest = distance;
        inner.heading = Math.atan2(other.x - pet.x, other.z - pet.z);
      }
    }
    if (!this.isFloor(pet.x + Math.sin(inner.heading) * 1.3, pet.z + Math.cos(inner.heading) * 1.3)) inner.heading = Math.atan2(-pet.x, -pet.z);
    return { x: Math.sin(inner.heading), y: -Math.cos(inner.heading), a: false, b: false, stale: false, edges: [] };
  }

  // ── Meteors and ghosts ─────────────────────────────────────────────────────

  private callMeteor(x: number, z: number, delay: number, radius: number, force: number, hole: number, owner: number, fromGhost: boolean): void {
    const id = this.nextId++;
    this.meteors.push({ id, x, z, left: delay, total: delay, radius, force, hole, owner, fromGhost });
    this.hooks.emit({ t: 'meteorCall', id, x, z, delay, radius, owner });
  }

  private tickMeteors(): void {
    for (let index = this.meteors.length - 1; index >= 0; index--) {
      const meteor = this.meteors[index]!;
      meteor.left -= STEP;
      if (meteor.left > 0) continue;
      this.meteors.splice(index, 1);
      // A ghost's meteor is a "meteor" knock, which is what earns the revenge swap. The power's meteors are not.
      const credit: Credit = { seat: meteor.owner, step: this.steps, cause: meteor.fromGhost ? 'meteor' : 'power' };
      this.explode(meteor.x, 0.3, meteor.z, meteor.radius, meteor.force, 6, credit, 0, meteor.fromGhost ? {} : { spareSeat: meteor.owner, hole: meteor.hole });
    }
  }

  private tickGhosts(read: (seat: number) => SampledInput): void {
    if (!this.playing) return;
    for (const ghost of this.ghosts) {
      const input = read(ghost.seat);
      ghost.x = clamp(ghost.x + input.x * meteorTune.cursorSpeed * STEP, -CURSOR_LIMIT, CURSOR_LIMIT);
      ghost.z = clamp(ghost.z - input.y * meteorTune.cursorSpeed * STEP, -CURSOR_LIMIT, CURSOR_LIMIT);
      ghost.cooldown = Math.max(0, ghost.cooldown - STEP);
      if (ghost.cooldown > 0 || !input.edges.some(edge => edge.button === 'a' && edge.down)) continue;
      ghost.cooldown = ghost.cooldownTotal = meteorTune.cooldown;
      this.callMeteor(ghost.x, ghost.z, meteorTune.delay, meteorTune.radius, meteorTune.force, 0, ghost.seat, true);
    }
  }
}
