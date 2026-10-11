// O Chão é Lava: furniture falls from the sky, an alarm sounds, and then the lava comes up over everything
// that is not furniture. Whoever is not standing on a piece is out. What is left of the furniture sinks, new
// pieces fall somewhere else with one seat too few, and it starts again, a little faster. A is a shove, for
// the moment two pets want the same seat.
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
  /** The second of the round it lands. Until then it is a mark on the floor and a shape in the sky. */
  at: number;
  landed: boolean;
};

/** How far a piece's safe top reaches from its middle, along x and along z. */
function reach(piece: Pick<Furniture, 'kind' | 'turned'>): { x: number; z: number } {
  const { radius, width, depth } = lava.pieces[piece.kind];
  if (radius > 0) return { x: radius, z: radius };
  return piece.turned ? { x: depth / 2, z: width / 2 } : { x: width / 2, z: depth / 2 };
}

/** Whether a spot is over the safe top of a piece. */
function over(piece: Furniture, x: number, z: number): boolean {
  const { radius } = lava.pieces[piece.kind];
  if (radius > 0) return Math.hypot(piece.x - x, piece.z - z) <= radius;
  const half = reach(piece);
  return Math.abs(piece.x - x) <= half.x && Math.abs(piece.z - z) <= half.z;
}

/** Where pets stand on a piece: one spot for each it holds. A bot heads for one; a person finds them by eye. */
export function seatsOf(piece: Furniture): { x: number; z: number }[] {
  const { seats, radius, width, depth } = lava.pieces[piece.kind];
  if (radius > 0) return [{ x: piece.x, z: piece.z }];
  // Along the width, spaced so each has room; a square piece seats them at its corners.
  const square = Math.abs(width - depth) < 0.01;
  const spots = square
    ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].slice(0, seats).map(([a, b]) => ({ a: a! * (width / 2 - 0.25), b: b! * (depth / 2 - 0.25) }))
    : Array.from({ length: seats }, (_, index) => ({ a: (index - (seats - 1) / 2) * ((width - 0.5) / Math.max(1, seats - 1)), b: 0 }));
  return spots.map(({ a, b }) => (piece.turned ? { x: piece.x + b, z: piece.z + a } : { x: piece.x + a, z: piece.z + b }));
}

export class LavaRules implements MiniRules {
  readonly mode = 'lava' as const;
  readonly cap = lava.cap;
  readonly stepUp = lava.stepUp;
  /** Calm: furniture is falling or down, and there is time to get on. Alarm: the lava is coming. Flood: it is here. */
  phase: 'calm' | 'alarm' | 'flood' = 'calm';
  /** Seconds left of the phase. */
  left = 0;
  wave = 0;
  /** The furniture of this wave, in the order it lands. */
  pieces: Furniture[] = [];
  /** The wave each seat went out in. Seats out in the same wave tie. */
  private readonly outWave = new Map<number, number>();
  private made = 0;

  setup(field: Field): void {
    field.resize(lava.columns, lava.rows);
    field.wall = { kind: 'rect' };
  }

  spawn(field: Field, index: number, count: number): { x: number; z: number } {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return { x: Math.sin(angle) * field.columns * 0.28, z: Math.cos(angle) * field.rows * 0.28 };
  }

  step(field: Field): void {
    if (this.wave === 0) this.startWave(field);
    // Pieces come down one after another. A pet under one is lifted onto it: nothing here falls on anyone's head.
    for (const piece of this.pieces) {
      if (piece.landed || field.time < piece.at) continue;
      piece.landed = true;
      field.emit({ t: 'furniture', phase: 'land', id: piece.id, kind: piece.kind, x: piece.x, z: piece.z, seconds: 0 });
    }
    this.left -= STEP;
    if (this.left > 0) return;
    if (this.phase === 'calm') this.enter(field, 'alarm', lava.alarm);
    else if (this.phase === 'alarm') {
      this.enter(field, 'flood', lava.flood);
      // The lava is up: anyone whose feet are not on furniture is out.
      for (const pet of field.alive()) {
        if (this.floorY(field, pet.x, pet.z) > 0) continue;
        this.outWave.set(pet.seat, this.wave);
        field.eliminate(pet, 'lava');
      }
    } else this.startWave(field);
  }

  pressA(field: Field, pet: Pet, stickX: number, stickZ: number): void {
    field.lunge(pet, stickX, stickZ, lava.shoveSpeed, lava.shoveSeconds, lava.shoveRest, lava.shoveRestMiss);
  }

