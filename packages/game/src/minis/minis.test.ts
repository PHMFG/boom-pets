import { beforeAll, describe, expect, it } from 'vitest';
import { Game, PLAYABLE_MODES } from '../game';
import type { ButtonEdge, SampledInput } from '../input';
import { initPhysics } from '../physics';
import { createRng } from '../rng';
import { Round } from '../round';
import { color, frita, grow, lava, paint, pet as petTune, potato, race, STEP } from '../tuning';
import { TILE, type GameEvent, type GameMode, type MiniMode, type SeatSetup } from '../types';
import { Field, rankBy } from './field';
import { makeRules, type AnyRules } from './index';
import { FURNITURE_KINDS, seatsOf } from './lava';

const PETS = ['fox', 'cat', 'dog', 'pig', 'cow', 'bee'];
const seat = (index: number): SeatSetup => ({ seat: index, pet: PETS[index]!, name: `P${index}`, bot: null });
const idle: SampledInput = { x: 0, y: 0, a: false, b: false, stale: false, edges: [] };
export const press = (button: 'a' | 'b' | 'c', down: boolean): ButtonEdge => ({ button, down });

/** A field for one game with scripted inputs per seat and every event recorded. */
export function makeField<Mode extends MiniMode>(mode: Mode, seats: number, seed = 1) {
  const events: GameEvent[] = [];
  const inputs = new Map<number, SampledInput>();
  const field = new Field(makeRules(mode) as Extract<AnyRules, { mode: Mode }>, Array.from({ length: seats }, (_, index) => seat(index)), createRng(seed, 'spawns'), { emit: event => events.push(event) });
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
  type LavaField = ReturnType<typeof makeField<'lava'>>;
  const seatsIn = (field: LavaField['field']) => field.rules.pieces.flatMap(piece => seatsOf(piece));
  /** A spot no piece ever lands on: furniture keeps clear of the walls. */
  const corner = (field: LavaField['field'], which = 0) => ({ x: (which % 2 === 0 ? -1 : 1) * (field.columns / 2 - 0.8), z: -field.rows / 2 + 0.8 });
  /** Walks several pets at once, each to its own spot, so the wave's clock is not spent on one at a time. */
  const send = ({ field, run, set }: LavaField, targets: [number, { x: number; z: number }][]) => {
    for (let guard = 0; guard < 900; guard++) {
      let moving = false;
      for (const [which, spot] of targets) {
        const pet = field.petOfSeat(which)!;
        const distance = Math.hypot(spot.x - pet.x, spot.z - pet.z);
        if (distance < 0.08) {
          set(which, {});
          continue;
        }
        moving = true;
        const pace = Math.min(1, distance / 1.5);
        set(which, { x: ((spot.x - pet.x) / distance) * pace, y: (-(spot.z - pet.z) / distance) * pace });
      }
      if (!moving) break;
      run(1);
    }
    run(6);
  };
  const landed = (lavaField: LavaField) => lavaField.of('furniture').filter(event => event.phase === 'land').length;

  it('seats exactly as many pets on each kind of furniture as it says, with room for each', () => {
    for (const kind of FURNITURE_KINDS) {
      for (const turned of [false, true]) {
        const seats = seatsOf({ id: 1, kind, x: 3, z: -2, turned, at: 0, landed: true });
        expect(seats, kind).toHaveLength(lava.pieces[kind].seats);
        // No two closer than a pet is wide.
        for (const a of seats) for (const b of seats) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), kind).toBeGreaterThanOrEqual(2 * petTune.radius - 0.001);
      }
    }
  });

  it('drops a seat for every pet in the first wave, marked before it lands, then takes out whoever is not on one', () => {
    const lavaField = makeField('lava', 3);
    const { field, run, of } = lavaField;
    const rules = field.rules;
    run(1);
    // The wave to learn on: nobody has to be left out.
    const pieces = rules.pieces;
    expect(seatsIn(field)).toHaveLength(3);
    // Each piece is announced with how long it takes to come down, one after another, and none is down yet.
    expect(of('furniture').map(event => [event.phase, event.id])).toEqual(pieces.map(piece => ['fall', piece.id]));
    of('furniture').forEach((event, index) => expect(event.seconds).toBeCloseTo(lava.dropFirst + index * lava.dropEvery, 1));
    for (const piece of pieces) expect(field.floorY(piece.x, piece.z)).toBe(0);
    expect(of('lava')[0]).toMatchObject({ phase: 'calm', wave: 1 });
    expect(of('lava')[0]!.seconds).toBeCloseTo(lava.dropFirst + (pieces.length - 1) * lava.dropEvery + lava.calm, 5);

    const seats = seatsIn(field);
    send(lavaField, [[0, seats[0]!], [1, seats[1]!], [2, corner(field)]]);
    while (landed(lavaField) < pieces.length) run(1);
    // On furniture a pet stands that much higher.
    expect(field.petOfSeat(0)!.y).toBeCloseTo(petTune.radius + petTune.halfHeight + lava.height, 2);
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

  it('lifts a pet that a piece lands on, and hurts nobody', () => {
    const lavaField = makeField('lava', 2);
    const { field, run, of } = lavaField;
    run(1);
    const piece = field.rules.pieces[0]!;
    const pet = field.petOfSeat(0)!;
    // Set down on the piece's mark at once (a pet is set down a little to one side of where it is asked to be), well before the piece arrives.
    field.respawn(pet, piece.x, piece.z - 0.45);
    run(60);
    expect(landed(lavaField)).toBe(0);
    expect(pet.grounded).toBe(true);
    expect(pet.y).toBeCloseTo(petTune.radius + petTune.halfHeight, 2);
    while (landed(lavaField) < 1) run(1);
    run(30);
    expect(of('eliminated')).toHaveLength(0);
    expect(pet.grounded).toBe(true);
    expect(pet.y).toBeCloseTo(petTune.radius + petTune.halfHeight + lava.height, 2);
    field.free();
  });

  it('ends when one pet is left or none, with those lost in the same wave sharing a place', () => {
    const lavaField = makeField('lava', 3);
    const { field, run, of } = lavaField;
    const rules = field.rules;
    run(1);
    const seats = seatsIn(field);
    send(lavaField, [[0, seats[0]!], [1, seats[1]!], [2, corner(field)]]);
    while (rules.wave === 1) run(1);
    // Wave two still has a seat for each of the two left, with less time once the furniture is down.
    expect(seatsIn(field)).toHaveLength(2);
    expect(of('lava').filter(event => event.phase === 'calm')[1]!.seconds).toBeCloseTo(lava.dropFirst + (rules.pieces.length - 1) * lava.dropEvery + lava.calm - lava.calmStep, 5);
    const again = seatsIn(field);
    send(lavaField, [[0, again[0]!], [1, again[1]!]]);
    while (rules.wave === 2) run(1);
    expect(field.out).toEqual([2]);
    // Wave three: one seat for two pets. Both walk away from it.
    expect(seatsIn(field)).toHaveLength(1);
    send(lavaField, [[0, corner(field, 0)], [1, corner(field, 1)]]);
    while (!field.finished) run(1);
    expect(field.ranking()).toEqual([[0, 1], [2]]);
    field.free();
  });

  it('has two seats too few from the late waves on, however many have squeezed through', () => {
    const { field, run } = makeField('lava', 5);
    const rules = field.rules;
    run(1);
    // Straight to the end of the flood before the first scarce wave, with all five still in.
    rules.wave = lava.scarceFrom - 1;
    rules.phase = 'flood';
    rules.left = 0;
    run(1);
    expect(rules.wave).toBe(lava.scarceFrom);
    expect(seatsIn(field)).toHaveLength(3);
    field.free();
  });

  it('lets a shove push a pet off its seat, and rests A after', () => {
    const lavaField = makeField('lava', 2);
    const { field, run, set, of } = lavaField;
    run(1);
    const seat = seatsIn(field)[0]!;
    send(lavaField, [[0, seat], [1, { x: seat.x + 1.3, z: seat.z }]]);
    while (landed(lavaField) < field.rules.pieces.length) run(1);
    run(20);
    const victim = field.petOfSeat(0)!;
    expect(field.floorY(victim.x, victim.z)).toBe(lava.height);
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
    serve(field, 'melon', pet.x, pet.z);
    run(2);
    expect(of('eat').map(event => [event.seat, event.kind])).toEqual([[0, 'melon'], [0, 'melon']]);
    // Two slices: enough for one size, not for two.
    expect(field.rules.eaten(0)).toBe(grow.value.melon * 2);
    expect(Math.floor((grow.value.melon * 2) / grow.perSize)).toBe(1);
    expect(field.rules.size(0)).toBe(1);
    expect(pet.scale).toBeCloseTo(1 + grow.growPerSize, 5);
    expect(field.rules.speed(field, pet)).toBeCloseTo(1 - grow.slowPerSize, 5);
    expect(field.metric(0)).toBe(grow.value.melon * 2);
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
  /**
   * Sets a seat's pet down that far along the track, as if it had run there. `along` must be solid floor clear of
   * any obstacle: a flag, or the last stretch before the line.
   */
  const put = (race_: ReturnType<typeof makeField<'race'>>, which: number, along: number) => {
    const { field, run } = race_;
    const pet = field.petOfSeat(which)!;
    const spot = field.rules.track.pointAt(along);
    // Only a step at a time counts as progress, so what it had covered is set just short of where it lands.
    field.rules.best.set(which, Math.max(0, along - 1));
    field.respawn(pet, spot.x, spot.z);
    for (let steps = 0; steps < 90 && !pet.grounded; steps++) run(1);
    run(2);
  };

  it('draws a new track every round: across the floor to the far back corner, never touching itself, with its obstacles clear of the corners', () => {
    const drawn = new Set<string>();
    const turns = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { field } = makeField('race', 4, seed);
      const { track, hurdles, flags, sweepers } = field.rules;
      drawn.add(track.legs.map(leg => `${leg.from.x},${leg.from.z}`).join(' '));
      turns.add(track.turns);
      expect(track.length).toBeGreaterThanOrEqual(race.minLength);
      expect(hurdles.length).toBeGreaterThanOrEqual(race.minHurdles);

      // It starts at one side, setting off across the floor, and ends in the back corner of the other side.
      const start = track.pointAt(0);
      const end = track.pointAt(track.length);
      const side = ((race.nodesX - 1) / 2) * race.pitchX;
      expect(Math.abs(start.x)).toBe(side);
      expect(start.dx).toBe(-Math.sign(start.x));
      expect(end.x).toBe(-start.x);
      expect(end.z).toBe(-((race.nodesZ - 1) / 2) * race.pitchZ);
      for (const along of [0, 3, track.length / 3, track.length - 1]) {
        const spot = track.pointAt(along);
        expect(track.progressOf(spot.x, spot.z)).toBeCloseTo(along, 5);
      }

      // No stretch of it comes nearer another than the grid's points are apart: a jump cannot cross from one to the next.
      const line = Array.from({ length: Math.floor(track.length) + 1 }, (_, along) => track.pointAt(along));
      line.forEach((a, from) => {
        for (let to = from + race.pitchX + race.pitchZ; to < line.length; to++) {
          expect(Math.hypot(a.x - line[to]!.x, a.z - line[to]!.z)).toBeGreaterThanOrEqual(Math.min(race.pitchX, race.pitchZ) - 0.001);
        }
      });

      // Along the middle line the floor is broken only by a gap (two tiles) or by a beam that keeps one of the side rows (the obstacle's whole stretch).
      const breaks: number[] = [];
      let open = 0;
      for (let along = 0; along <= track.length; along += 0.25) {
        const spot = track.pointAt(along);
        if (field.isFloor(spot.x, spot.z)) {
          if (open > 0) breaks.push(open);
          open = 0;
        } else open += 0.25;
      }
      const gaps = hurdles.filter(hurdle => hurdle.kind === 'gap').length;
      const sideBeams = hurdles.filter(hurdle => hurdle.kind === 'narrow' && hurdle.row !== 0).length;
      expect(breaks.filter(length => Math.round(length) === race.gapLength)).toHaveLength(gaps);
      expect(breaks.filter(length => Math.round(length) === race.stretch)).toHaveLength(sideBeams);
      expect(breaks).toHaveLength(gaps + sideBeams);
      // A beam leaves exactly one row to walk on, right through it.
      for (const hurdle of hurdles.filter(each => each.kind === 'narrow')) {
        const spot = track.pointAt(hurdle.at);
        const rows = [-1, 0, 1].filter(row => field.isFloor(spot.x + spot.dz * row, spot.z - spot.dx * row));
        expect(rows).toEqual([hurdle.row]);
      }

      // Every obstacle has a run-up: clear of the corners of its straight, of the start, and of the next obstacle.
      for (const hurdle of hurdles) {
        const leg = track.legs.findLast(each => each.start <= hurdle.at)!;
        expect(hurdle.at - leg.start).toBeGreaterThanOrEqual((leg === track.legs[0] ? race.lead : race.clear) - 0.5);
        expect(leg.start + leg.length - hurdle.at).toBeGreaterThanOrEqual(race.clear - 0.5);
        expect(leg.length).toBeGreaterThanOrEqual(race.minRun);
      }
      hurdles.forEach((hurdle, index) => {
        if (index > 0) expect(hurdle.at - hurdles[index - 1]!.at).toBeGreaterThanOrEqual(race.spacing - 2);
      });
      // The four kinds take turns, so every track has all of them.
      for (const kind of ['gap', 'blink', 'narrow', 'sweeper'] as const) expect(hurdles.some(hurdle => hurdle.kind === kind), kind).toBe(true);
      expect(sweepers).toHaveLength(hurdles.filter(hurdle => hurdle.kind === 'sweeper').length);

      // Whoever comes back at a flag starts from standing: the next obstacle is never nearer than a run-up.
      for (const flag of flags) {
        const next = hurdles.find(hurdle => hurdle.at > flag);
        if (next) expect(next.at - flag).toBeGreaterThanOrEqual(race.clear - 0.5);
      }
      // A flag at the start and at every corner, each on solid floor, in the order they are met.
      expect(flags[0]).toBe(0);
      for (const leg of track.legs.slice(1)) expect(flags).toContain(leg.start);
      expect(flags).toEqual([...flags].sort((a, b) => a - b));
      for (const flag of flags) expect(field.tiles[field.index(track.pointAt(flag).x, track.pointAt(flag).z)]).toBe(TILE.solid);
      field.free();
    }
    // Forty rounds are forty different tracks, or nearly, and both kinds come up: long straights and many turns.
    expect(drawn.size).toBeGreaterThan(30);
    expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThanOrEqual(4);
  });

  it('jumps on A, once, far enough for a gap of two tiles and not for three', () => {
    const { field, run, set, of } = makeField('race', 1);
    const pet = field.petOfSeat(0)!;
    // From the very back of the start there is room to run flat out and land before the first obstacle.
    const start = field.rules.track.pointAt(0);
    field.respawn(pet, start.x - start.dx, start.z);
    run(40);
    set(0, { x: start.dx });
    run(15);
    const from = pet.x;
    set(0, { x: start.dx, edges: [press('a', true), press('a', false)] });
    run(2);
    expect(of('jump')).toHaveLength(1);
    expect(pet.grounded).toBe(false);
    // A second press in the air does nothing.
    set(0, { x: start.dx, edges: [press('a', true), press('a', false)] });
    run(2);
    expect(of('jump')).toHaveLength(1);
    let peak = 0;
    for (let guard = 0; guard < 80 && !pet.grounded; guard++) {
      run(1);
      peak = Math.max(peak, pet.y);
    }
    const length = Math.abs(pet.x - from);
    expect(length).toBeGreaterThan(race.gapLength + 0.5);
    expect(length).toBeLessThan(3.2);
    expect(peak - (petTune.radius + petTune.halfHeight)).toBeGreaterThan(0.7);
    field.free();
  });

  it('puts a pet that falls back at the last flag it passed, the same pet, with its progress kept', () => {
    const raceField = makeField('race', 2);
    const { field, run, set, of } = raceField;
    const { track } = field.rules;
    const pet = field.petOfSeat(0)!;
    const flag = field.rules.flags[1]!;
    put(raceField, 0, flag + 0.3);
    const best = field.rules.best.get(0)!;
    expect(best).toBeGreaterThanOrEqual(flag);
    // Off the side of the track (whichever side has nothing beside it: at a corner one side is the way it came),
    // until it is put back once more than the carrying put it down.
    const here = track.pointAt(flag + 0.3);
    const way = field.isFloor(here.x + here.dz * 2.5, here.z - here.dx * 2.5) ? -1 : 1;
    const carried = of('respawn').filter(event => event.seat === 0).length;
    set(0, { x: here.dz * way, y: here.dx * way });
    for (let guard = 0; guard < 600 && of('respawn').filter(event => event.seat === 0).length <= carried; guard++) run(1);
    set(0, {});
    run(60);
    expect(of('fall').some(event => event.seat === 0)).toBe(true);
    expect(field.out).toEqual([]);
    expect(field.petOfSeat(0)).toBe(pet);
    expect(pet.falling).toBe(false);
    expect(pet.grounded).toBe(true);
    const back = track.pointAt(flag);
    expect(Math.hypot(pet.x - back.x, pet.z - back.z)).toBeLessThan(1.2);
    expect(field.rules.best.get(0)).toBe(best);
    field.free();
  });

  it('does not count landing on another stretch of the track as progress', () => {
    const { field, run } = makeField('race', 1);
    const pet = field.petOfSeat(0)!;
    const far = field.rules.track.pointAt(field.rules.track.length - 4);
    field.respawn(pet, far.x, far.z);
    run(60);
    expect(field.rules.best.get(0) ?? 0).toBeLessThan(3);
    expect(field.metric(0)).toBeLessThan(5);
    field.free();
  });

  it('calls the round a few seconds after the first pet crosses the line, and ranks the rest by how far they got', () => {
    const raceField = makeField('race', 3);
    const { field, run, of, walk } = raceField;
    const { track } = field.rules;
    // One pet has got a third of the way; another is set down just short of the line and walks over it.
    field.rules.best.set(2, 30);
    put(raceField, 1, track.length - 2.2);
    walk(1, track.pointAt(track.length).x, track.pointAt(track.length).z);
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

describe('Cor Certa', () => {
  const tilesOf = (field: ReturnType<typeof makeField<'color'>>['field'], which: number) => [...field.data].flatMap((kind, index) => (kind === which + 1 ? [index] : []));

  /** Sets a seat's pet down in the middle of a tile. */
  const put = (field: ReturnType<typeof makeField<'color'>>['field'], which: number, index: number) => {
    const pet = field.petOfSeat(which)!;
    // A pet is set down a little to one side of where it is asked to be; the middle of a patch keeps it on its colour.
    const column = Math.floor(index / field.rows);
    const row = index % field.rows;
    field.respawn(pet, Math.floor(column / color.patch) * color.patch + color.patch / 2 - field.columns / 2, Math.floor(row / color.patch) * color.patch + color.patch / 2 - field.rows / 2);
  };

  it('has a rim: nobody leaves the floor by its edge, only by a patch dropping', () => {
    const { field, run, set } = makeField('color', 3);
    const pet = field.petOfSeat(0)!;
    // Straight at the edge, for longer than it takes to reach it and less than it takes for the first drop.
    set(0, { x: 1, y: 0 });
    run(Math.floor((color.show + color.count - 0.5) * 60));
    expect(pet.alive).toBe(true);
    expect(pet.grounded).toBe(true);
    expect(pet.x).toBeLessThanOrEqual(field.columns / 2 - petTune.radius + 0.001);
    expect(field.out).toHaveLength(0);
    field.free();
  });

  it('shows a floor of four colours, calls one, and drops every tile of the others after the count', () => {
    const { field, run, of } = makeField('color', 3);
    const rules = field.rules;
    run(2);
    expect(of('colorShow')).toHaveLength(1);
    // Every tile has a colour, and the one about to be called has the number of patches the first wave gives it.
    expect([...field.data].every(kind => kind >= 1 && kind <= 4)).toBe(true);
    expect(tilesOf(field, rules.called)).toHaveLength(color.safePatches[0] * color.patch * color.patch);
    while (rules.phase === 'show') run(1);
    expect(of('colorCall')[0]).toMatchObject({ color: rules.called, wave: 1, seconds: color.count });
    // Two stand on the colour; the third on another.
    const safe = tilesOf(field, rules.called);
    const wrong = [...field.data].findIndex(kind => kind !== rules.called + 1);
    put(field, 0, safe[0]!);
    put(field, 1, safe.at(-1)!);
    put(field, 2, wrong);
    run(60);
    expect(field.out).toEqual([]);
    while (rules.phase === 'call') run(1);
    expect(of('colorDrop')[0]).toMatchObject({ color: rules.called });
    expect(field.tiles[safe[0]!]).toBe(TILE.solid);
    expect(field.tiles[wrong]).toBe(TILE.gone);
    while (rules.phase === 'drop') run(1);
    expect(field.out).toEqual([2]);
    expect(of('eliminated')[0]).toMatchObject({ seat: 2, cause: 'fall' });
    // The floor is whole again for the next wave.
    run(2);
    expect([...field.tiles].every(state => state === TILE.solid)).toBe(true);
    field.free();
  });

  it('gives each wave a shorter count and fewer patches of the colour, and ties those who fall together', () => {
    const { field, run, of } = makeField('color', 3);
    const rules = field.rules;
    run(2);
    // For four waves everyone is set down on the colour as it is called. In the fifth, two are left on another.
    for (let wave = 1; wave <= 5; wave++) {
      while (rules.phase !== 'call') run(1);
      expect(of('colorCall').at(-1)!.seconds).toBeCloseTo(Math.max(color.countMin, color.count - (wave - 1) * color.countStep), 5);
      expect(tilesOf(field, rules.called)).toHaveLength(color.safePatches[wave - 1]! * color.patch * color.patch);
      const safe = tilesOf(field, rules.called)[0]!;
      const wrong = [...field.data].findIndex(kind => kind !== rules.called + 1);
      for (const which of [0, 1, 2]) put(field, which, wave === 5 && which > 0 ? wrong : safe);
      while ((rules.phase as string) !== 'show' && !field.finished) run(1);
    }
    expect(field.finished).toBe(true);
    expect(field.ranking()).toEqual([[0], [1, 2]]);
    field.free();
  });
});

describe('Batata Quente', () => {
  it('gives fewer players longer fuses, so a round of two is not over in one short fuse', () => {
    const fuses = [2, 3, 4, 6].map(players => {
      const { field, run, of } = makeField('potato', players);
      run(Math.round(potato.firstWait / STEP) + 2);
      const fuse = of('potato')[0]!.fuse;
      field.free();
      return fuse;
    });
    expect(fuses).toEqual([potato.fuse + 2 * potato.fuseFew, potato.fuse + potato.fuseFew, potato.fuse, potato.fuse]);
  });

  it('hands a bomb to someone, passes it on a touch but not straight back, and takes out whoever holds it at the end', () => {
    const { field, run, set, of, walk } = makeField('potato', 3);
    const rules = field.rules;
    expect(rules.holder).toBeNull();
    run(Math.round(potato.firstWait / STEP) + 2);
    // Three players are one short of a full pan, so their fuses are that much longer.
    expect(of('potato')[0]).toMatchObject({ from: null, fuse: potato.fuse + potato.fuseFew });
    const first = rules.holder!;
    const [second, third] = [0, 1, 2].filter(which => which !== first) as [number, number];
    // Whoever holds it is faster than the rest.
    expect(rules.speed(field, { seat: first })).toBe(potato.holderSpeed);
    expect(rules.speed(field, { seat: second })).toBe(1);
    // It walks into another pet: the bomb changes hands.
    const target = field.petOfSeat(second)!;
    const carrier = field.petOfSeat(first)!;
    for (let guard = 0; guard < 300 && rules.holder === first; guard++) {
      const distance = Math.hypot(target.x - carrier.x, target.z - carrier.z);
      set(first, { x: (target.x - carrier.x) / distance, y: -(target.z - carrier.z) / distance });
      run(1);
    }
    expect(rules.holder).toBe(second);
    expect(of('potato').at(-1)).toMatchObject({ holder: second, from: first });
    // Still pushing into it, the bomb does not go straight back.
    run(10);
    expect(rules.holder).toBe(second);
    // The first walks away, and the fuse runs out in the second's hands.
    walk(first, -target.x * 0.7, -target.z * 0.7);
    void third;
    for (let guard = 0; guard < 60 * 12 && field.out.length === 0; guard++) run(1);
    expect(of('potatoBoom')).toHaveLength(1);
    expect(field.out).toEqual([second]);
    expect(of('eliminated')[0]).toMatchObject({ seat: second, cause: 'bomb' });
    expect(rules.holder).toBeNull();
    field.free();
  });

  it('starts each bomb with a shorter fuse, ends with one pet left, and ranks the rest by when they went', () => {
    const { field, run, of } = makeField('potato', 3);
    for (let guard = 0; guard < 60 * 40 && !field.finished; guard++) run(1);
    expect(field.finished).toBe(true);
    const fresh = of('potato').filter(event => event.from === null);
    expect(fresh.map(event => event.fuse)).toEqual([potato.fuse + potato.fuseFew, potato.fuse - potato.fuseStep + potato.fuseFew]);
    expect(field.out).toHaveLength(2);
    expect(field.ranking()).toEqual([field.aliveSeats(), [field.out[1]], [field.out[0]]]);
    // Nobody can leave the arena.
    for (const pet of field.pets) expect(Math.hypot(pet.x, pet.z)).toBeLessThanOrEqual(potato.radius);
    field.free();
  });
});

describe('Batatinha Frita 1, 2, 3', () => {
  it('sends back whoever still pushes the joystick once the cat looks, after a moment of grace, and nobody else', () => {
    const { field, run, set, of } = makeField('frita', 3);
    const rules = field.rules;
    run(1);
    expect(of('watch')[0]).toMatchObject({ phase: 'sing' });
    // All three run while it sings: on tiptoe.
    for (const which of [0, 1, 2]) set(which, { x: 1 });
    run(40);
    const runner = field.petOfSeat(0)!;
    expect(runner.vx).toBeCloseTo(petTune.speed * frita.speed, 1);
    while (rules.phase === 'sing') run(1);
    expect(of('watch').at(-1)!.phase).toBe('watch');
    // One lets go at once, one keeps pushing, and one has a phone whose input has stalled.
    set(1, {});
    set(2, { x: 1, stale: true });
    const before = field.petOfSeat(0)!.x;
    run(Math.round(frita.grace / STEP) - 2);
    expect(of('caught')).toHaveLength(0);
    run(6);
    expect(of('caught').map(event => event.seat)).toEqual([0]);
    const start = -field.columns / 2 + 1;
    expect(before).toBeGreaterThan(start + 2);
    expect(Math.abs(runner.x - start)).toBeLessThan(0.6);
    expect(field.petOfSeat(0)).toBe(runner);
    expect(field.out).toEqual([]);
    expect(rules.reach.get(0)).toBeLessThan(0.6);
    expect(rules.reach.get(1)).toBeGreaterThan(2);
    field.free();
  });

  it('ends a few seconds after the first pet crosses the line, with the rest ranked by how far they got', () => {
    const { field, run, of } = makeField('frita', 3);
    const rules = field.rules;
    run(1);
    const line = field.columns / 2 - frita.finish;
    field.respawn(field.petOfSeat(1)!, line - 8, 0);
    field.respawn(field.petOfSeat(2)!, line + 0.6, -1);
    run(60);
    expect(of('finish')).toEqual([{ t: 'finish', pet: field.petOfSeat(2)!.id, seat: 2, place: 1 }]);
    expect(field.metric(2)).toBe(100);
    expect(field.metric(1)).toBeGreaterThan(field.metric(0) as number);
    expect(field.finished).toBe(false);
    run(Math.round(frita.finishGrace / STEP) + 2);
    expect(field.finished).toBe(true);
    expect(rules.finishers.map(entry => entry.seat)).toEqual([2]);
    expect(field.ranking()).toEqual([[2], [1], [0]]);
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

  it('knows the game to come as soon as the roulette starts, and plays that one', () => {
    const game = new Game(21);
    const promised: (GameMode | null)[] = [];
    const played: GameMode[] = [];
    const watch = () => {
      for (const event of game.events) {
        if (event.t === 'phase' && event.phase === 'intro') promised.push(game.upcoming);
        if (event.t === 'reveal') played.push(event.mode);
      }
    };
    game.startMatch({ rounds: 6, bots: true, petPool: PETS, botName: index => `Bot ${index + 1}` });
    watch();
    for (let ticks = 0; ticks < 6 * 100 * 60 && game.phase !== 'matchEnd'; ticks++) {
      game.tick(() => idle);
      watch();
      // Once the card is up there is nothing left to come.
      if (game.phase !== 'intro' || game.revealed) expect(game.upcoming).toBeNull();
    }
    game.round.free();
    expect(played).toHaveLength(6);
    expect(promised).toEqual(played);
  });

  it('pays a game with no knockouts from the same table as any other', () => {
    const result = playBots(3, ['paint'], 1);
    const scores = result.scores.map(([, score]) => score).sort((a, b) => b - a);
    // One round, and the only round counts double: 6, 4, 3 and 2, unless two bots tied.
    expect(scores.reduce((sum, score) => sum + score, 0)).toBeLessThanOrEqual(2 * (6 + 4 + 3 + 2));
    expect(scores[0]).toBe(12);
    expect(result.seen.some(event => event.t === 'eliminated')).toBe(false);
  });

  it('hands out awards for what the simple games are about', () => {
    // A match with no brawl in it: every award has to come from eating, painting, racing or the bomb.
    const result = playBots(7, ['grow', 'paint', 'race', 'potato']);
    const awards = result.standings.map(entry => entry.award);
    expect(awards.every(award => award !== null)).toBe(true);
    expect(new Set(awards).size).toBe(awards.length);
    // One seat can top two of them and still takes only one, so not all four need to go out.
    expect(awards.filter(award => ['glutton', 'painter', 'runner', 'potato'].includes(award!)).length).toBeGreaterThanOrEqual(3);
  });
});
