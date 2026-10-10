// The floor the simple games are played on. A grid of tiles, pets that walk on it with the brawl's own
// movement numbers, and the few things a game may ask of it: a jump, a lunge, a knock, a respawn, a pet
// taken out. Each game is a small set of rules on top (`MiniRules`); the brawl has its own class (`Round`).
import type { SampledInput } from '../input';
import { Physics, type Body } from '../physics';
import type { Rng } from '../rng';
import { meteor as meteorTune, pet as petTune, STEP } from '../tuning';
import { TILE, type Cause, type GameEvent, type Ghost, type MiniMode, type Pet, type RoundCore, type SeatSetup } from '../types';

const STAND = petTune.radius + petTune.halfHeight;
/** A pet this far below the floor has fallen. Nearer than the brawl's, so a game that brings pets back does it soon. */
const KILL_Y = -6;
/** The tallest step a tile may be: anything higher and a pet would sink into it instead of stepping up. */
const MAX_HEIGHT = 0.3;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export type FieldHooks = { emit(event: GameEvent): void };

/** What keeps pets on the floor, if anything: its rectangle, or a circle round the middle. */
export type Wall = { kind: 'rect' } | { kind: 'circle'; radius: number } | null;

/** One of the simple games: what it adds to a field. */
export interface MiniRules {
  readonly mode: MiniMode;
  /** Seconds of play before the round is called. */
  readonly cap: number;
  /** Lays out the floor (`field.resize`, tiles, wall, what a fall does). Called once, before any pet exists. */
  setup(field: Field): void;
  /** Where the pet of the `index`th of `count` seats starts. */
  spawn(field: Field, index: number, count: number): { x: number; z: number };
  /** Once per step while the round is played, after the pets have been steered. `inputs` holds each seat's input for this step. */
  step(field: Field, inputs: ReadonlyMap<number, SampledInput>): void;
  /** A living pet pressed A. */
  pressA?(field: Field, pet: Pet, stickX: number, stickZ: number): void;
  /** A lunging pet reached another. Returns true if that ends the lunge as a hit. */
  touch?(field: Field, pet: Pet, other: Pet): boolean;
  /** How high the floor stands at a spot, for a game whose floor is not flat tile by tile. Never more than 0.3. */
  floorY?(field: Field, x: number, z: number): number;
  /** How fast this pet walks, as a share of normal. */
  speed?(field: Field, pet: Pet): number;
  /** Where a pet that fell comes back, in a game where it does. */
  respawnSpot?(field: Field, pet: Pet): { x: number; z: number };
  /** Whether the round is decided before its time is up. */
  finished(field: Field): boolean;
  /** Places, best first. Seats in one group tied. */
  ranking(field: Field): number[][];
  /** The round's number for a seat's card (tiles painted, food eaten, share of the track), or null in a game without one. */
  metric(field: Field, seat: number): number | 'hidden' | null;
  /** Mixed into the round's hash: two runs with the same seed and inputs must match. */
  hash(): number;
}

type Inner = { body: Body; lungeSpeed: number; restHit: number; restMiss: number };

export class Field<Rules extends MiniRules = MiniRules> implements RoundCore {
  readonly gameMode: Rules['mode'];
  readonly cap: number;
  readonly rules: Rules;
  readonly rng: Rng;
  readonly pets: Pet[] = [];
  readonly ghosts: Ghost[] = [];
  readonly out: number[] = [];
  /** Tiles per side. Each is 1 m; the grid is centred on the origin. */
  columns = 1;
  rows = 1;
  /** One TILE state per tile; index = column * rows + row. */
  tiles = new Uint8Array(1);
  /** A byte per tile that is the game's to use: a colour, an owner, a kind. */
  data = new Uint8Array(1);
  /** How high each tile stands, 0 to 0.3. */
  heights = new Float32Array(1);
  wall: Wall = null;
  /** What happens to a pet that falls off the floor: it is out of the round, or it comes back. */
  fall: 'out' | 'respawn' = 'out';
  time = 0;
  steps = 0;
  playing = false;
  finished = false;

  private readonly physics = new Physics();
  private readonly hooks: FieldHooks;
  private readonly inner = new Map<number, Inner>();
  private readonly inputs = new Map<number, SampledInput>();
  private readonly returning: { pet: Pet; left: number }[] = [];
  private nextId: number;

