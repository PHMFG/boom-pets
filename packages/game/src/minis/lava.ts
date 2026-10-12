// O Chão é Lava: the lava rises and never stops, and furniture falls from the sky to climb on. Each layer of
// furniture lands on the one before, a step higher, and the lava takes the layers from the bottom: whoever it
// reaches is out. Later layers have a seat too few. A is a shove, and off the edge of a piece it is a fall to
// the layer below, or into the lava.
import { lava, STEP } from '../tuning';
import type { Pet } from '../types';
import type { Field, MiniRules } from './field';

export type FurnitureKind = keyof typeof lava.pieces;
export const FURNITURE_KINDS = Object.keys(lava.pieces) as FurnitureKind[];

export type Furniture = {
  id: number;
  kind: FurnitureKind;
  x: number;
  z: number;
  /** A quarter turn: its width runs along z. */
  turned: boolean;
  /** Which layer of the pile it belongs to: the first lies on the floor, the second on the first, and so on. */
  layer: number;
  /** How high its top stands over the floor: every piece of a layer the same. */
  top: number;
  /** The second of the round it lands. Until then it is a mark where it will land and a shape in the sky. */
  at: number;
  landed: boolean;
};

type Shape = Pick<Furniture, 'kind' | 'turned'>;
type Placed = Shape & { x: number; z: number };

/** How far a piece's top reaches from its middle, along x and along z. */
export function reach(piece: Shape): { x: number; z: number } {
  const { width, depth } = lava.pieces[piece.kind];
  return piece.turned ? { x: depth / 2, z: width / 2 } : { x: width / 2, z: depth / 2 };
}

/** Whether a spot is over a piece's top, or within `margin` of it. */
function over(piece: Placed, x: number, z: number, margin = 0): boolean {
  const half = reach(piece);
  return Math.abs(piece.x - x) <= half.x + margin && Math.abs(piece.z - z) <= half.z + margin;
}

/** Whether two pieces of one layer would run into each other by more than the seam they are allowed. */
function collide(a: Placed, b: Placed): boolean {
  const first = reach(a);
  const second = reach(b);
  return Math.abs(a.x - b.x) < first.x + second.x - lava.seam - 0.001 && Math.abs(a.z - b.z) < first.z + second.z - lava.seam - 0.001;
}

/** Where pets stand on a piece: one spot for each it seats. A bot heads for one; a person finds them by eye. */
export function seatsOf(piece: Placed): { x: number; z: number }[] {
  const { seats, width, depth } = lava.pieces[piece.kind];
  if (seats === 1) return [{ x: piece.x, z: piece.z }];
  // Along the width, spaced so each has room; a square piece seats them at its corners.
  const square = Math.abs(width - depth) < 0.01;
  const spots = square
    ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].slice(0, seats).map(([a, b]) => ({ a: a! * (width / 2 - 0.5), b: b! * (depth / 2 - 0.5) }))
    : Array.from({ length: seats }, (_, index) => ({ a: (index - (seats - 1) / 2) * ((width - 1) / Math.max(1, seats - 1)), b: 0 }));
  return spots.map(({ a, b }) => (piece.turned ? { x: piece.x + b, z: piece.z + a } : { x: piece.x + a, z: piece.z + b }));
}

export class LavaRules implements MiniRules {
  readonly mode = 'lava' as const;
  readonly cap = lava.cap;
  readonly stepUp = lava.stepUp;
  /** Calm: a layer is falling or down, and there is time to climb. Alarm: the lava is about to take the layer below it. Flood: it just has. */
  phase: 'calm' | 'alarm' | 'flood' = 'calm';
  /** Seconds left of the phase. */
  left = 0;
  /** The layer being climbed to. The lava takes the one below it when the alarm ends. */
  wave = 0;
  /** How high the lava stands over the floor. It never goes down. */
  level: number = lava.start;
  /** Every piece not yet under the lava, the lowest layer first. */
  pieces: Furniture[] = [];
  /** The layer each seat went out in. Seats out in the same layer tie. */
  private readonly outWave = new Map<number, number>();
  private made = 0;
  /** The lava's climb to the next layer it will take: between two heights, between two seconds of the round. */
  private rise = { from: lava.start as number, to: lava.start as number, since: 0, until: 1 };
  /** Seconds of calm left after the flood has been called, before the alarm. */
  private calmAfter = 0;

