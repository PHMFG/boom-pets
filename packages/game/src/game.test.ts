import { beforeAll, describe, expect, it } from 'vitest';
import { Game } from './game';
import type { ButtonEdge, SampledInput } from './input';
import { pickPower, rollTier, TIER_WEIGHTS } from './odds';
import { initPhysics } from './physics';
import { createRng } from './rng';
import { Round, type RoundHooks } from './round';
import { assignAwards, emptyStats, placementPoints, rankOf, standings } from './scoring';
import { arena, cube, dash, grab, match, STEP } from './tuning';
import { POWERS, TILE, type GameEvent, type SeatSetup } from './types';

const PETS = ['fox', 'cat', 'dog', 'pig', 'cow', 'bee'];
const seat = (index: number): SeatSetup => ({ seat: index, pet: PETS[index]!, name: `P${index}`, bot: null });
const idle: SampledInput = { x: 0, y: 0, a: false, b: false, stale: false, edges: [] };
const press = (button: 'a' | 'b', down: boolean): ButtonEdge => ({ button, down });

/** A round with scripted inputs per seat and every event recorded. */
function makeRound(seats: number, mode: 'lobby' | 'match' = 'match') {
  const events: GameEvent[] = [];
  const inputs = new Map<number, SampledInput>();
  const hooks: RoundHooks = {
    emit: event => events.push(event),
    roll: () => ({ tier: 'common', power: 'rocket', pity: 1 }),
    freeCommon: () => 'rocket',
    blastBonus: () => 1,
  };
  const round = new Round(mode, Array.from({ length: seats }, (_, index) => seat(index)), createRng(1, 'spawns'), hooks);
  const run = (steps: number) => {
    for (let index = 0; index < steps; index++) {
      round.step(which => inputs.get(which) ?? idle);
      // Edges are one-shot: a scripted press is delivered once.
      for (const [which, input] of inputs) if (input.edges.length > 0) inputs.set(which, { ...input, edges: [] });
    }
  };
  const set = (which: number, input: Partial<SampledInput>) => inputs.set(which, { ...idle, ...input });
  const of = <Type extends GameEvent['t']>(type: Type) => events.filter((event): event is Extract<GameEvent, { t: Type }> => event.t === type);
  // Let everyone drop in and settle, then start play.
  run(90);
  round.playing = true;
  return { round, events, run, set, of };
}

beforeAll(() => initPhysics());

describe('odds', () => {
  it('rolls each tier at its configured chance, within 2 points', () => {
    for (const rank of ['middle', 'last', 'leader'] as const) {
      const rng = createRng(11, 'rolls');
      const counts = { common: 0, rare: 0, cursed: 0, super: 0 };
      const rolls = 40_000;
      // Pity is held at zero so only the raw weights are measured.
      for (let index = 0; index < rolls; index++) counts[rollTier(rng, rank, 0, false).tier]++;
      Object.values(counts).forEach((count, index) => expect(Math.abs((count / rolls) * 100 - TIER_WEIGHTS[rank][index]!)).toBeLessThan(2));
    }
  });

  it('guarantees a SUPER after six rolls without one, and resets the count', () => {
    const rng = createRng(3, 'rolls');
    expect(rollTier(rng, 'middle', cube.pity, false)).toEqual({ tier: 'super', pity: 0 });
    const next = rollTier(rng, 'middle', cube.pity - 1, false);
    if (next.tier !== 'super') expect(next.pity).toBe(cube.pity);
  });

  it('turns a SUPER into a rare while another SUPER is active, keeping the pity for later', () => {
    expect(rollTier(createRng(3, 'rolls'), 'middle', cube.pity, true)).toEqual({ tier: 'rare', pity: cube.pity });
  });

  it('picks a power of the rolled tier', () => {
    const rng = createRng(5, 'rolls');
    for (const tier of ['common', 'rare', 'cursed', 'super', 'superCurse'] as const) {
      for (let index = 0; index < 20; index++) expect(POWERS[pickPower(rng, tier)].tier).toBe(tier);
    }
  });
});