  /** `firstId` keeps ids unique across rounds, so nothing on screen is mistaken for last round's pet. */
  constructor(rules: Rules, seats: readonly SeatSetup[], rng: Rng, hooks: FieldHooks, firstId = 1) {
    this.rules = rules;
    this.gameMode = rules.mode;
    this.cap = rules.cap;
    this.rng = rng;
    this.hooks = hooks;
    this.nextId = firstId;
    rules.setup(this);
    seats.forEach((seat, index) => {
      const spot = rules.spawn(this, index, seats.length);
      // Pets drop in from the sky one after another.
      this.spawnPet(seat, spot.x, this.floorY(spot.x, spot.z) + 8 + index * 0.6, spot.z);
    });
  }

  // ── What every round offers ────────────────────────────────────────────────

  step(read: (seat: number) => SampledInput): void {
    this.steps++;
    if (this.playing) this.time += STEP;
    for (const pet of this.pets) {
      pet.px = pet.x;
      pet.py = pet.y;
      pet.pz = pet.z;
    }
    // An input is read once: reading takes its button presses with it.
    this.inputs.clear();
    for (const pet of this.pets) this.inputs.set(pet.seat, read(pet.seat));
    for (const ghost of this.ghosts) this.inputs.set(ghost.seat, read(ghost.seat));

    for (const pet of [...this.pets]) if (pet.alive) this.control(pet, this.inputs.get(pet.seat)!);
    if (this.playing) this.rules.step(this, this.inputs);
    this.tickReturning();
    this.driftGhosts();

    this.physics.step();

    for (const pet of [...this.pets]) if (pet.alive) this.settle(pet);
    if (this.playing && !this.finished && (this.time >= this.cap || this.rules.finished(this))) this.finished = true;
  }

  free(): void {
    this.physics.free();
  }

  hash(): number {
    let hash = this.steps;
    const mix = (value: number) => {
      hash = (Math.imul(hash, 31) + Math.round(value * 1000)) | 0;
    };
    for (const pet of this.pets) [pet.id, pet.x, pet.y, pet.z, pet.vx, pet.vz, pet.facing, pet.scale].forEach(mix);
    this.tiles.forEach(mix);
    this.data.forEach(mix);
    this.out.forEach(mix);
    mix(this.rules.hash());
    return hash;
  }

  petOfSeat(seat: number): Pet | undefined {
    return this.pets.find(pet => pet.seat === seat && pet.alive);
  }

  petById(id: number): Pet | undefined {
    return this.pets.find(pet => pet.id === id);
  }

  aliveSeats(): number[] {
    return this.pets.filter(pet => pet.alive).map(pet => pet.seat);
  }

  isFloor(x: number, z: number): boolean {
    const index = this.index(x, z);
    return index >= 0 && this.tiles[index] !== TILE.gone;
  }

  floorY(x: number, z: number): number {
    const index = this.index(x, z);
    if (index < 0) return 0;
    return this.rules.floorY ? clamp(this.rules.floorY(this, x, z), 0, MAX_HEIGHT) : this.heights[index]!;
  }

  ranking(): number[][] {
    return this.rules.ranking(this).filter(group => group.length > 0);
  }

  metric(seat: number): number | 'hidden' | null {
    return this.rules.metric(this, seat);
  }

  // ── What a game may ask of the field ───────────────────────────────────────

  /** Sets the size of the floor, every tile solid and flat. */
  resize(columns: number, rows: number): void {
    this.columns = columns;
    this.rows = rows;
    this.tiles = new Uint8Array(columns * rows);
    this.data = new Uint8Array(columns * rows);
    this.heights = new Float32Array(columns * rows);
  }

  /** The tile under a spot, or -1 off the grid. */
  index(x: number, z: number): number {
    const column = Math.floor(x + this.columns / 2);
    const row = Math.floor(z + this.rows / 2);
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return -1;
    return column * this.rows + row;
  }

  centre(index: number): { x: number; z: number } {
    return { x: Math.floor(index / this.rows) - this.columns / 2 + 0.5, z: (index % this.rows) - this.rows / 2 + 0.5 };
  }

