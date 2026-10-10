// Pinta o Chão: the tile under a pet takes its colour, and others can paint over it. Most tiles when the
// time is up wins. Nobody is knocked out and nobody can fall: the floor has a wall round it.
import type { SampledInput } from '../input';
import { paint, STEP } from '../tuning';
import type { Pet } from '../types';
import { rankBy, type Field, type MiniRules } from './field';

/** A bucket of paint on its way down, or lying on the floor waiting to be kicked over. */
export type Bucket = { id: number; x: number; z: number; left: number };

export class PaintRules implements MiniRules {
  readonly mode = 'paint' as const;
  readonly cap = paint.cap;
  /** Tiles each seat holds right now, by seat. */
  readonly counts = new Map<number, number>();
  readonly buckets: Bucket[] = [];
  private nextBucket: number = paint.bucketFirst;

  setup(field: Field): void {
    field.resize(paint.columns, paint.rows);
    field.wall = { kind: 'rect' };
  }

  spawn(field: Field, index: number, count: number): { x: number; z: number } {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return { x: Math.sin(angle) * field.columns * 0.3, z: Math.cos(angle) * field.rows * 0.3 };
  }

  /** `data` holds who painted a tile: 0 for nobody, else the seat plus one. */
  step(field: Field, _inputs: ReadonlyMap<number, SampledInput>): void {
    for (const pet of field.pets) if (pet.grounded) this.paint(field, field.index(pet.x, pet.z), pet.seat);

    this.nextBucket -= STEP;
    if (this.nextBucket <= 0) {
      this.nextBucket = paint.bucketEvery;
      const x = field.rng.int(field.columns - 2) + 1 - field.columns / 2 + 0.5;
      const z = field.rng.int(field.rows - 2) + 1 - field.rows / 2 + 0.5;
      const bucket = { id: field.id(), x, z, left: paint.bucketDrop };
      this.buckets.push(bucket);
      field.emit({ t: 'bucket', id: bucket.id, x, z, delay: paint.bucketDrop });
    }
    for (const bucket of [...this.buckets]) {
      bucket.left = Math.max(0, bucket.left - STEP);
      if (bucket.left > 0) continue;
      // Whoever reaches a landed bucket first kicks it over, and everything round it is theirs.
      const kicker = field.pets.find(pet => pet.grounded && Math.hypot(pet.x - bucket.x, pet.z - bucket.z) <= paint.pickupRadius);
      if (!kicker) continue;
      this.buckets.splice(this.buckets.indexOf(bucket), 1);
      this.splash(field, bucket.x, bucket.z, kicker);
    }
  }

  finished(): boolean {
    return false;
  }

  ranking(field: Field): number[][] {
    return rankBy(field.pets.map(pet => pet.seat), seat => this.counts.get(seat) ?? 0);
  }

  /** The count goes dark for the last seconds, so the result is a surprise. */
  metric(field: Field, seat: number): number | 'hidden' {
    return field.time >= this.cap - paint.hideLast && field.time < this.cap ? 'hidden' : (this.counts.get(seat) ?? 0);
  }

  hash(): number {
    let hash = this.buckets.length;
    for (const [seat, count] of this.counts) hash = (Math.imul(hash, 31) + seat * 1000 + count) | 0;
    return hash;
  }

  private paint(field: Field, index: number, seat: number): void {
    if (index < 0) return;
    const before = field.data[index]!;
    if (before === seat + 1) return;
    if (before > 0) this.counts.set(before - 1, (this.counts.get(before - 1) ?? 1) - 1);
    field.data[index] = seat + 1;
    this.counts.set(seat, (this.counts.get(seat) ?? 0) + 1);
  }

  private splash(field: Field, x: number, z: number, kicker: Pet): void {
    for (let index = 0; index < field.data.length; index++) {
      const centre = field.centre(index);
      if (Math.hypot(centre.x - x, centre.z - z) <= paint.splashRadius) this.paint(field, index, kicker.seat);
    }
    field.emit({ t: 'splash', seat: kicker.seat, x, z, radius: paint.splashRadius });
  }
}