describe('scoring', () => {
  it('gives 5, 3 and 1 for the first three places and doubles in the final round', () => {
    expect([...placementPoints([[2], [0], [1], [3]], 1)]).toEqual([[2, 5], [0, 3], [1, 1], [3, 0]]);
    expect(placementPoints([[2], [0]], 2).get(2)).toBe(10);
  });

  it('splits the points of tied survivors', () => {
    const points = placementPoints([[0, 1], [2]], 1);
    expect(points.get(0)).toBe(4);
    expect(points.get(1)).toBe(4);
    expect(points.get(2)).toBe(1);
  });

  it('names the leader and the last place only when scores differ', () => {
    expect(rankOf(new Map([[0, 0], [1, 0]]), 0)).toBe('middle');
    const scores = new Map([[0, 9], [1, 4], [2, 1]]);
    expect([rankOf(scores, 0), rankOf(scores, 1), rankOf(scores, 2)]).toEqual(['leader', 'middle', 'last']);
  });

  it('gives every seat a different award, favouring what each stands out for', () => {
    const stats = new Map([0, 1, 2, 3, 4, 5].map(index => [index, emptyStats()]));
    stats.get(0)!.selfDestruct = 4;
    stats.get(1)!.thrower = 3;
    stats.get(2)!.meteor = 9;
    const awards = assignAwards(stats);
    expect(awards.get(0)).toBe('selfDestruct');
    expect(awards.get(1)).toBe('thrower');
    expect(awards.get(2)).toBe('meteor');
    expect(new Set(awards.values()).size).toBe(6);
  });

  it('shares a place between equal scores', () => {
    expect(standings(new Map([[0, 5], [1, 9], [2, 5]]), new Map()).map(entry => [entry.seat, entry.place])).toEqual([[1, 1], [0, 2], [2, 2]]);
  });
});

