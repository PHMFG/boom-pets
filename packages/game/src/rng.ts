// Seeded randomness. Every random decision in the simulation goes through a named stream,
// so a logged seed replays the same rolls, spawns and bot choices.

/** FNV-1a: turns a stream name into a number to mix into the seed. */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export type RngStream = 'rolls' | 'spawns' | 'bots';

export type Rng = {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Index chosen in proportion to its weight. */
  weighted(weights: readonly number[]): number;
};

/** Streams with different names are independent: drawing from one never shifts another. */
export function createRng(seed: number, stream: RngStream): Rng {
  const next = mulberry32((seed ^ hashText(stream)) >>> 0);
  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);
  return {
    next,
    int,
    range: (min, max) => min + next() * (max - min),
    chance: probability => next() < probability,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[int(items.length)] as T;
    },
    weighted(weights) {
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      if (!(total > 0)) throw new Error('Weights must sum to more than zero');
      let roll = next() * total;
      for (let index = 0; index < weights.length; index++) {
        roll -= weights[index] as number;
        if (roll < 0) return index;
      }
      return weights.length - 1;
    },
  };
}