  setHeight(index: number, height: number): void {
    this.heights[index] = clamp(height, 0, MAX_HEIGHT);
  }

  emit(event: GameEvent): void {
    this.hooks.emit(event);
  }

  /** A new id, for something a game puts on the floor. */
  id(): number {
    return this.nextId++;
  }

  /** The living pets. */
  alive(): Pet[] {
    return this.pets.filter(pet => pet.alive);
  }

  /** Sends a pet flying, and takes the stick away for a moment. `light` is a shove: the pet keeps most of its control. */
  knock(pet: Pet, dx: number, dz: number, speed: number, lift: number, light = false): void {
    this.inner.get(pet.id)!.body.setLinvel({ x: dx * speed, y: lift, z: dz * speed }, true);
    pet.authority = light ? Math.min(pet.authority, 0.6) : 0;
    pet.dashTime = 0;
  }

  /** A short burst in one direction: a shove, a bite. A rest follows, `restHit` or `restMiss` seconds long. */
  lunge(pet: Pet, dx: number, dz: number, speed: number, seconds: number, restHit: number, restMiss: number): void {
    const inner = this.inner.get(pet.id)!;
    const length = Math.hypot(dx, dz);
    pet.dashX = length > 0.2 ? dx / length : Math.sin(pet.facing);
    pet.dashZ = length > 0.2 ? dz / length : Math.cos(pet.facing);
    pet.dashTime = seconds;
    pet.dashCharge = 0;
    pet.authority = 0;
    pet.facing = Math.atan2(pet.dashX, pet.dashZ);
    inner.lungeSpeed = speed;
    inner.restHit = restHit;
    inner.restMiss = restMiss;
    this.emit({ t: 'dash', pet: pet.id, charge: 0, x: pet.x, z: pet.z, dx: pet.dashX, dz: pet.dashZ });
  }

  /** Off the floor it goes, if it is standing on it. */
  jump(pet: Pet, speed: number): boolean {
    if (!pet.grounded) return false;
    const body = this.inner.get(pet.id)!.body;
    const velocity = body.linvel();
    body.setLinvel({ x: velocity.x, y: speed, z: velocity.z }, true);
    body.setGravityScale(1, true);
    pet.grounded = false;
    this.emit({ t: 'jump', pet: pet.id });
    return true;
  }

  /** Grows or shrinks a pet, keeping its feet where they are. */
  rescale(pet: Pet, scale: number): void {
    if (pet.scale === scale) return;
    const body = this.inner.get(pet.id)!.body;
    const lift = STAND * (scale - pet.scale);
    const position = body.translation();
    body.setTranslation({ x: position.x, y: position.y + Math.max(0, lift), z: position.z }, true);
    pet.scale = scale;
    this.physics.resizeCapsule(body, petTune.radius * scale, petTune.halfHeight * scale, scale);
  }