describe('round', () => {
  it('drops pets onto the platform and moves them with the stick', () => {
    const { round, run, set } = makeRound(2);
    const pet = round.petOfSeat(0)!;
    expect(pet.grounded).toBe(true);
    expect(pet.y).toBeCloseTo(0.65, 2);
    const startX = pet.x;
    set(0, { x: 1 });
    run(30);
    expect(pet.x - startX).toBeGreaterThan(2);
    expect(Math.hypot(pet.vx, pet.vz)).toBeLessThanOrEqual(6.01);
  });

  it('knocks a rival off with a charged dash and credits the kill', () => {
    const { round, run, set, of } = makeRound(2);
    const attacker = round.petOfSeat(0)!;
    const victim = round.petOfSeat(1)!;
    // Walk the victim toward the far edge (not over it), then close in.
    set(1, { y: 1 });
    run(24);
    set(1, {});
    run(20);
    expect(victim.grounded).toBe(true);
    const gap = () => Math.hypot(attacker.x - victim.x, attacker.z - victim.z);
    set(0, { y: 1 });
    while (gap() > 3.5) run(1);
    // Hold A for a full charge with the stick idle: the dash aims itself at the nearest rival.
    set(0, { a: true, edges: [press('a', true)] });
    run(Math.round(dash.chargeTime / STEP) + 2);
    expect(attacker.chargeTime).toBeGreaterThan(dash.chargeTime);
    set(0, { a: false, edges: [press('a', false)] });
    run(240);

    expect(of('dash')[0]?.charge).toBe(1);
    expect(of('dashHit')[0]?.victims).toContain(victim.id);
    expect(of('eliminated')[0]).toMatchObject({ seat: 1, cause: 'dash', killer: 0 });
    expect(round.out).toEqual([1]);
    expect(round.finished).toBe(true);
  });

  it('counts a walk off the edge as nobody\'s kill', () => {
    const { run, set, of } = makeRound(2);
    set(0, { x: 1 });
    run(240);
    expect(of('fall')[0]?.seat).toBe(0);
    expect(of('eliminated')[0]).toMatchObject({ seat: 0, cause: 'fall', killer: null });
  });

  it('detonates a pet that holds A too long, and never because of a stalled connection', () => {
    const stalled = makeRound(2);
    stalled.set(0, { a: true, stale: true, edges: [press('a', true)] });
    stalled.run(300);
    expect(stalled.of('eliminated')).toEqual([]);

    const held = makeRound(2);
    held.set(0, { a: true, edges: [press('a', true)] });
    held.run(Math.round(dash.overchargeAt / STEP) + 2);
    expect(held.of('explosion')[0]?.cause).toBe('overcharge');
    expect(held.of('eliminated')[0]).toMatchObject({ seat: 0, cause: 'overcharge', killer: null });
  });

  it('turns a quick tap between two steps into a minimum dash', () => {
    const { run, set, of } = makeRound(2);
    set(0, { edges: [press('a', true), press('a', false)] });
    run(2);
    expect(of('dash')[0]?.charge).toBeLessThan(0.05);
  });

  it('grabs a barrel at once, throws it, and the barrel explodes on landing', () => {
    const { round, run, set, of } = makeRound(2);
    const pet = round.petOfSeat(0)!;
    const barrel = round.barrels[0]!;
    // Steer onto the barrel, then press B.
    for (let guard = 0; guard < 600 && Math.hypot(barrel.x - pet.x, barrel.z - pet.z) > 1; guard++) {
      const distance = Math.hypot(barrel.x - pet.x, barrel.z - pet.z);
      set(0, { x: (barrel.x - pet.x) / distance, y: -(barrel.z - pet.z) / distance });
      run(1);
    }
    set(0, { edges: [press('b', true)] });
    run(2);
    expect(pet.carrying).toEqual({ kind: 'barrel', id: barrel.id });
    set(0, { x: 1, edges: [press('b', true)] });
    run(120);
    expect(of('throw')[0]).toMatchObject({ kind: 'barrel', target: barrel.id });
    expect(of('explosion').some(event => event.cause === 'barrel' && event.owner === 0)).toBe(true);
    expect(round.barrels.includes(barrel)).toBe(false);
  });

  it('needs a wind-up to grab a pet, and lets the carried pet mash free', () => {
    const { round, run, set, of } = makeRound(2);
    const grabber = round.petOfSeat(0)!;
    const target = round.petOfSeat(1)!;
    for (let guard = 0; guard < 600 && Math.hypot(target.x - grabber.x, target.z - grabber.z) > 1.1; guard++) {
      const distance = Math.hypot(target.x - grabber.x, target.z - grabber.z);
      set(0, { x: (target.x - grabber.x) / distance, y: -(target.z - grabber.z) / distance });
      run(1);
    }
    set(0, { edges: [press('b', true)] });
    run(1);
    expect(of('reach')).toHaveLength(1);
    expect(target.carriedBy).toBeNull();
    run(Math.round(grab.windUp / STEP) + 1);
    expect(target.carriedBy).toBe(grabber.id);
    expect(target.y).toBeGreaterThan(grabber.y + 1);

    for (let tap = 0; tap < grab.escapeTaps; tap++) {
      set(1, { edges: [press('a', true), press('a', false)] });
      run(1);
    }
    expect(of('escape')).toHaveLength(1);
    expect(target.carriedBy).toBeNull();
    expect(grabber.carrying).toBeNull();
    // Just released: it cannot be grabbed straight back.
    expect(target.grabImmune).toBeGreaterThan(0);
  });

  it('credits the carrier when it jumps off the platform holding a rival', () => {
    const { round, run, set, of } = makeRound(2);
    const carrier = round.petOfSeat(0)!;
    const target = round.petOfSeat(1)!;
    for (let guard = 0; guard < 600 && Math.hypot(target.x - carrier.x, target.z - carrier.z) > 1.1; guard++) {
      const distance = Math.hypot(target.x - carrier.x, target.z - carrier.z);
      set(0, { x: (target.x - carrier.x) / distance, y: -(target.z - carrier.z) / distance });
      run(1);
    }
    set(0, { edges: [press('b', true)] });
    run(Math.round(grab.windUp / STEP) + 2);
    expect(target.carriedBy).toBe(carrier.id);
    // Straight off the nearest edge, well inside the time the carried pet needs to wriggle free.
    set(0, { y: Math.sign(-carrier.z) || 1 });
    run(240);
    const knockouts = of('eliminated');
    expect(knockouts.map(event => event.seat).sort()).toEqual([0, 1]);
    expect(knockouts.find(event => event.seat === 0)).toMatchObject({ cause: 'fall', killer: null });
    expect(knockouts.find(event => event.seat === 1)).toMatchObject({ cause: 'throw', killer: 0 });
  });

  it('lets a ghost whose meteor knocks out a pet swap back in, and makes the victim the ghost', () => {
    const { round, run, set, of } = makeRound(3);
    // Seat 0 walks off and becomes a ghost.
    set(0, { y: -1 });
    for (let guard = 0; guard < 400 && round.ghosts.length === 0; guard++) run(1);
    set(0, {});
    expect(round.ghosts.map(ghost => ghost.seat)).toEqual([0]);
    expect(round.finished).toBe(false);

    // Seat 1 stands near the edge.
    const victim = round.petOfSeat(1)!;
    set(1, { x: 1 });
    while (victim.x < 7.1) run(1);
    set(1, {});
    run(30);
    expect(victim.grounded).toBe(true);

    // The ghost puts its target just inside of the victim, so the blast throws it outward, and drops.
    const ghost = round.ghosts[0]!;
    for (let guard = 0; guard < 600; guard++) {
      const dx = victim.x - 1 - ghost.x;
      const dz = victim.z - ghost.z;
      if (Math.hypot(dx, dz) < 0.1) break;
      set(0, { x: Math.max(-1, Math.min(1, dx * 4)), y: Math.max(-1, Math.min(1, -dz * 4)) });
      run(1);
    }
    set(0, {});
    run(100);
    expect(ghost.cooldown).toBe(0);
    set(0, { edges: [press('a', true)] });
    run(1);
    expect(of('meteorCall')[0]).toMatchObject({ owner: 0 });
    run(300);

    expect(of('eliminated').find(event => event.seat === 1)).toMatchObject({ cause: 'meteor', killer: 0 });
    expect(of('revengeSwap')[0]).toEqual({ t: 'revengeSwap', ghost: 0, victim: 1 });
    // The avenger has a body again and is no longer counted as knocked out; the victim haunts instead.
    expect(round.petOfSeat(0)).toBeDefined();
    expect(round.ghosts.map(candidate => candidate.seat)).toEqual([1]);
    expect(round.out).toEqual([1]);
  });

  it('warns each ring for a second before dropping it, outside in', () => {
    const { round, run } = makeRound(3);
    const corner = 0;
    const second = arena.size + 1;
    run(Math.round(arena.shrinkAfter / STEP) + 2);
    expect(round.tiles[corner]).toBe(TILE.warning);
    expect(round.tiles[second]).toBe(TILE.solid);
    run(Math.round(arena.warnTime / STEP));
    expect(round.tiles[corner]).toBe(TILE.gone);
    run(Math.round(arena.ringEvery / STEP));
    expect(round.tiles[second]).toBe(TILE.gone);
  });

  it('brings a fallen pet back in the lobby instead of knocking it out', () => {
    const { round, run, set, of } = makeRound(1, 'lobby');
    set(0, { x: 1 });
    // Walk off the edge, and let go of the stick the moment the pet is gone.
    for (let guard = 0; guard < 400 && of('eliminated').length === 0; guard++) run(1);
    set(0, {});
    run(Math.round(match.lobbyRespawn / STEP) + 120);
    expect(of('eliminated')).toHaveLength(1);
    expect(round.out).toEqual([]);
    expect(round.petOfSeat(0)?.grounded).toBe(true);
  });
});

