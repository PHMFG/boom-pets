// Corrida Maluca: a track three tiles wide, folded into an S so the whole race fits on the screen, with
// gaps to jump, tiles that blink away, beams to balance on and bars that sweep pets off. A is a jump.
// A fall is never the end: the pet is put back at the last flag it passed. First over the line wins,
// and a few seconds later the round is called.
import { race, STEP } from '../tuning';
import { TILE, type Pet } from '../types';
import { rankBy, type Field, type MiniRules } from './field';

export type Obstacle = 'gap' | 'blink' | 'narrow' | 'sweeper';
export type Sweeper = { x: number; z: number; angle: number; speed: number };

/** The middle of the track, corner to corner: out along the near lane, back along the middle one, out again along the far one. */
const LANE_Z = [6, 0, -6] as const;
const CORNERS = [
  { x: -race.columns / 2 + 1, z: LANE_Z[0] },
  { x: race.columns / 2 - 1.5, z: LANE_Z[0] },
  { x: race.columns / 2 - 1.5, z: LANE_Z[1] },
  { x: -race.columns / 2 + 1.5, z: LANE_Z[1] },
  { x: -race.columns / 2 + 1.5, z: LANE_Z[2] },
  { x: race.columns / 2 - 1, z: LANE_Z[2] },
] as const;
const LEGS = CORNERS.slice(1).map((to, index) => {
  const from = CORNERS[index]!;
  return { from, to, length: Math.hypot(to.x - from.x, to.z - from.z) };
});
const STARTS = LEGS.map((_, index) => LEGS.slice(0, index).reduce((sum, leg) => sum + leg.length, 0));
/** How long the whole track is, in metres. */
export const TRACK = LEGS.reduce((sum, leg) => sum + leg.length, 0);

/** The spot on the middle of the track that far along it. */
export function pointAt(progress: number): { x: number; z: number; dx: number; dz: number } {
  const along = Math.min(TRACK, Math.max(0, progress));
  let leg = LEGS.length - 1;
  while (leg > 0 && STARTS[leg]! > along) leg--;
  const { from, to, length } = LEGS[leg]!;
  const t = (along - STARTS[leg]!) / length;
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, dx: (to.x - from.x) / length, dz: (to.z - from.z) / length };
}

/** How far along the track a spot is: the nearest point on its middle line. */
export function progressOf(x: number, z: number): number {
  let best = 0;
  let nearest = Infinity;
  LEGS.forEach((leg, index) => {
    const t = Math.min(1, Math.max(0, ((x - leg.from.x) * (leg.to.x - leg.from.x) + (z - leg.from.z) * (leg.to.z - leg.from.z)) / leg.length ** 2));
    const distance = Math.hypot(leg.from.x + (leg.to.x - leg.from.x) * t - x, leg.from.z + (leg.to.z - leg.from.z) * t - z);
    if (distance < nearest) {
      nearest = distance;
      best = STARTS[index]! + t * leg.length;
    }
  });
  return best;
}

type Slot = { kind: Obstacle; tiles: number[]; offset: number };

export class RaceRules implements MiniRules {
  readonly mode = 'race' as const;
  readonly cap = race.cap;
  /** How far each seat has got, in metres along the track. It never goes down. */
  readonly best = new Map<number, number>();
  /** Seats that crossed the line, in order, with the second they did. */
  readonly finishers: { seat: number; at: number }[] = [];
  /** Where a pet that falls is put back: how far along the track each flag stands. */
  readonly flags: number[] = [];
  readonly sweepers: Sweeper[] = [];
  private readonly slots: Slot[] = [];

  setup(field: Field): void {
    field.resize(race.columns, race.rows);
    field.fall = 'respawn';
    field.tiles.fill(TILE.gone);
    // The track: every tile within a tile and a half of its middle line.
    for (let index = 0; index < field.tiles.length; index++) {
      const { x, z } = field.centre(index);
      const along = progressOf(x, z);
      const middle = pointAt(along);
      if (Math.max(Math.abs(middle.x - x), Math.abs(middle.z - z)) <= 1.01) field.tiles[index] = TILE.solid;
    }

    // Three obstacles on each straight, in an order the roll decides. Between the second and third stands a flag.
    const kinds: Obstacle[] = ['gap', 'blink', 'narrow', 'sweeper', 'gap', 'blink', 'sweeper', 'narrow', 'gap'];
    for (let index = kinds.length - 1; index > 0; index--) {
      const other = field.rng.int(index + 1);
      [kinds[index], kinds[other]] = [kinds[other]!, kinds[index]!];
    }
    this.flags.push(0);
    [0, 2, 4].forEach((leg, lane) => {
      // In the order they are met: the middle straight is run the other way.
      const { from, to } = LEGS[leg]!;
      const forward = to.x > from.x;
      const xs = forward ? race.slotsX : [...race.slotsX].reverse();
      xs.forEach((x, slot) => this.place(field, kinds[lane * 3 + slot]!, STARTS[leg]! + Math.abs(x - from.x), field.rng.range(0, race.blinkCycle)));
      this.flags.push(STARTS[leg]! + Math.abs((xs[1]! + xs[2]!) / 2 - from.x));
      // And one in the middle of the turn that follows.
      if (leg < 4) this.flags.push(STARTS[leg + 1]! + LEGS[leg + 1]!.length / 2);
    });
  }

  spawn(_field: Field, index: number): { x: number; z: number } {
    return { x: CORNERS[0].x + (index % 2) * 1.1, z: LANE_Z[0] + (Math.floor(index / 2) - 1) * 0.95 };
  }

