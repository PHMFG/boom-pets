import { beforeAll, describe, expect, it } from 'vitest';
import { Game, PLAYABLE_MODES } from '../game';
import type { ButtonEdge, SampledInput } from '../input';
import { initPhysics } from '../physics';
import { createRng } from '../rng';
import { Round } from '../round';
import { paint, pet as petTune, STEP } from '../tuning';
import type { GameEvent, GameMode, MiniMode, SeatSetup } from '../types';
import { Field, rankBy } from './field';
import { makeRules, type AnyRules } from './index';

const PETS = ['fox', 'cat', 'dog', 'pig', 'cow', 'bee'];
const seat = (index: number): SeatSetup => ({ seat: index, pet: PETS[index]!, name: `P${index}`, bot: null });
const idle: SampledInput = { x: 0, y: 0, a: false, b: false, stale: false, edges: [] };
export const press = (button: 'a' | 'b' | 'c', down: boolean): ButtonEdge => ({ button, down });

/** A field for one game with scripted inputs per seat and every event recorded. */
export function makeField<Mode extends MiniMode>(mode: Mode, seats: number) {
  const events: GameEvent[] = [];
  const inputs = new Map<number, SampledInput>();
  const field = new Field(makeRules(mode) as Extract<AnyRules, { mode: Mode }>, Array.from({ length: seats }, (_, index) => seat(index)), createRng(1, 'spawns'), { emit: event => events.push(event) });
  const run = (steps: number) => {
    for (let index = 0; index < steps; index++) {
      field.step(which => inputs.get(which) ?? idle);
      for (const [which, input] of inputs) if (input.edges.length > 0) inputs.set(which, { ...input, edges: [] });
    }
  };
  const set = (which: number, input: Partial<SampledInput>) => inputs.set(which, { ...idle, ...input });
  const of = <Type extends GameEvent['t']>(type: Type) => events.filter((event): event is Extract<GameEvent, { t: Type }> => event.t === type);
  // Let everyone drop in and settle, then start play.
  run(120);
  field.playing = true;
  return { field, events, run, set, of };
}

/** A whole match of bots playing the given games. */
function playBots(seed: number, modes: readonly GameMode[], rounds = modes.length) {
  const game = new Game(seed);
  const seen: GameEvent[] = [];
  const trail: number[] = [];
  game.startMatch({ rounds, bots: true, petPool: PETS, botName: index => `Bot ${index + 1}`, modes });
  seen.push(...game.events);
  let ticks = 0;
  for (; ticks < rounds * 100 * 60 && game.phase !== 'matchEnd'; ticks++) {
    game.tick(() => idle);
    seen.push(...game.events);
    if (ticks % 240 === 0) trail.push(game.round.hash());
  }
  const result = { phase: game.phase, seen, trail, scores: [...game.scores], standings: game.standings };
  game.round.free();
  return result;
}

beforeAll(() => initPhysics());

describe('the field', () => {
  it('moves a pet exactly as the brawl does, so every game feels the same under the thumb', () => {
    const { field, run, set } = makeField('paint', 1);
    const hooks = { emit: () => undefined, roll: () => ({ tier: 'common' as const, power: 'rocket' as const, pity: 0 }), freeCommon: () => 'rocket' as const, blastBonus: () => 1 };
    const round = new Round('lobby', [seat(0)], createRng(1, 'spawns'), hooks);
    for (let index = 0; index < 120; index++) round.step(() => idle);
    const mine = field.petOfSeat(0)!;
    const theirs = round.petOfSeat(0)!;
    expect(mine.grounded && theirs.grounded).toBe(true);
    expect(mine.y).toBeCloseTo(theirs.y, 5);
    const from = { mine: mine.x, theirs: theirs.x };
    set(0, { x: 1 });
    run(40);
    for (let index = 0; index < 40; index++) round.step(() => ({ ...idle, x: 1 }));
    expect(mine.x - from.mine).toBeCloseTo(theirs.x - from.theirs, 4);
    expect(mine.vx).toBeCloseTo(petTune.speed, 1);
    round.free();
    field.free();
  });

  it('keeps pets inside a wall', () => {
    const { field, run, set } = makeField('paint', 2);
    const pet = field.petOfSeat(0)!;
    set(0, { x: 1, y: 1 });
    run(600);
    expect(pet.alive).toBe(true);
    expect(pet.x).toBeLessThanOrEqual(field.columns / 2 - petTune.radius + 0.001);
    expect(pet.z).toBeGreaterThanOrEqual(-field.rows / 2 + petTune.radius - 0.001);
    expect(pet.grounded).toBe(true);
    field.free();
  });

  it('groups equal scores into one place', () => {
    const score = new Map([[0, 4], [1, 9], [2, 4], [3, 1]]);
    expect(rankBy([0, 1, 2, 3], which => score.get(which)!)).toEqual([[1], [0, 2], [3]]);
  });
});