describe('powers', () => {
  it('grows a giant for seven seconds, then returns it to normal size', () => {
    const { round, run, of } = makeRound(2);
    const pet = round.petOfSeat(0)!;
    round.applyPower(pet.id, 'giant');
    run(5);
    expect(pet.scale).toBe(2);
    expect(pet.grounded).toBe(true);
    expect(pet.y).toBeCloseTo(1.3, 1);
    run(Math.round(POWERS.giant.duration / STEP));
    expect(pet.scale).toBe(1);
    expect(pet.power).toBeNull();
    expect(of('powerEnd')[0]).toMatchObject({ seat: 0, power: 'giant' });
  });

  it('spawns three clones that vanish when the power ends', () => {
    const { round, run } = makeRound(2);
    const pet = round.petOfSeat(0)!;
    round.applyPower(pet.id, 'decoys');
    expect(round.pets.filter(other => other.decoy && other.seat === 0)).toHaveLength(3);
    // Clones never count as the player's own pet.
    expect(round.petOfSeat(0)).toBe(pet);
    run(Math.round(POWERS.decoys.duration / STEP) + 2);
    expect(round.pets.filter(other => other.decoy)).toHaveLength(0);
  });

  it('spends a Mega Dash on the next dash', () => {
    const { round, run, set } = makeRound(2);
    const pet = round.petOfSeat(0)!;
    round.applyPower(pet.id, 'megaDash');
    set(0, { x: 1, edges: [press('a', true), press('a', false)] });
    run(2);
    expect(pet.dashTime).toBeGreaterThan(0);
    expect(pet.power).toBeNull();
  });

  it('bounces the attacker off a jelly body and leaves the jelly where it is', () => {
    const { round, run, set, of } = makeRound(2);
    const attacker = round.petOfSeat(0)!;
    const jelly = round.petOfSeat(1)!;
    round.applyPower(jelly.id, 'jelly');
    const gap = () => Math.hypot(attacker.x - jelly.x, attacker.z - jelly.z);
    set(0, { y: 1 });
    // Close enough that even the shortest dash connects.
    while (gap() > 1.5) run(1);
    const before = { x: jelly.x, z: jelly.z };
    set(0, { edges: [press('a', true), press('a', false)] });
    run(30);
    expect(of('dashHit')[0]?.victims).toEqual([]);
    expect(Math.hypot(jelly.x - before.x, jelly.z - before.z)).toBeLessThan(0.6);
    expect(attacker.lastHit).toMatchObject({ seat: 1, cause: 'power' });
  });

  it('rolls when a pet touches the Mystery Cube and starts the power once the reels stop', () => {
    const { round, run, set, of } = makeRound(2);
    const pet = round.petOfSeat(0)!;
    // The first cube arrives within ten seconds.
    for (let guard = 0; guard < 700 && !round.cube; guard++) run(1);
    expect(round.cube).not.toBeNull();
    for (let guard = 0; guard < 900 && round.cube; guard++) {
      const cube = round.cube;
      const distance = Math.hypot(cube.x - pet.x, cube.z - pet.z);
      set(0, { x: (cube.x - pet.x) / distance, y: -(cube.z - pet.z) / distance });
      run(1);
    }
    expect(of('cubeCollected')[0]?.seat).toBe(0);
    expect(of('roll')[0]).toMatchObject({ seat: 0, tier: 'common', power: 'rocket', instant: false });
    expect(pet.power).toBeNull();
    set(0, {});
    run(Math.round(cube.slotTime / STEP) + 1);
    expect(pet.power).toBe('rocket');
  });
});