  /** Puts a pet back on the floor at a spot, dropping in from just above. It is the same pet: nothing counts it as knocked out. */
  respawn(pet: Pet, x: number, z: number): void {
    const body = this.inner.get(pet.id)!.body;
    // A few pets coming back to one spot would be thrown apart, so each seat lands a little to one side.
    const angle = (pet.seat / 6) * Math.PI * 2;
    const to = { x: x + Math.sin(angle) * 0.45, y: this.floorY(x, z) + STAND * pet.scale + 3, z: z + Math.cos(angle) * 0.45 };
    body.setTranslation(to, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setGravityScale(1, true);
    Object.assign(pet, { x: to.x, y: to.y, z: to.z, px: to.x, py: to.y, pz: to.z, vx: 0, vy: 0, vz: 0, falling: false, grounded: false, authority: 0.4, dashTime: 0 });
    this.emit({ t: 'respawn', pet: pet.id, seat: pet.seat, x: to.x, z: to.z });
  }

  /** Takes a pet out of the round. Its player watches as a ghost that drifts with the stick. */
  eliminate(pet: Pet, cause: Cause): void {
    const index = this.pets.indexOf(pet);
    if (index < 0) return;
    const { x, z, id, seat } = pet;
    pet.alive = false;
    this.pets.splice(index, 1);
    this.physics.remove(this.inner.get(id)!.body);
    this.inner.delete(id);
    this.out.push(seat);
    this.emit({ t: 'eliminated', pet: id, seat, decoy: false, cause, killer: null, x, z });
    const half = { x: this.columns / 2, z: this.rows / 2 };
    this.ghosts.push({ seat, x: clamp(x, -half.x, half.x), z: clamp(z, -half.z, half.z), cooldown: 0, cooldownTotal: 0, cursor: false });
    this.emit({ t: 'ghost', seat, x, z });
  }

  // ── Pets ───────────────────────────────────────────────────────────────────

  private spawnPet(setup: SeatSetup, x: number, y: number, z: number): void {
    const id = this.nextId++;
    this.pets.push({
      id, seat: setup.seat, decoy: false, pet: setup.pet, alive: true,
      x, y, z, px: x, py: y, pz: z, vx: 0, vy: 0, vz: 0,
      facing: Math.atan2(-x, -z), grounded: false, falling: false, teeter: false, scale: 1,
      chargeTime: 0, dashTime: 0, dashCharge: 0, dashX: 0, dashZ: 1, dashCooldown: 0, dashCooldownTotal: 0, authority: 1,
      reachTime: 0, reachTarget: null, carriedBy: null, carrying: null, carriedTime: 0, mash: 0, grabImmune: 0, grabTarget: null, grabLock: 0,
      thrown: false, lastHit: null, power: null, powerLeft: 0, powerTotal: 0, held: null, slot: null, respawnIn: 0,
    });
    this.inner.set(id, { body: this.physics.addCapsule(x, y, z, petTune.radius, petTune.halfHeight, 1), lungeSpeed: 0, restHit: 0, restMiss: 0 });
    this.emit({ t: 'spawn', pet: id, seat: setup.seat });
  }

  /** Stick to motion, with the brawl's own numbers, so a pet feels the same in every game. */
  private control(pet: Pet, input: SampledInput): void {
    const inner = this.inner.get(pet.id)!;
    pet.dashCooldown = Math.max(0, pet.dashCooldown - STEP);
    pet.authority = Math.min(1, pet.authority + STEP / petTune.controlRecovery);
    const stickX = input.x;
    const stickZ = -input.y;

    if (this.playing && pet.dashTime <= 0 && !pet.falling && input.edges.some(edge => edge.button === 'a' && edge.down)) {
      // A rests after it is used, as in the brawl, and a press while it rests says so.
      if (pet.dashCooldown > 0) this.emit({ t: 'tired', pet: pet.id });
      else this.rules.pressA?.(this, pet, stickX, stickZ);
    }

    const velocity = inner.body.linvel();
    if (pet.dashTime > 0) {
      pet.dashTime -= STEP;
      inner.body.setLinvel({ x: pet.dashX * inner.lungeSpeed, y: velocity.y, z: pet.dashZ * inner.lungeSpeed }, true);
      const reach = petTune.radius * pet.scale + 0.18;
      const touched = this.pets.find(
        other => other.alive && other !== pet && Math.abs(other.y - pet.y) <= 1.2 * Math.max(pet.scale, other.scale) && Math.hypot(other.x - pet.x, other.z - pet.z) <= reach + petTune.radius * other.scale,
      );
      const hit = touched ? (this.rules.touch?.(this, pet, touched) ?? false) : false;
      if (hit || pet.dashTime <= 0) {
        pet.dashTime = 0;
        pet.authority = 0.5;
        pet.dashCooldown = pet.dashCooldownTotal = hit ? inner.restHit : inner.restMiss;
        if (hit) inner.body.setLinvel({ x: pet.dashX * 1.5, y: 0, z: pet.dashZ * 1.5 }, true);
        this.emit({ t: 'dashEnd', pet: pet.id, seat: pet.seat, hit });
      }
      return;
    }

    const speed = petTune.speed * (this.rules.speed?.(this, pet) ?? 1);
    const blend = 1 - Math.exp(-petTune.control * pet.authority * STEP);
    let vx = velocity.x + (stickX * speed - velocity.x) * blend;
    let vz = velocity.z + (stickZ * speed - velocity.z) * blend;
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

  /** Reads a pet back from physics and applies the floor: tiles hold it up at their height, missing tiles let it fall. */
  private settle(pet: Pet): void {
    const inner = this.inner.get(pet.id)!;
    const position = inner.body.translation();
    const velocity = inner.body.linvel();
    const radius = petTune.radius * pet.scale;

    // A wall is a line the pet cannot cross: it is put back inside, and loses the speed that carried it out.
    if (this.wall?.kind === 'rect') {
      const limitX = this.columns / 2 - radius;
      const limitZ = this.rows / 2 - radius;
      const x = clamp(position.x, -limitX, limitX);
      const z = clamp(position.z, -limitZ, limitZ);
      if (x !== position.x) velocity.x = 0;
      if (z !== position.z) velocity.z = 0;
      if (x !== position.x || z !== position.z) {
        position.x = x;
        position.z = z;
        inner.body.setTranslation(position, true);
        inner.body.setLinvel(velocity, true);
      }
    } else if (this.wall?.kind === 'circle') {
      const distance = Math.hypot(position.x, position.z);
      const limit = this.wall.radius - radius;
      if (distance > limit) {
        const nx = position.x / distance;
        const nz = position.z / distance;
        const outward = Math.max(0, velocity.x * nx + velocity.z * nz);
        position.x = nx * limit;
        position.z = nz * limit;
        velocity.x -= nx * outward;
        velocity.z -= nz * outward;
        inner.body.setTranslation(position, true);
        inner.body.setLinvel(velocity, true);
      }
    }

    const stand = STAND * pet.scale;
    const floor = this.isFloor(position.x, position.z);
    const top = floor ? this.floorY(position.x, position.z) : 0;
    // "Was above the floor a step ago" catches fast falls that would otherwise skip past it in one step.
    const landing = floor && position.y <= top + stand + 0.03 && pet.py > top + stand - petTune.stepUp && velocity.y <= 0.5;
    if (landing) {
      if (!pet.grounded && velocity.y < -2) this.emit({ t: 'land', pet: pet.id, speed: -velocity.y });
      inner.body.setTranslation({ x: position.x, y: top + stand, z: position.z }, true);
      inner.body.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
      inner.body.setGravityScale(0, true);
      position.y = top + stand;
      velocity.y = 0;
    } else {
      inner.body.setGravityScale(1, true);
    }
    pet.grounded = landing;
    if (!pet.falling && !floor && position.y < stand - petTune.stepUp) {
      pet.falling = true;
      this.emit({ t: 'fall', pet: pet.id, seat: pet.seat });
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

    if (pet.y >= KILL_Y) return;
    if (this.fall === 'out') return this.eliminate(pet, 'fall');
    // It is on its way back: held out of sight until it drops in again.
    if (!this.returning.some(entry => entry.pet === pet)) this.returning.push({ pet, left: 0.6 });
    inner.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    inner.body.setGravityScale(0, true);
  }

  private tickReturning(): void {
    for (let index = this.returning.length - 1; index >= 0; index--) {
      const entry = this.returning[index]!;
      entry.left -= STEP;
      if (entry.left > 0) continue;
      this.returning.splice(index, 1);
      if (!entry.pet.alive) continue;
      const spot = this.rules.respawnSpot?.(this, entry.pet) ?? this.rules.spawn(this, entry.pet.seat, 6);
      this.respawn(entry.pet, spot.x, spot.z);
    }
  }

  /** A player who is out floats over the floor and can wander with the stick. It touches nothing. */
  private driftGhosts(): void {
    for (const ghost of this.ghosts) {
      const input = this.inputs.get(ghost.seat);
      if (!input) continue;
      ghost.x = clamp(ghost.x + input.x * meteorTune.cursorSpeed * STEP, -this.columns / 2, this.columns / 2);
      ghost.z = clamp(ghost.z - input.y * meteorTune.cursorSpeed * STEP, -this.rows / 2, this.rows / 2);
    }
  }
}

/** Seats grouped by a score, best first, equal scores sharing a place. */
export function rankBy(seats: readonly number[], score: (seat: number) => number): number[][] {
  const groups = new Map<number, number[]>();
  for (const seat of seats) groups.set(score(seat), [...(groups.get(score(seat)) ?? []), seat]);
  return [...groups].sort((a, b) => b[0] - a[0]).map(([, group]) => group);
}
