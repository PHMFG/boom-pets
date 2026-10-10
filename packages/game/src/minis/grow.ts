// Come e Cresce: food rains on a picnic blanket. Every bite makes a pet bigger and a little slower; the
// biggest when the time is up wins. A is a lunging bite: on a clearly smaller pet it shakes loose part of
// what that pet ate. A purple pepper shrinks whoever eats it. Nobody is ever out.
import { grow, STEP } from '../tuning';
import type { Pet } from '../types';
import { rankBy, type Field, type MiniRules } from './field';

export type FoodKind = 'apple' | 'donut' | 'melon' | 'pepper';
/** Something to eat: still falling while `left` is above zero, then lying on the blanket. */
export type Food = { id: number; kind: FoodKind; x: number; z: number; left: number };

const KINDS: readonly FoodKind[] = ['apple', 'donut', 'melon', 'pepper'];

export class GrowRules implements MiniRules {
  readonly mode = 'grow' as const;
  readonly cap = grow.cap;
  /** What each seat has eaten, by seat. */
  readonly points = new Map<number, number>();
  readonly foods: Food[] = [];
  private nextFood = 0;
  private nextFeast: number = grow.feastEvery;

  setup(field: Field): void {
    field.resize(grow.columns, grow.rows);
    field.wall = { kind: 'rect' };
  }

  spawn(field: Field, index: number, count: number): { x: number; z: number } {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return { x: Math.sin(angle) * field.columns * 0.3, z: Math.cos(angle) * field.rows * 0.3 };
  }

  step(field: Field): void {
    // Food keeps coming, faster with more mouths to feed, up to a blanketful.
    this.nextFood -= STEP;
    if (this.nextFood <= 0 && this.foods.length < grow.maxFood) {
      this.nextFood = grow.foodEvery / Math.max(1, field.pets.length / 2);
      const x = field.rng.range(-field.columns / 2 + 1, field.columns / 2 - 1);
      const z = field.rng.range(-field.rows / 2 + 1, field.rows / 2 - 1);
      this.drop(field, KINDS[field.rng.weighted(grow.kindWeights)]!, x, z);
    }
    // The safety net: every so often a feast lands right beside whoever is smallest.
    this.nextFeast -= STEP;
    if (this.nextFeast <= 0 && field.pets.length > 0) {
      this.nextFeast = grow.feastEvery;
      const smallest = [...field.pets].sort((a, b) => this.eaten(a.seat) - this.eaten(b.seat) || a.seat - b.seat)[0]!;
      this.drop(field, 'melon', smallest.x + field.rng.range(-1.2, 1.2), smallest.z + field.rng.range(-1.2, 1.2));
    }

    for (const pet of field.pets) {
      pet.reachTime = Math.max(0, pet.reachTime - STEP);
      pet.grabImmune = Math.max(0, pet.grabImmune - STEP);
    }
    for (const food of [...this.foods]) {
      food.left = Math.max(0, food.left - STEP);
      if (food.left > 0) continue;
      // The nearest mouth in reach gets it. A bigger pet has a bigger mouth.
      const eater = field.pets
        .filter(pet => pet.grounded && Math.hypot(pet.x - food.x, pet.z - food.z) <= grow.mouth * pet.scale)
        .sort((a, b) => Math.hypot(a.x - food.x, a.z - food.z) - Math.hypot(b.x - food.x, b.z - food.z))[0];
      if (!eater) continue;
      this.foods.splice(this.foods.indexOf(food), 1);
      this.feed(field, eater, grow.value[food.kind]);
      // The view plays its munch while this runs.
      eater.reachTime = 0.3;
      field.emit({ t: 'eat', pet: eater.id, seat: eater.seat, kind: food.kind, x: food.x, z: food.z });
    }
  }

  pressA(field: Field, pet: Pet, stickX: number, stickZ: number): void {
    field.lunge(pet, stickX, stickZ, grow.biteSpeed, grow.biteSeconds, grow.biteRest, grow.biteRestMiss);
  }

  /** A bite. On a pet clearly smaller it shakes food loose; on anyone else it is only a bump. */
  touch(field: Field, pet: Pet, other: Pet): boolean {
    const distance = Math.hypot(other.x - pet.x, other.z - pet.z) || 1;
    const dx = (other.x - pet.x) / distance;
    const dz = (other.z - pet.z) / distance;
    if (other.grabImmune > 0 || this.size(pet.seat) < this.size(other.seat) + grow.biteLead) {
      field.knock(other, dx, dz, grow.bumpForce, 1.5, true);
      return true;
    }
    // Part of what the victim ate flies out as crumbs for anyone to pick up, and it gets a moment nobody can bite it again.
    const lost = Math.ceil(this.eaten(other.seat) * grow.biteShare);
    this.feed(field, other, -lost);
    other.grabImmune = grow.biteImmune;
    field.knock(other, dx, dz, grow.biteForce, grow.biteLift);
    for (let crumb = 0; crumb < Math.min(lost, grow.maxCrumbs); crumb++) {
      const angle = field.rng.range(0, Math.PI * 2);
      const reach = field.rng.range(1.2, 2.8);
      const limit = { x: field.columns / 2 - 0.6, z: field.rows / 2 - 0.6 };
      this.drop(field, 'apple', Math.max(-limit.x, Math.min(limit.x, other.x + Math.sin(angle) * reach)), Math.max(-limit.z, Math.min(limit.z, other.z + Math.cos(angle) * reach)), 0.35);
    }
    field.emit({ t: 'bite', pet: pet.id, seat: pet.seat, victim: other.id, lost });
    return true;
  }

  /** The bigger a pet, the slower it walks, so the small can get away. */
  speed(_field: Field, pet: Pet): number {
    return 1 - grow.slowPerSize * this.size(pet.seat);
  }

  finished(): boolean {
    return false;
  }

  ranking(field: Field): number[][] {
    return rankBy(field.pets.map(pet => pet.seat), seat => this.eaten(seat));
  }

  metric(_field: Field, seat: number): number {
    return this.eaten(seat);
  }

  hash(): number {
    let hash = this.foods.length;
    for (const [seat, points] of this.points) hash = (Math.imul(hash, 31) + seat * 1000 + points) | 0;
    return hash;
  }

  eaten(seat: number): number {
    return this.points.get(seat) ?? 0;
  }

  /** How many sizes a seat has grown: one for every few points, up to the biggest a pet gets. */
  size(seat: number): number {
    return Math.min(grow.sizes, Math.floor(this.eaten(seat) / grow.perSize));
  }

  private drop(field: Field, kind: FoodKind, x: number, z: number, seconds: number = grow.dropTime): void {
    this.foods.push({ id: field.id(), kind, x, z, left: seconds });
  }

  private feed(field: Field, pet: Pet, change: number): void {
    this.points.set(pet.seat, Math.max(0, this.eaten(pet.seat) + change));
    field.rescale(pet, 1 + grow.growPerSize * this.size(pet.seat));
  }
}