describe('gacha', () => {
  /** A bot match advanced to play, with a SUPER handed to the first pet. */
  function startGacha(seed: number) {
    const game = new Game(seed);
    const seen: GameEvent[] = [];
    game.startMatch({ rounds: 1, bots: true, petPool: PETS, botName: index => `Bot ${index + 1}` });
    const tick = (count: number) => {
      for (let index = 0; index < count; index++) {
        game.tick(() => idle);
        seen.push(...game.events);
      }
    };
    while (game.phase !== 'play') tick(1);
    const pet = game.round.pets[0]!;
    game.round.superPending = { seat: pet.seat, pet: pet.id, power: 'kaiju' };
    tick(1);
    return { game, pet, seen, tick };
  }

  it('slows the game to a tenth, takes ZICA taps, reveals at 2.4 s and hands over the power at 3.2 s', () => {
    const { game, pet, seen, tick } = startGacha(5);
    expect(game.gacha).toMatchObject({ seat: pet.seat, cursed: null });
    const stepsBefore = game.round.steps;
    tick(60);
    // One real second at a tenth speed is about six physics steps instead of sixty.
    expect(game.round.steps - stepsBefore).toBeGreaterThanOrEqual(5);
    expect(game.round.steps - stepsBefore).toBeLessThanOrEqual(7);
    expect(game.dilation).toBeCloseTo(0.1);
    // The bots that did not win mash ZICA; the count is capped.
    tick(60);
    expect(game.gacha!.jinx).toBeGreaterThan(0);
    expect(game.gacha!.jinx).toBeLessThanOrEqual(25);
    expect(game.gacha!.pulled).toBe(true);
    tick(30);
    const reveal = seen.find(event => event.t === 'gachaReveal');
    expect(reveal).toBeDefined();
    tick(60);
    expect(game.gacha).toBeNull();
    expect(game.round.chargeFrozen).toBe(false);
    const power = reveal?.t === 'gachaReveal' && reveal.cursed ? 'pinata' : 'kaiju';
    if (game.round.petById(pet.id)) expect(pet.power).toBe(power);
    expect(seen.filter(event => event.t === 'gachaStart' || event.t === 'gachaLever' || event.t === 'gachaReveal' || event.t === 'gachaEnd').map(event => event.t)).toEqual(['gachaStart', 'gachaLever', 'gachaReveal', 'gachaEnd']);
    game.round.free();
  });

  it('never lets a second SUPER roll while one is in play', () => {
    const { game } = startGacha(9);
    const rolls = Array.from({ length: 40 }, () => (game as unknown as { roll(seat: number): { tier: string } }).roll(0).tier);
    expect(rolls).not.toContain('super');
    game.round.free();
  });
});