  step(field: Field): void {
    // Tiles that blink: solid, then a warning shake, then gone, and back.
    for (const slot of this.slots) {
      if (slot.kind !== 'blink') continue;
      const clock = (field.time + slot.offset) % race.blinkCycle;
      const state = clock < race.blinkSolid ? TILE.solid : clock < race.blinkSolid + race.blinkWarn ? TILE.warning : TILE.gone;
      for (const index of slot.tiles) field.tiles[index] = state;
    }

    for (const sweeper of this.sweepers) sweeper.angle += sweeper.speed * STEP;

    for (const pet of field.pets) {
      pet.grabImmune = Math.max(0, pet.grabImmune - STEP);
      if (pet.grounded) {
        const along = progressOf(pet.x, pet.z);
        // Only steps forward count, and only a step at a time: landing on another lane is not progress.
        const so = this.best.get(pet.seat) ?? 0;
        if (along > so && along < so + race.maxStride) this.best.set(pet.seat, along);
      }
      if ((this.best.get(pet.seat) ?? 0) >= TRACK - 0.6 && !this.finishers.some(entry => entry.seat === pet.seat)) {
        this.best.set(pet.seat, TRACK);
        this.finishers.push({ seat: pet.seat, at: field.time });
        field.emit({ t: 'finish', pet: pet.id, seat: pet.seat, place: this.finishers.length });
      }
      this.sweep(field, pet);
    }
  }

  /** A is a jump. It needs the floor under the pet, so there is no jumping twice. */
  pressA(field: Field, pet: Pet): void {
    if (field.jump(pet, race.jumpSpeed)) pet.dashCooldown = pet.dashCooldownTotal = race.jumpRest;
  }

  /** Back to the last flag it passed. */
  respawnSpot(_field: Field, pet: Pet): { x: number; z: number } {
    return pointAt(this.flagOf(pet.seat));
  }

  finished(field: Field): boolean {
    const first = this.finishers[0];
    return this.finishers.length >= field.pets.length || (first !== undefined && field.time >= first.at + race.grace);
  }

  /** Those over the line, in the order they crossed it; then everyone else by how far they got. */
  ranking(field: Field): number[][] {
    const done = new Set(this.finishers.map(entry => entry.seat));
    const rest = field.pets.map(pet => pet.seat).filter(seat => !done.has(seat));
    return [...this.finishers.map(entry => [entry.seat]), ...rankBy(rest, seat => Math.round((this.best.get(seat) ?? 0) * 2))];
  }

  /** How much of the track is behind the pet, out of 100. */
  metric(_field: Field, seat: number): number {
    return Math.round(((this.best.get(seat) ?? 0) / TRACK) * 100);
  }

  hash(): number {
    let hash = this.finishers.length;
    for (const [seat, along] of this.best) hash = (Math.imul(hash, 31) + seat * 1000 + Math.round(along * 100)) | 0;
    return hash;
  }

  /** The flag a seat would come back to: the last one it has passed. */
  flagOf(seat: number): number {
    const so = this.best.get(seat) ?? 0;
    return [...this.flags].reverse().find(flag => flag <= so + 0.5) ?? 0;
  }

  private place(field: Field, kind: Obstacle, at: number, offset: number): void {
    const centre = pointAt(at);
    const tiles: number[] = [];
    // The tiles of the track across its width, for a stretch along it.
    const stretch = kind === 'gap' ? race.gapLength : race.stretch;
    for (let index = 0; index < field.tiles.length; index++) {
      const tile = field.centre(index);
      const along = (tile.x - centre.x) * centre.dx + (tile.z - centre.z) * centre.dz;
      const across = Math.abs((tile.x - centre.x) * centre.dz - (tile.z - centre.z) * centre.dx);
      if (Math.abs(along) > stretch / 2 || across > 1.01 || field.tiles[index] !== TILE.solid) continue;
      // A gap takes the whole width; a beam leaves only the middle row; blinking tiles keep the width and come and go.
      if (kind === 'gap' || (kind === 'narrow' && across > 0.5)) field.tiles[index] = TILE.gone;
      else if (kind === 'blink') tiles.push(index);
    }
    if (kind === 'sweeper') this.sweepers.push({ x: centre.x, z: centre.z, angle: offset, speed: race.sweepSpeed * (this.sweepers.length % 2 === 0 ? 1 : -1) });
    this.slots.push({ kind, tiles, offset });
  }

  /** A bar that turns on a post in the middle of the track. It takes a pet off its feet unless the pet is in the air over it. */
  private sweep(field: Field, pet: Pet): void {
    if (pet.grabImmune > 0 || !pet.grounded) return;
    for (const sweeper of this.sweepers) {
      const dx = Math.sin(sweeper.angle);
      const dz = Math.cos(sweeper.angle);
      const along = (pet.x - sweeper.x) * dx + (pet.z - sweeper.z) * dz;
      const across = (pet.x - sweeper.x) * dz - (pet.z - sweeper.z) * dx;
      if (Math.abs(along) > race.sweepReach || Math.abs(across) > race.sweepThick) continue;
      // Pushed the way that end of the bar is moving.
      const turn = Math.sign(sweeper.speed) * Math.sign(along || 1);
      field.knock(pet, dz * turn, -dx * turn, race.sweepForce, race.sweepLift);
      pet.grabImmune = 0.5;
      field.emit({ t: 'swept', pet: pet.id });
    }
  }
}
