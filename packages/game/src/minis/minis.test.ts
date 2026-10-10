import { beforeAll, describe, expect, it } from 'vitest';
import { Game, PLAYABLE_MODES } from '../game';
import type { ButtonEdge, SampledInput } from '../input';
import { initPhysics } from '../physics';
import { createRng } from '../rng';
import { Round } from '../round';
import { grow, lava, paint, pet as petTune, race, STEP } from '../tuning';
import { TILE, type GameEvent, type GameMode, type MiniMode, type SeatSetup } from '../types';
import { Field, rankBy } from './field';
import { makeRules, type AnyRules } from './index';
import { pointAt, progressOf, TRACK } from './race';

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
  /** Walks a seat's pet to a spot and stops it there. */
  const walk = (which: number, x: number, z: number) => {
    const pet = field.petOfSeat(which)!;
    for (let guard = 0; guard < 900; guard++) {
      const distance = Math.hypot(x - pet.x, z - pet.z);
      if (distance < 0.08) break;
      const pace = Math.min(1, distance / 1.5);
      set(which, { x: ((x - pet.x) / distance) * pace, y: (-(z - pet.z) / distance) * pace });
      run(1);
    }
    set(which, {});
    run(6);
  };
  // Let everyone drop in and settle, then start play.
  run(120);
  field.playing = true;
  return { field, events, run, set, of, walk };
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

describe('O Chão é Lava', () => {
  it('raises one rock fewer than there are pets, warns, and takes out whoever is not standing on one', () => {
    const { field, run, of, walk } = makeField('lava', 3);
    const rules = field.rules;
    run(2);
    expect(rules.rocks).toHaveLength(2);
    expect(of('lava')[0]).toMatchObject({ phase: 'calm', wave: 1, seconds: lava.calm });
    walk(0, rules.rocks[0]!.x, rules.rocks[0]!.z);
    walk(1, rules.rocks[1]!.x, rules.rocks[1]!.z);
    // On a rock a pet stands that much higher.
    expect(field.petOfSeat(0)!.y).toBeCloseTo(petTune.radius + petTune.halfHeight + lava.rockHeight, 2);
    while (rules.phase === 'calm') run(1);
    expect(of('lava').at(-1)).toMatchObject({ phase: 'alarm', seconds: lava.alarm });
    // The alarm is a warning: nobody is out yet.
    expect(field.out).toEqual([]);
    while (rules.phase === 'alarm') run(1);
    expect(field.out).toEqual([2]);
    expect(of('eliminated')[0]).toMatchObject({ seat: 2, cause: 'lava' });
    expect(field.ghosts[0]).toMatchObject({ seat: 2, cursor: false });
    expect(field.finished).toBe(false);
    field.free();
  });

  it('ends when one pet is left or none, with those lost in the same wave sharing a place', () => {
    const { field, run, walk } = makeField('lava', 3);
    const rules = field.rules;
    run(2);
    walk(0, rules.rocks[0]!.x, rules.rocks[0]!.z);
    walk(1, rules.rocks[1]!.x, rules.rocks[1]!.z);
    while (rules.wave === 1) run(1);
    // Wave two: one rock for two pets, and its calm is shorter. Both walk away from it.
    expect(rules.rocks).toHaveLength(1);
    expect(rules.left).toBeCloseTo(lava.calm - lava.calmStep, 1);
    const rock = rules.rocks[0]!;
    walk(0, rock.x > 0 ? -5 : 5, 0);
    walk(1, rock.x > 0 ? -5 : 5, 3);
    while (!field.finished) run(1);
    expect(field.ranking()).toEqual([[0, 1], [2]]);
    field.free();
  });

  it('lets a shove push a pet off its rock, and rests A after', () => {
    const { field, run, set, of, walk } = makeField('lava', 2);
    const rock = field.rules.rocks[0] ?? (run(2), field.rules.rocks[0]!);
    walk(0, rock.x, rock.z);
    walk(1, rock.x + 1.3, rock.z);
    const victim = field.petOfSeat(0)!;
    expect(field.floorY(victim.x, victim.z)).toBe(lava.rockHeight);
    set(1, { x: -1, edges: [press('a', true), press('a', false)] });
    run(30);
    expect(of('dashHit')[0]?.victims).toEqual([victim.id]);
    expect(field.floorY(victim.x, victim.z)).toBe(0);
    expect(field.petOfSeat(1)!.dashCooldown).toBeGreaterThan(0);
    // A second press while it rests does nothing but say so.
    set(1, { edges: [press('a', true)] });
    run(1);
    expect(of('tired')).toHaveLength(1);
    expect(of('dash')).toHaveLength(1);
    field.free();
  });
});