/** Plays a whole match of bots and returns a fingerprint of how it went. */
function playBotMatch(seed: number) {
  const game = new Game(seed);
  const trail: number[] = [];
  const seen = new Set<string>();
  game.startMatch({ rounds: 2, bots: true, petPool: PETS, botName: index => `Bot ${index + 1}` });
  let ticks = 0;
  const limit = 2 * (match.countdown + match.roundCap + match.roundEnd + 5) * 60;
  while (game.phase !== 'matchEnd' && ticks < limit) {
    game.tick(() => idle);
    game.events.forEach(event => seen.add(event.t));
    if (ticks++ % 300 === 0) trail.push(game.round.hash());
  }
  const result = { phase: game.phase, ticks, trail, scores: [...game.scores], standings: game.standings, seen };
  game.round.free();
  return result;
}

/** Two scripted players and no bots: `duel` has one knock the other off with a full dash. */
function makeDuelMatch(rounds: number) {
  const game = new Game(3);
  const inputs = new Map<number, SampledInput>();
  const seen: GameEvent[] = [];
  game.setLobbySeats([seat(0), seat(1)]);
  game.startMatch({ rounds, bots: false, petPool: PETS, botName: index => `Bot ${index + 1}` });
  const tick = (count: number) => {
    for (let index = 0; index < count; index++) {
      game.tick(which => inputs.get(which) ?? idle);
      seen.push(...game.events);
      for (const [which, input] of inputs) if (input.edges.length > 0) inputs.set(which, { ...input, edges: [] });
    }
  };
  const set = (which: number, input: Partial<SampledInput>) => inputs.set(which, { ...idle, ...input });
  const duel = (attackerSeat: number, victimSeat: number) => {
    while (game.phase !== 'play') tick(1);
    tick(30);
    const attacker = game.round.petOfSeat(attackerSeat)!;
    const victim = game.round.petOfSeat(victimSeat)!;
    // The victim backs toward its own edge, then the attacker closes in and lets a full charge go.
    set(victimSeat, { y: -(Math.sign(victim.z) || 1) });
    tick(24);
    set(victimSeat, {});
    tick(20);
    for (let guard = 0; guard < 600 && Math.hypot(victim.x - attacker.x, victim.z - attacker.z) > 3.5; guard++) {
      const distance = Math.hypot(victim.x - attacker.x, victim.z - attacker.z);
      set(attackerSeat, { x: (victim.x - attacker.x) / distance, y: -(victim.z - attacker.z) / distance });
      tick(1);
    }
    set(attackerSeat, { a: true, edges: [press('a', true)] });
    tick(Math.round(dash.chargeTime / STEP) + 2);
    set(attackerSeat, { edges: [press('a', false)] });
    for (let guard = 0; guard < 900 && game.phase === 'play'; guard++) tick(1);
    set(attackerSeat, {});
  };
  return { game, seen, tick, duel };
}