describe('Pinta o Chão', () => {
  it('gives the tile under a pet to that pet, and lets another paint over it', () => {
    const { field, run, set } = makeField('paint', 2);
    const rules = field.rules;
    run(2);
    const first = field.petOfSeat(0)!;
    const home = field.index(first.x, first.z);
    expect(field.data[home]).toBe(1);
    expect(rules.counts.get(0)).toBe(1);
    // The other walks over the same tile.
    const second = field.petOfSeat(1)!;
    set(0, { x: 1 });
    run(60);
    set(0, {});
    for (let guard = 0; guard < 900 && field.index(second.x, second.z) !== home; guard++) {
      const centre = field.centre(home);
      const distance = Math.hypot(centre.x - second.x, centre.z - second.z) || 1;
      set(1, { x: (centre.x - second.x) / distance, y: -(centre.z - second.z) / distance });
      run(1);
    }
    run(2);
    expect(field.data[home]).toBe(2);
    // Every tile is counted for exactly one seat.
    const painted = [...field.data].filter(owner => owner > 0).length;
    expect((rules.counts.get(0) ?? 0) + (rules.counts.get(1) ?? 0)).toBe(painted);
    field.free();
  });

  it('drops a bucket that is marked first, and paints a patch for whoever kicks it over', () => {
    const { field, run, set, of } = makeField('paint', 2);
    const rules = field.rules;
    run(Math.round(paint.bucketFirst / STEP) + 2);
    expect(of('bucket')).toHaveLength(1);
    const bucket = rules.buckets[0]!;
    expect(bucket.left).toBeGreaterThan(0);
    const pet = field.petOfSeat(1)!;
    for (let guard = 0; guard < 1200 && rules.buckets.length > 0; guard++) {
      const distance = Math.hypot(bucket.x - pet.x, bucket.z - pet.z) || 1;
      set(1, { x: (bucket.x - pet.x) / distance, y: -(bucket.z - pet.z) / distance });
      run(1);
    }
    expect(of('splash')[0]).toMatchObject({ seat: 1, radius: paint.splashRadius });
    expect(field.data[field.index(bucket.x, bucket.z)]).toBe(2);
    expect(rules.counts.get(1)).toBeGreaterThan(10);
    field.free();
  });

  it('ranks by tiles, hides the count for the last seconds, and ends on time with nobody out', () => {
    const { field, run, set } = makeField('paint', 3);
    set(0, { x: 1 });
    run(90);
    set(0, { x: -1 });
    run(Math.round((paint.cap - paint.hideLast) / STEP) - 90 + 3);
    expect(field.metric(0)).toBe('hidden');
    expect(field.finished).toBe(false);
    run(Math.round(paint.hideLast / STEP) + 2);
    expect(field.finished).toBe(true);
    expect(field.out).toEqual([]);
    // Best first, by tiles held; a bucket may have landed on a pet that never moved.
    const tiles = field.ranking().map(group => group.map(which => field.rules.counts.get(which) ?? 0));
    expect(tiles.flat()).toEqual([...tiles.flat()].sort((a, b) => b - a));
    expect(tiles.every(group => new Set(group).size === 1)).toBe(true);
    expect(field.ranking().flat().sort()).toEqual([0, 1, 2]);
    expect(field.metric(0)).toBe(field.rules.counts.get(0));
    field.free();
  });
});

describe('a match of games', () => {
  it('lets bots play every game to its end, the same way from the same seed', () => {
    const minis = PLAYABLE_MODES.filter(mode => mode !== 'brawl');
    const first = playBots(11, minis);
    expect(first.phase).toBe('matchEnd');
    expect(first.seen.flatMap(event => (event.t === 'reveal' ? [event.mode] : []))).toEqual(minis);
    expect(first.standings).toHaveLength(4);
    expect(first.scores.some(([, score]) => score > 0)).toBe(true);
    const again = playBots(11, minis);
    expect(again.trail).toEqual(first.trail);
    expect(again.scores).toEqual(first.scores);
    expect(playBots(12, minis).trail).not.toEqual(first.trail);
  });

  it('deals every game once before any comes round again', () => {
    const game = new Game(5);
    const dealt: GameMode[] = [];
    game.startMatch({ rounds: PLAYABLE_MODES.length * 2, bots: true, petPool: PETS, botName: index => `Bot ${index + 1}` });
    for (let ticks = 0; ticks < PLAYABLE_MODES.length * 2 * 100 * 60 && game.phase !== 'matchEnd'; ticks++) {
      game.tick(() => idle);
      for (const event of game.events) if (event.t === 'reveal') dealt.push(event.mode);
    }
    game.round.free();
    expect(dealt).toHaveLength(PLAYABLE_MODES.length * 2);
    expect([...dealt.slice(0, PLAYABLE_MODES.length)].sort()).toEqual([...PLAYABLE_MODES].sort());
    expect([...dealt.slice(PLAYABLE_MODES.length)].sort()).toEqual([...PLAYABLE_MODES].sort());
    // Never the same game twice running.
    expect(dealt.some((mode, index) => index > 0 && mode === dealt[index - 1])).toBe(false);
  });

  it('pays a game with no knockouts from the same table as any other', () => {
    const result = playBots(3, ['paint'], 1);
    const scores = result.scores.map(([, score]) => score).sort((a, b) => b - a);
    // One round, and the only round counts double: 6, 4, 3 and 2, unless two bots tied.
    expect(scores.reduce((sum, score) => sum + score, 0)).toBeLessThanOrEqual(2 * (6 + 4 + 3 + 2));
    expect(scores[0]).toBe(12);
    expect(result.seen.some(event => event.t === 'eliminated')).toBe(false);
  });
});
