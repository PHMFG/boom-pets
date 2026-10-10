import { describe, expect, it } from 'vitest';
import { createRng, hashText, mulberry32 } from './rng';

const take = (next: () => number, count: number) => Array.from({ length: count }, next);

describe('rng', () => {
  it('repeats the same sequence for the same seed and stream', () => {
    expect(take(createRng(42, 'rolls').next, 20)).toEqual(take(createRng(42, 'rolls').next, 20));
  });

  it('gives each stream and each seed its own sequence', () => {
    const rolls = take(createRng(42, 'rolls').next, 20);
    expect(take(createRng(42, 'spawns').next, 20)).not.toEqual(rolls);
    expect(take(createRng(43, 'rolls').next, 20)).not.toEqual(rolls);
  });

  it('stays inside [0, 1) and is roughly uniform', () => {
    const values = take(mulberry32(7), 20_000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });

  it('keeps integers and ranges within bounds', () => {
    const rng = createRng(1, 'bots');
    for (let index = 0; index < 2_000; index++) {
      const whole = rng.int(6);
      expect(Number.isInteger(whole) && whole >= 0 && whole < 6).toBe(true);
      const ranged = rng.range(12, 18);
      expect(ranged >= 12 && ranged < 18).toBe(true);
    }
  });

  it('picks by weight in proportion', () => {
    const rng = createRng(99, 'rolls');
    const weights = [55, 25, 15, 5];
    const counts = [0, 0, 0, 0];
    const rolls = 40_000;
    for (let index = 0; index < rolls; index++) counts[rng.weighted(weights)]!++;
    counts.forEach((count, index) => expect(Math.abs((count / rolls) * 100 - weights[index]!)).toBeLessThan(1));
  });

  it('rejects empty picks and empty weights', () => {
    const rng = createRng(1, 'rolls');
    expect(() => rng.pick([])).toThrow();
    expect(() => rng.weighted([0, 0])).toThrow();
  });

  it('hashes text stably', () => {
    expect(hashText('rolls')).toBe(hashText('rolls'));
    expect(hashText('rolls')).not.toBe(hashText('spawns'));
  });
});