  /** A shove: the pet that was touched is pushed along, and keeps most of its footing. */
  touch(field: Field, pet: Pet, other: Pet): boolean {
    field.knock(other, pet.dashX, pet.dashZ, lava.shoveForce, lava.shoveLift, true);
    field.emit({ t: 'dashHit', pet: pet.id, seat: pet.seat, x: (pet.x + other.x) / 2, y: pet.y, z: (pet.z + other.z) / 2, charge: 0, radius: 0, victims: [other.id] });
    return true;
  }

  /** The floor is flat, except where a piece of furniture has landed. */
  floorY(_field: Field, x: number, z: number): number {
    return this.pieces.some(piece => piece.landed && over(piece, x, z)) ? lava.height : 0;
  }

  finished(field: Field): boolean {
    return field.alive().length <= 1;
  }

  /** Whoever is still standing, then everyone else by the wave that took them, latest first. */
  ranking(field: Field): number[][] {
    const waves = [...new Set(this.outWave.values())].sort((a, b) => b - a);
    return [field.aliveSeats(), ...waves.map(wave => field.out.filter(seat => this.outWave.get(seat) === wave))];
  }

  metric(): null {
    return null;
  }

  hash(): number {
    let hash = this.wave * 1000 + Math.round(this.left * 100) + (this.phase === 'calm' ? 0 : this.phase === 'alarm' ? 1 : 2) * 100_000;
    for (const piece of this.pieces) hash = (Math.imul(hash, 31) + Math.round(piece.x * 10) * 7 + Math.round(piece.z * 10) + (piece.landed ? 1 : 0) + (piece.turned ? 2 : 0) + FURNITURE_KINDS.indexOf(piece.kind) * 4 + Math.round(piece.at * 60) * 32) | 0;
    for (const [seat, wave] of this.outWave) hash = (Math.imul(hash, 31) + seat * 100 + wave) | 0;
    return hash;
  }

  /**
   * What is left of the last wave's furniture sinks, and new pieces are picked: between them one seat fewer than
   * there are pets, so somebody has to be left out, and two fewer in the late waves. The first waves are kinder,
   * with a seat for everyone: they are the ones to learn on. Each piece's spot is known from now, and they land
   * one after another.
   */
  private startWave(field: Field): void {
    this.wave++;
    const short = this.wave <= lava.spareWaves ? 0 : this.wave < lava.scarceFrom ? 1 : 2;
    let seats = Math.max(1, field.alive().length - short);
    // Never one piece for everybody: with two or more to seat there are at least two places to run to.
    const most = Math.max(1, seats - 1);
    const pieces: Furniture[] = [];
    while (seats > 0) {
      // Any piece that does not hold more than are still to be seated. Big ones bring pets together, which is where the shoving is.
      const fitting = FURNITURE_KINDS.filter(kind => lava.pieces[kind].seats <= Math.min(seats, most));
      const kind = fitting[field.rng.int(fitting.length)]!;
      seats -= lava.pieces[kind].seats;
      const turned = field.rng.chance(0.5);
      const half = reach({ kind, turned });
      let spot = { x: 0, z: 0 };
      for (let attempt = 0; attempt < 300; attempt++) {
        spot = {
          x: field.rng.range(-field.columns / 2 + half.x + lava.gap, field.columns / 2 - half.x - lava.gap),
          z: field.rng.range(-field.rows / 2 + half.z + lava.gap, field.rows / 2 - half.z - lava.gap),
        };
        // Clear of every piece already placed, by the gap, measured edge to edge along each axis.
        const clear = pieces.every(other => {
          const theirs = reach(other);
          return Math.abs(other.x - spot.x) > half.x + theirs.x + lava.gap || Math.abs(other.z - spot.z) > half.z + theirs.z + lava.gap;
        });
        if (clear) break;
      }
      const at = field.time + lava.dropFirst + pieces.length * lava.dropEvery;
      const piece: Furniture = { id: ++this.made, kind, x: spot.x, z: spot.z, turned, at, landed: false };
      pieces.push(piece);
      field.emit({ t: 'furniture', phase: 'fall', id: piece.id, kind, x: piece.x, z: piece.z, seconds: at - field.time });
    }
    this.pieces = pieces;
    // Time to get on once the last piece is down, shorter each wave.
    const last = lava.dropFirst + (pieces.length - 1) * lava.dropEvery;
    this.enter(field, 'calm', last + Math.max(lava.calmMin, lava.calm - (this.wave - 1) * lava.calmStep));
  }

  private enter(field: Field, phase: LavaRules['phase'], seconds: number): void {
    this.phase = phase;
    this.left = seconds;
    field.emit({ t: 'lava', phase, wave: this.wave, seconds });
  }
}