describe('match scoring', () => {
  it('gives 3 for the knockout and 5 and 3 for first and second, and names the leader as the bounty', () => {
    const { game, seen, duel } = makeDuelMatch(2);
    duel(0, 1);
    expect(game.phase).toBe('roundEnd');
    expect([...game.scores]).toEqual([[0, match.killPoints + match.placePoints[0]!], [1, match.placePoints[1]!]]);
    expect(game.bounty).toBe(0);
    expect(seen.filter(event => event.t === 'score').map(event => (event.t === 'score' ? [event.seat, event.reason, event.points] : []))).toEqual([
      [0, 'kill', 3],
      [0, 'place', 5],
      [1, 'place', 3],
    ]);
    game.round.free();
  });

  it('doubles the final round and pays extra for knocking out the bounty holder', () => {
    const { game, tick, duel } = makeDuelMatch(2);
    duel(0, 1);
    // Round two is the last: everything counts double, and seat 0 now carries the bounty.
    duel(1, 0);
    const factor = match.finalRoundFactor;
    expect(game.scores.get(1)).toBe(match.placePoints[1]! + factor * (match.killPoints + match.bountyPoints + match.placePoints[0]!));
    expect(game.scores.get(0)).toBe(match.killPoints + match.placePoints[0]! + factor * match.placePoints[1]!);
    while (game.phase !== 'matchEnd') tick(1);
    expect(game.standings.map(entry => [entry.seat, entry.place])).toEqual([[1, 1], [0, 2]]);
    expect(game.standings.every(entry => entry.award !== null)).toBe(true);
    game.round.free();
  });

  it('hands a seat whose phone is gone to a bot, which then plays it', () => {
    const { game, tick } = makeDuelMatch(1);
    while (game.phase !== 'play') tick(1);
    const pet = game.round.petOfSeat(1)!;
    const start = { x: pet.x, z: pet.z };
    game.handToBot(1);
    expect(game.seats.find(candidate => candidate.seat === 1)?.bot).toBe('coward');
    tick(240);
    const now = game.round.petOfSeat(1);
    // It moves by itself now (or has already got itself knocked out trying).
    expect(!now || Math.hypot(now.x - start.x, now.z - start.z) > 0.5).toBe(true);
    game.round.free();
  });
});

describe('match', () => {
  it('fills the seats with bots and plays every round through to final standings', () => {
    const result = playBotMatch(42);
    expect(result.phase).toBe('matchEnd');
    expect(result.scores).toHaveLength(match.fillTo);
    expect(result.scores.reduce((sum, [, score]) => sum + score, 0)).toBeGreaterThan(0);
    expect(result.standings.map(entry => entry.place)[0]).toBe(1);
    expect(new Set(result.standings.map(entry => entry.award)).size).toBe(match.fillTo);
    for (const type of ['dash', 'eliminated', 'score', 'roundWinner', 'ghost']) expect(result.seen.has(type)).toBe(true);
  });

  it('plays out identically from the same seed, and differently from another', () => {
    const first = playBotMatch(7);
    const second = playBotMatch(7);
    expect(second.trail).toEqual(first.trail);
    expect(second.scores).toEqual(first.scores);
    expect(playBotMatch(8).trail).not.toEqual(first.trail);
  });
});