  setup(field: Field): void {
    field.resize(lava.columns, lava.rows);
    field.wall = { kind: 'rect' };
  }

  spawn(field: Field, index: number, count: number): { x: number; z: number } {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return { x: Math.sin(angle) * field.columns * 0.28, z: Math.cos(angle) * field.rows * 0.28 };
  }

  step(field: Field): void {
    if (this.wave === 0) this.startLayer(field);
    // Pieces come down one after another. A pet under one is carried up on it: nothing here falls on anyone's head.
    for (const piece of this.pieces) {
      if (piece.landed || field.time < piece.at) continue;
      piece.landed = true;
      for (const pet of field.alive()) if (over(piece, pet.x, pet.z) && field.feetOf(pet) < piece.top) field.lift(pet, piece.top);
      field.emit({ t: 'furniture', phase: 'land', id: piece.id, kind: piece.kind, x: piece.x, z: piece.z, seconds: 0 });
    }

    this.left -= STEP;
    if (this.left <= 0) {
      if (this.phase === 'flood') this.enter(field, 'calm', this.calmAfter);
      else if (this.phase === 'calm') this.enter(field, 'alarm', lava.alarm);
      else {
        // The lava is at the layer below the newest. A new layer is called, and the lava starts for this one.
        this.level = this.rise.to;
        this.drown(field);
        if (field.alive().length > 1) this.startLayer(field);
        else this.enter(field, 'flood', lava.flood);
      }
    }

    // The lava climbs all the time, and whoever it reaches is out: on a layer it has taken, or fallen into it.
    const { from, to, since, until } = this.rise;
    this.level = from + (to - from) * Math.min(1, Math.max(0, (field.time - since) / (until - since)));
    this.drown(field);
    // What is well under the lava is gone.
    if (this.pieces.some(piece => piece.top < this.level - 1)) this.pieces = this.pieces.filter(piece => piece.top >= this.level - 1);
  }

  pressA(field: Field, pet: Pet, stickX: number, stickZ: number): void {
    field.lunge(pet, stickX, stickZ, lava.shoveSpeed, lava.shoveSeconds, lava.shoveRest, lava.shoveRestMiss);
  }

  /** Up on the furniture a pet treads carefully. */
  speed(field: Field, pet: Pet): number {
    return field.feetOf(pet) > 0.2 ? lava.pileSpeed : 1;
  }

  /** A shove: the pet that was touched is pushed along, and keeps most of its footing. */
  touch(field: Field, pet: Pet, other: Pet): boolean {
    field.knock(other, pet.dashX, pet.dashZ, lava.shoveForce, lava.shoveLift, true);
    field.emit({ t: 'dashHit', pet: pet.id, seat: pet.seat, x: (pet.x + other.x) / 2, y: pet.y, z: (pet.z + other.z) / 2, charge: 0, radius: 0, victims: [other.id] });
    return true;
  }

  /** The top of the highest piece at a spot that a pet standing at `feet` could be on; the floor where there is none. */
  floorY(_field: Field, x: number, z: number, feet = Infinity): number {
    let top = 0;
    for (const piece of this.pieces) if (piece.landed && piece.top > top && piece.top <= feet + lava.stepUp && over(piece, x, z)) top = piece.top;
    return top;
  }