describe('Come e Cresce', () => {
  /** Puts a piece of food on the blanket where a test wants it, already landed. */
  const serve = (field: ReturnType<typeof makeField<'grow'>>['field'], kind: 'apple' | 'donut' | 'melon' | 'pepper', x: number, z: number) => field.rules.foods.push({ id: field.id(), kind, x, z, left: 0 });

  it('feeds whoever reaches a piece, grows the pet a size for every few points, and slows it', () => {
    const { field, run, of } = makeField('grow', 2);
    const pet = field.petOfSeat(0)!;
    field.rules.foods.length = 0;
    serve(field, 'melon', pet.x, pet.z);
    serve(field, 'apple', pet.x, pet.z);
    run(2);
    expect(of('eat').map(event => [event.seat, event.kind])).toEqual([[0, 'melon'], [0, 'apple']]);
    expect(field.rules.eaten(0)).toBe(grow.value.melon + grow.value.apple);
    expect(field.rules.size(0)).toBe(1);
    expect(pet.scale).toBeCloseTo(1 + grow.growPerSize, 5);
    expect(field.rules.speed(field, pet)).toBeCloseTo(1 - grow.slowPerSize, 5);
    expect(field.metric(0)).toBe(5);
    // Its feet stay on the blanket as it grows.
    run(20);
    expect(pet.grounded).toBe(true);
    field.free();
  });

  it('shrinks whoever eats a pepper, never below nothing', () => {
    const { field, run } = makeField('grow', 2);
    const pet = field.petOfSeat(0)!;
    field.rules.foods.length = 0;
    field.rules.points.set(0, 6);
    serve(field, 'pepper', pet.x, pet.z);
    run(2);
    expect(field.rules.eaten(0)).toBe(6 + grow.value.pepper);
    serve(field, 'pepper', pet.x, pet.z);
    run(2);
    expect(field.rules.eaten(0)).toBe(0);
    expect(pet.scale).toBe(1);
    field.free();
  });

  it('lets a bite shake food out of a clearly smaller pet, once, and only bumps anyone else', () => {
    const { field, run, set, of, walk } = makeField('grow', 2);
    const rules = field.rules;
    const big = field.petOfSeat(0)!;
    const small = field.petOfSeat(1)!;
    const bite = () => {
      rules.foods.length = 0;
      walk(0, small.x + 1.5, small.z);
      big.dashCooldown = 0;
      set(0, { x: -1, edges: [press('a', true), press('a', false)] });
      run(30);
      set(0, {});
    };
    // The same size: a bump, and nothing is lost.
    rules.points.set(1, 8);
    bite();
    expect(of('bite')).toHaveLength(0);
    expect(rules.eaten(1)).toBe(8);
    // Two sizes bigger: a quarter of what the small one ate flies out as crumbs.
    rules.points.set(0, grow.perSize * 4);
    rules.points.set(1, grow.perSize * 2);
    run(Math.round(grow.biteRestMiss / STEP));
    const before = rules.eaten(1);
    bite();
    const lost = Math.ceil(before * grow.biteShare);
    expect(of('bite')[0]).toMatchObject({ seat: 0, victim: small.id, lost });
    expect(rules.eaten(1)).toBe(before - lost);
    expect(rules.foods.filter(food => food.kind === 'apple').length).toBeGreaterThanOrEqual(Math.min(lost, grow.maxCrumbs) - 1);
    // For a moment it cannot be bitten again.
    expect(small.grabImmune).toBeGreaterThan(0);
    const after = rules.eaten(1);
    bite();
    expect(of('bite')).toHaveLength(1);
    expect(rules.eaten(1)).toBeGreaterThanOrEqual(after);
    field.free();
  });

  it('drops a feast beside whoever is smallest, ranks by what was eaten, and never knocks anyone out', () => {
    const { field, run } = makeField('grow', 3);
    const rules = field.rules;
    rules.points.set(0, 20);
    rules.points.set(1, 9);
    rules.foods.length = 0;
    const smallest = field.petOfSeat(2)!;
    run(Math.round(grow.feastEvery / STEP) + 2);
    expect(rules.foods.some(food => food.kind === 'melon' && Math.hypot(food.x - smallest.x, food.z - smallest.z) < 2.5) || rules.eaten(2) >= grow.value.melon).toBe(true);
    run(Math.round((grow.cap - grow.feastEvery) / STEP) + 2);
    expect(field.finished).toBe(true);
    expect(field.out).toEqual([]);
    const eaten = field.ranking().map(group => group.map(which => rules.eaten(which)));
    expect(eaten.flat()).toEqual([...eaten.flat()].sort((a, b) => b - a));
    field.free();
  });
});