  /** A piece two layers up, or more, is a wall: a pet that has got into its side is put back beside it. */
  walls(_field: Field, x: number, z: number, feet: number): { x: number; z: number } | null {
    let moved: { x: number; z: number } | null = null;
    for (const piece of this.pieces) {
      if (!piece.landed || piece.top <= feet + lava.stepUp || !over(piece, moved?.x ?? x, moved?.z ?? z, lava.side)) continue;
      const at: { x: number; z: number } = moved ?? { x, z };
      const half = reach(piece);
      // Out by the nearest side.
      const outX = half.x + lava.side - Math.abs(at.x - piece.x);
      const outZ = half.z + lava.side - Math.abs(at.z - piece.z);
      moved = outX < outZ ? { x: piece.x + Math.sign(at.x - piece.x || 1) * (half.x + lava.side + 0.001), z: at.z } : { x: at.x, z: piece.z + Math.sign(at.z - piece.z || 1) * (half.z + lava.side + 0.001) };
    }
    return moved;
  }

  finished(field: Field): boolean {
    return field.alive().length <= 1;
  }

  /** Whoever is still standing, then everyone else by the layer that was being climbed when the lava took them, latest first. */
  ranking(field: Field): number[][] {
    const waves = [...new Set(this.outWave.values())].sort((a, b) => b - a);
    return [field.aliveSeats(), ...waves.map(wave => field.out.filter(seat => this.outWave.get(seat) === wave))];
  }

  metric(): null {
    return null;
  }

  hash(): number {
    let hash = this.wave * 1000 + Math.round(this.left * 100) + (this.phase === 'calm' ? 0 : this.phase === 'alarm' ? 1 : 2) * 100_000 + Math.round(this.level * 1000);
    for (const piece of this.pieces) hash = (Math.imul(hash, 31) + Math.round(piece.x * 10) * 7 + Math.round(piece.z * 10) + (piece.landed ? 1 : 0) + (piece.turned ? 2 : 0) + FURNITURE_KINDS.indexOf(piece.kind) * 4 + Math.round(piece.at * 60) * 32) | 0;
    for (const [seat, wave] of this.outWave) hash = (Math.imul(hash, 31) + seat * 100 + wave) | 0;
    return hash;
  }

  /** Takes out every pet the lava has reached. */
  private drown(field: Field): void {
    for (const pet of field.alive()) {
      // A hair's allowance, so that a pet standing on a layer goes when the lava gets there and not a rounding error later.
      if (field.feetOf(pet) + lava.toe > this.level + 0.004) continue;
      this.outWave.set(pet.seat, this.wave);
      field.eliminate(pet, 'lava');
    }
  }

  /**
   * Calls the next layer of furniture: between its pieces one seat fewer than there are pets, so somebody has to
   * be left out, and two fewer in the late layers. The first layers are kinder, with a seat for everyone: they are
   * the ones to learn on. Every piece's spot is known from now, they land one after another, and from now the lava
   * climbs toward the layer they stand on, to take it when this one has had its time.
   */
  private startLayer(field: Field): void {
    this.wave++;
    const layer = this.wave;
    const short = layer <= lava.spareWaves ? 0 : layer < lava.scarceFrom ? 1 : 2;
    let seats = Math.max(1, field.alive().length - short);
    // Seldom one piece for everybody: with two or more to seat, the layer is made of at least two.
    const most = Math.max(1, seats - 1);
    const below = this.pieces.filter(piece => piece.layer === layer - 1);
    const placed: Furniture[] = [];
    while (seats > 0) {
      // Any piece that does not seat more than are still to be seated. Big ones bring pets together, which is where the shoving is.
      const fitting = FURNITURE_KINDS.filter(kind => lava.pieces[kind].seats <= Math.min(seats, most));
      const kind = fitting[field.rng.int(fitting.length)]!;
      seats -= lava.pieces[kind].seats;
      const turned = field.rng.chance(0.5);
      const spot = this.place(field, { kind, turned }, placed, below);
      // No room for it beside the others: the layer is a seat or two smaller.
      if (!spot) continue;
      const at = field.time + lava.dropFirst + placed.length * lava.dropEvery;
      const piece: Furniture = { id: ++this.made, kind, x: spot.x, z: spot.z, turned, layer, top: layer * lava.height, at, landed: false };
      placed.push(piece);
      field.emit({ t: 'furniture', phase: 'fall', id: piece.id, kind, x: piece.x, z: piece.z, seconds: at - field.time });
    }
    this.pieces.push(...placed);
    // Time to climb once the last piece is down, shorter each layer; then the alarm; then the lava has the layer below.
    const down = lava.dropFirst + Math.max(0, placed.length - 1) * lava.dropEvery;
    const calm = down + Math.max(lava.calmMin, lava.calm - (layer - 1) * lava.calmStep);
    this.rise = { from: this.level, to: (layer - 1) * lava.height + lava.toe, since: field.time, until: field.time + calm + lava.alarm };
    if (layer === 1) return this.enter(field, 'calm', calm);
    this.calmAfter = calm - lava.flood;
    this.enter(field, 'flood', lava.flood);
  }

  /**
   * Finds a spot for a piece of a layer. The first reaches over a piece of the layer below, which is the step up
   * onto it (the very first lies on the floor, in front of the middle); every other stands against one already
   * placed, touching it along a side, so that the layer is one floor. Null if there is no room.
   */
  private place(field: Field, shape: Shape, placed: readonly Placed[], below: readonly Placed[]): { x: number; z: number } | null {
    const half = reach(shape);
    const limit = { x: field.columns / 2 - lava.edge - half.x, z: field.rows / 2 - lava.edge - half.z };
    const fits = (spot: { x: number; z: number }) => Math.abs(spot.x) <= limit.x && Math.abs(spot.z) <= limit.z && !placed.some(other => collide({ ...shape, ...spot }, other));
    // Which way from the piece it stands against: mostly toward the back of the floor, never straight at the camera for a step up.
    const sides = placed.length > 0 ? ([[-1, 0], [1, 0], [0, -1], [0, -1], [0, 1]] as const) : ([[0, -1], [0, -1], [0, -1], [-1, 0], [1, 0]] as const);
    if (placed.length === 0 && below.length === 0) return { x: field.rng.range(-limit.x * 0.5, limit.x * 0.5), z: Math.min(limit.z, field.rng.range(lava.front[0], lava.front[1])) };
    for (let attempt = 0; attempt < 80; attempt++) {
      const against = placed.length > 0 ? placed[field.rng.int(placed.length)]! : below[field.rng.int(below.length)]!;
      const [dx, dz] = sides[field.rng.int(sides.length)]!;
      const theirs = reach(against);
      // How far the two run into each other along the way they meet: a seam within a layer; onto the layer below, a
      // step's worth at the least and as much as the whole of the smaller of the two.
      const most = 2 * Math.min(dx !== 0 ? theirs.x : theirs.z, dx !== 0 ? half.x : half.z);
      const into = placed.length > 0 ? lava.seam : field.rng.range(Math.min(lava.overlap, most), most);
      // And how far to one side it may slide and still share enough of that side.
      const slide = dx !== 0 ? Math.max(0, theirs.z + half.z - lava.shared) : Math.max(0, theirs.x + half.x - lava.shared);
      const aside = field.rng.range(-slide, slide);
      const spot = dx !== 0 ? { x: against.x + dx * (theirs.x + half.x - into), z: against.z + aside } : { x: against.x + aside, z: against.z + dz * (theirs.z + half.z - into) };
      if (fits(spot)) return spot;
    }
    // The first piece of a layer always has a place: square on top of a piece of the layer below.
    if (placed.length === 0) {
      const under = below[field.rng.int(below.length)]!;
      return { x: Math.max(-limit.x, Math.min(limit.x, under.x)), z: Math.max(-limit.z, Math.min(limit.z, under.z)) };
    }
    return null;
  }

  private enter(field: Field, phase: LavaRules['phase'], seconds: number): void {
    this.phase = phase;
    this.left = seconds;
    field.emit({ t: 'lava', phase, wave: this.wave, seconds });
  }
}