describe('Corrida Maluca', () => {
  /** Carries a seat's pet along the track in hops short enough to count, setting it down only on solid floor. */
  const carry = (race_: ReturnType<typeof makeField<'race'>>, which: number, to: number) => {
    const { field, run } = race_;
    const pet = field.petOfSeat(which)!;
    // Each hop starts from how far the pet has really got: a tile may blink away under it and send it back to a flag.
    const solid = (along: number) => field.tiles[field.index(pointAt(along).x, pointAt(along).z)] === TILE.solid;
    for (let guard = 0; guard < 400 && (field.rules.best.get(which) ?? 0) < Math.min(to, TRACK) - 0.7; guard++) {
      const best = field.rules.best.get(which) ?? 0;
      let at = Math.min(best + 2.5, to);
      if (!solid(at)) {
        // A break in the floor ahead. Walk up to its lip first; from the lip, jump it if it is a gap, or wait if the tiles have blinked away.
        let lip = at;
        while (lip > best + 0.5 && !solid(lip)) lip -= 0.25;
        let landing = at;
        while (landing < TRACK && !solid(landing)) landing += 0.25;
        // A pet is set down a little to one side of where it is asked to be, so it is kept well clear of both edges.
        if (lip - 0.7 > best + 0.3) at = lip - 0.7;
        else if (landing + 0.7 - best <= race.maxStride - 0.3) at = landing + 0.7;
        else {
          run(20);
          continue;
        }
      }
      field.respawn(pet, pointAt(at).x, pointAt(at).z);
      run(45);
    }
  };

  it('lays a track that folds back on itself, with gaps a jump can clear and lanes a jump cannot cross', () => {
    const { field } = makeField('race', 4);
    expect(progressOf(pointAt(0).x, pointAt(0).z)).toBeCloseTo(0, 5);
    for (const along of [3, 20, 41, 60, TRACK - 1]) expect(progressOf(pointAt(along).x, pointAt(along).z)).toBeCloseTo(along, 5);
    // Along the middle line, every break in the floor is a gap of exactly two tiles: blinking tiles start solid and a beam keeps its middle.
    const breaks: number[] = [];
    let open = 0;
    for (let along = 0; along <= TRACK; along += 0.25) {
      const spot = pointAt(along);
      if (field.isFloor(spot.x, spot.z)) {
        if (open > 0) breaks.push(open);
        open = 0;
      } else open += 0.25;
    }
    expect(breaks).toHaveLength(3);
    for (const length of breaks) expect(length).toBeCloseTo(race.gapLength, 0);
    // Between two straights there are three tiles of nothing.
    for (const z of [3, -3]) for (let x = -5; x <= 5; x++) expect(field.isFloor(x + 0.5, z)).toBe(false);
    // Every flag stands on solid floor.
    for (const flag of field.rules.flags) expect(field.tiles[field.index(pointAt(flag).x, pointAt(flag).z)]).toBe(TILE.solid);
    expect(field.rules.sweepers).toHaveLength(2);
    field.free();
  });

  it('jumps on A, once, far enough for a gap of two tiles and not for three', () => {
    const { field, run, set, of } = makeField('race', 1);
    const pet = field.petOfSeat(0)!;
    // On the first turn there is room to run flat out along z with nothing in the way.
    const turn = field.rules.flags[2]!;
    field.respawn(pet, pointAt(turn - 2.5).x, pointAt(turn - 2.5).z);
    run(40);
    set(0, { y: 1 });
    run(15);
    const from = pet.z;
    set(0, { y: 1, edges: [press('a', true), press('a', false)] });
    run(2);
    expect(of('jump')).toHaveLength(1);
    expect(pet.grounded).toBe(false);
    // A second press in the air does nothing.
    set(0, { y: 1, edges: [press('a', true), press('a', false)] });
    run(2);
    expect(of('jump')).toHaveLength(1);
    let peak = 0;
    for (let guard = 0; guard < 80 && !pet.grounded; guard++) {
      run(1);
      peak = Math.max(peak, pet.y);
    }
    const length = Math.abs(pet.z - from);
    expect(length).toBeGreaterThan(race.gapLength + 0.5);
    expect(length).toBeLessThan(3.2);
    expect(peak - (petTune.radius + petTune.halfHeight)).toBeGreaterThan(0.7);
    field.free();
  });

  it('puts a pet that falls back at the last flag it passed, the same pet, with its progress kept', () => {
    const raceField = makeField('race', 2);
    const { field, run, set, of } = raceField;
    const pet = field.petOfSeat(0)!;
    const flag = field.rules.flags[1]!;
    carry(raceField, 0, flag + 1);
    const best = field.rules.best.get(0)!;
    expect(best).toBeGreaterThanOrEqual(flag);
    // Off the side of the track.
    set(0, { y: -1 });
    for (let guard = 0; guard < 600 && of('respawn').filter(event => event.seat === 0).length < Math.ceil((flag + 1) / 2.5) + 1; guard++) run(1);
    set(0, {});
    run(60);
    expect(of('fall').some(event => event.seat === 0)).toBe(true);
    expect(field.out).toEqual([]);
    expect(field.petOfSeat(0)).toBe(pet);
    expect(pet.falling).toBe(false);
    expect(pet.grounded).toBe(true);
    const back = pointAt(flag);
    expect(Math.hypot(pet.x - back.x, pet.z - back.z)).toBeLessThan(1.2);
    expect(field.rules.best.get(0)).toBe(best);
    field.free();
  });

  it('does not count landing on another lane as progress', () => {
    const { field, run } = makeField('race', 1);
    const pet = field.petOfSeat(0)!;
    const far = pointAt(TRACK - 4);
    field.respawn(pet, far.x, far.z);
    run(60);
    expect(field.rules.best.get(0) ?? 0).toBeLessThan(3);
    expect(field.metric(0)).toBeLessThan(5);
    field.free();
  });

  it('calls the round a few seconds after the first pet crosses the line, and ranks the rest by how far they got', () => {
    const raceField = makeField('race', 3);
    const { field, run, of } = raceField;
    carry(raceField, 2, 30);
    carry(raceField, 1, TRACK);
    expect(of('finish')).toEqual([{ t: 'finish', pet: field.petOfSeat(1)!.id, seat: 1, place: 1 }]);
    expect(field.metric(1)).toBe(100);
    expect(field.finished).toBe(false);
    run(Math.round(race.grace / STEP) + 2);
    expect(field.finished).toBe(true);
    expect(field.ranking()).toEqual([[1], [2], [0]]);
    field.free();
  });

  it('sweeps a pet off its feet with a turning bar, unless the pet is in the air over it', () => {
    const { field, run, set, of } = makeField('race', 2);
    const sweeper = field.rules.sweepers[0]!;
    const pet = field.petOfSeat(0)!;
    field.respawn(pet, sweeper.x + 1, sweeper.z);
    run(40);
    for (let guard = 0; guard < 400 && of('swept').length === 0; guard++) {
      // Hold it in the bar's path.
      set(0, { x: Math.sign(sweeper.x + 1 - pet.x) * 0.3 });
      run(1);
    }
    expect(of('swept')).toHaveLength(1);
    expect(Math.hypot(pet.vx, pet.vz)).toBeGreaterThan(3);
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
