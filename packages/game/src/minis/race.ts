// Corrida Maluca: a track three tiles wide that is drawn afresh every round. It starts at one side of the floor
// and ends in the far corner of the other, turning at the points of a grid and never crossing or touching
// itself, with gaps to jump, tiles that blink away, beams to balance on and bars that sweep pets off wherever
// it runs straight for long enough. A is a jump. A fall is never the end: the pet is put back at the last flag
// it passed. First over the line wins, and a few seconds later the round is called.
import type { Rng } from '../rng';
import { race, STEP } from '../tuning';
import { TILE, type Pet } from '../types';
import { rankBy, type Field, type MiniRules } from './field';

export type Obstacle = 'gap' | 'blink' | 'narrow' | 'sweeper';
export type Sweeper = { x: number; z: number; angle: number; speed: number };
/** One obstacle: what it is, how far along the track its middle is, and for a beam which of the track's three rows is left standing (-1, 0 or 1). */
export type Hurdle = { kind: Obstacle; at: number; row: number };
/** One straight piece of the track's middle line, from one corner to the next: where it starts along the track, how long it is and which way it runs. */
export type Leg = { from: { x: number; z: number }; to: { x: number; z: number }; start: number; length: number; dx: number; dz: number };

/** A point of the grid the track turns at: its column, from the left, and its row, from the front. */
type Node = { column: number; row: number };
/** A way across the grid: the nodes it passes (each as column times rows plus row), how many times it turns, how long it is and how many obstacles it has room for. */
type Route = { nodes: number[]; turns: number; length: number; hurdles: number };

/** How many obstacles a straight of that length holds, when the first may be no nearer its start than `lead`. */
function room(length: number, lead: number): number {
  if (length < race.minRun || length - race.clear < lead) return 0;
  return Math.floor((length - race.clear - lead) / race.spacing) + 1;
}

/**
 * Every track there can be: from any node of the left column, setting off across the floor, to the back corner of
 * the right column, by a line that passes no node twice, is long enough and has room for enough obstacles. There are
 * a few thousand, and as many again mirrored. Found once, in a few hundredths of a second: the grid never changes.
 */
let found: Route[] | null = null;
function routes(): Route[] {
  if (found) return found;
  const all: Route[] = [];
  const { nodesX, nodesZ } = race;
  const end = (nodesX - 1) * nodesZ + nodesZ - 1;
  const taken = new Uint8Array(nodesX * nodesZ);
  const nodes: number[] = [];
  /** Looks at the way just walked, one straight after another, and keeps it if it makes a race. */
  const measure = () => {
    let straights = 0;
    let length = 0;
    let hurdles = 0;
    let run = 0;
    let heading = 0;
    const close = () => {
      // The first straight is the one that leaves the start, where nothing stands for a little longer.
      hurdles += room(run, straights === 0 ? race.lead : race.clear);
      length += run;
      straights++;
      run = 0;
    };
    for (let index = 1; index < nodes.length; index++) {
      const step = nodes[index]! - nodes[index - 1]!;
      if (step !== heading && run > 0) close();
      heading = step;
      // A step of one is to the next row; any other is to the next column.
      run += Math.abs(step) === 1 ? race.pitchZ : race.pitchX;
    }
    close();
    if (length >= race.minLength && hurdles >= race.minHurdles) all.push({ nodes: [...nodes], turns: straights - 1, length, hurdles });
  };
  const walk = (here: number) => {
    if (here === end) return measure();
    const column = Math.floor(here / nodesZ);
    const row = here % nodesZ;
    // The first step is always across the floor: the start's arch stands behind it, off the side.
    if (column + 1 < nodesX) step(here + nodesZ);
    if (nodes.length === 1) return;
    if (column > 0) step(here - nodesZ);
    if (row + 1 < nodesZ) step(here + 1);
    if (row > 0) step(here - 1);
  };
  const step = (next: number) => {
    if (taken[next]) return;
    taken[next] = 1;
    nodes.push(next);
    walk(next);
    nodes.pop();
    taken[next] = 0;
  };
  for (let row = 0; row < nodesZ; row++) step(row);
  found = all;
  return all;
}

/** The middle line of one round's track, corner to corner, and what stands on it. */
export class Track {
  readonly legs: readonly Leg[];
  /** How long the whole track is, in metres. */
  readonly length: number;
  /** How many times it turns. */
  readonly turns: number;

  /** `corners` are the places it starts, turns and ends, in order. */
  constructor(corners: readonly { x: number; z: number }[]) {
    let start = 0;
    this.legs = corners.slice(1).map((to, index) => {
      const from = corners[index]!;
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      const leg = { from, to, start, length, dx: (to.x - from.x) / length, dz: (to.z - from.z) / length };
      start += length;
      return leg;
    });
    this.length = start;
    this.turns = this.legs.length - 1;
  }

  /**
   * Finds every track there can be, which the first draw would otherwise stop to do: a few hundredths of a second
   * that are better spent while the game is loading than as a round is announced.
   */
  static warm(): void {
    routes();
  }

  /**
   * A track drawn by the roll: one of every way there is, a twisting one as likely as one of long straights, and
   * as likely to start on the right as on the left.
   */
  static draw(rng: Rng): Track {
    const all = routes();
    // By how much it turns first, then any of those: there are far more ways to twist than to run straight, and both should come up.
    const kinds = [...new Set(all.map(route => route.turns))].sort((a, b) => a - b);
    const turns = kinds[rng.int(kinds.length)]!;
    const some = all.filter(route => route.turns === turns);
    const route = some[rng.int(some.length)]!;
    const mirror = rng.chance(0.5) ? -1 : 1;
    const nodes: Node[] = route.nodes.map(node => ({ column: Math.floor(node / race.nodesZ), row: node % race.nodesZ }));
    const spot = (node: Node) => ({ x: mirror * (node.column - (race.nodesX - 1) / 2) * race.pitchX, z: ((race.nodesZ - 1) / 2 - node.row) * race.pitchZ });
    // Only where it turns, and its two ends.
    const corners = nodes.filter((node, index) => {
      const before = nodes[index - 1];
      const after = nodes[index + 1];
      return !before || !after || after.column - node.column !== node.column - before.column || after.row - node.row !== node.row - before.row;
    });
    return new Track(corners.map(spot));
  }

  /** The spot on the middle of the track that far along it, and which way the track runs there. */
  pointAt(progress: number): { x: number; z: number; dx: number; dz: number } {
    const along = Math.min(this.length, Math.max(0, progress));
    let index = this.legs.length - 1;
    while (index > 0 && this.legs[index]!.start > along) index--;
    const { from, to, start, length, dx, dz } = this.legs[index]!;
    const t = (along - start) / length;
    return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, dx, dz };
  }

  /** How far along the track a spot is: the nearest point on its middle line. */
  progressOf(x: number, z: number): number {
    let best = 0;
    let nearest = Infinity;
    for (const leg of this.legs) {
      const t = Math.min(1, Math.max(0, ((x - leg.from.x) * (leg.to.x - leg.from.x) + (z - leg.from.z) * (leg.to.z - leg.from.z)) / leg.length ** 2));
      const distance = Math.hypot(leg.from.x + (leg.to.x - leg.from.x) * t - x, leg.from.z + (leg.to.z - leg.from.z) * t - z);
      if (distance < nearest) {
        nearest = distance;
        best = leg.start + t * leg.length;
      }
    }
    return best;
  }
}

type Slot = { kind: Obstacle; tiles: number[]; offset: number };

export class RaceRules implements MiniRules {
  readonly mode = 'race' as const;
  readonly cap = race.cap;
  /** This round's track. A stand-in until the round is set up, when the roll draws the real one. */
  track = new Track([{ x: -1, z: 0 }, { x: 1, z: 0 }]);
  /** How far each seat has got, in metres along the track. It never goes down. */
  readonly best = new Map<number, number>();
  /** Seats that crossed the line, in order, with the second they did. */
  readonly finishers: { seat: number; at: number }[] = [];
  /** Where a pet that falls is put back: how far along the track each flag stands. */
  readonly flags: number[] = [];
  /** What stands in the way, in the order it is met. */
  readonly hurdles: Hurdle[] = [];
  readonly sweepers: Sweeper[] = [];
  private readonly slots: Slot[] = [];
  /** Which place on the starting grid each pet takes, in the order they are set down: drawn for the race. */
  private grid: number[] = [];

  setup(field: Field): void {
    field.resize(race.columns, race.rows);
    field.fall = 'respawn';
    const track = (this.track = Track.draw(field.rng));
    field.tiles.fill(TILE.gone);
    // The track: every tile within a tile and a half of its middle line.
    for (let index = 0; index < field.tiles.length; index++) {
      const { x, z } = field.centre(index);
      const middle = track.pointAt(track.progressOf(x, z));
      if (Math.max(Math.abs(middle.x - x), Math.abs(middle.z - z)) <= 1.01) field.tiles[index] = TILE.solid;
    }

    // Where the obstacles go: on every straight long enough, spread along it and nudged a little by the roll, clear
    // of its corners. Half a tile off the corner's own line, so each is centred on a line between tiles.
    const places: number[] = [];
    this.flags.push(0);
    track.legs.forEach((leg, index) => {
      if (index > 0) this.flags.push(leg.start);
      const low = index === 0 ? race.lead : race.clear;
      const high = leg.length - race.clear;
      const count = room(leg.length, low);
      const nudge = field.rng.range(-1, 1);
      let last: number | null = null;
      for (let slot = 0; slot < count; slot++) {
        const even = count === 1 ? (low + high) / 2 : low + (slot * (high - low)) / (count - 1);
        const at = Math.min(high + 0.5, Math.max(low - 0.5, Math.floor(even + nudge) + 0.5));
        places.push(leg.start + at);
        // A flag just past each obstacle that has another after it on the same straight (every corner has one
        // already). Just past, not half way: whoever comes back at it starts from standing, and needs the rest of
        // the way to the next obstacle as a run-up. From half way a gap could not be jumped at all.
        if (last !== null) this.flags.push(leg.start + last + race.stretch / 2 + 0.5);
        last = at;
      }
    });
    this.flags.sort((a, b) => a - b);

    // The four kinds in turn, as many as there are places, in an order the roll decides.
    const turn: Obstacle[] = ['gap', 'blink', 'narrow', 'sweeper'];
    const kinds = places.map((_, index) => turn[index % turn.length]!);
    for (let index = kinds.length - 1; index > 0; index--) {
      const other = field.rng.int(index + 1);
      [kinds[index], kinds[other]] = [kinds[other]!, kinds[index]!];
    }
    places.forEach((at, index) => {
      const kind = kinds[index]!;
      // A beam is any one of the track's three rows; a bar turns either way.
      const hurdle = { kind, at, row: kind === 'narrow' ? field.rng.int(3) - 1 : 0 };
      this.hurdles.push(hurdle);
      this.place(field, hurdle, field.rng.range(0, race.blinkCycle), field.rng.chance(0.5) ? 1 : -1);
    });
  }

  /**
   * On the starting grid, two abreast: the front row first, so with few pets nobody starts behind anybody. Who
   * takes which place is drawn for the race, so the same seat is not at the back every time.
   */
  spawn(field: Field, index: number, count: number): { x: number; z: number } {
    if (this.grid.length !== count) {
      this.grid = Array.from({ length: count }, (_, place) => place);
      for (let place = count - 1; place > 0; place--) {
        const other = field.rng.int(place + 1);
        [this.grid[place], this.grid[other]] = [this.grid[other]!, this.grid[place]!];
      }
    }
    const place = this.grid[index % count] ?? index;
    const rows = Math.ceil(count / 2);
    const { x, z, dx, dz } = this.track.pointAt(0);
    const ahead = (rows - 1 - Math.floor(place / 2)) * race.gridRow - race.gridBack;
    const aside = (place % 2 === 0 ? -1 : 1) * race.gridAside;
    return { x: x + dx * ahead + dz * aside, z: z + dz * ahead - dx * aside };
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
        const along = this.track.progressOf(pet.x, pet.z);
        // Only steps forward count, and only a step at a time: landing on another stretch of the track is not progress.
        const so = this.best.get(pet.seat) ?? 0;
        if (along > so && along < so + race.maxStride) this.best.set(pet.seat, along);
      }
      if ((this.best.get(pet.seat) ?? 0) >= this.track.length - 0.6 && !this.finishers.some(entry => entry.seat === pet.seat)) {
        this.best.set(pet.seat, this.track.length);
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
    return this.track.pointAt(this.flagOf(pet.seat));
  }

  finished(field: Field): boolean {
    const first = this.finishers[0];
    return this.finishers.length >= field.pets.length || (first !== undefined && field.time >= first.at + race.grace);
  }

  /** Those over the line, in the order they crossed it; then everyone else by how far they got. */
  ranking(field: Field): number[][] {
    const done = new Set(this.finishers.map(entry => entry.seat));
    const rest = field.pets.map(pet => pet.seat).filter(seat => !done.has(seat));
    // Those who crossed in the same instant share the place.
    return [...rankBy([...done], seat => -this.finishers.find(entry => entry.seat === seat)!.at), ...rankBy(rest, seat => Math.round((this.best.get(seat) ?? 0) * 2))];
  }

  /** How much of the track is behind the pet, out of 100. */
  metric(_field: Field, seat: number): number {
    return Math.round(((this.best.get(seat) ?? 0) / this.track.length) * 100);
  }

  hash(): number {
    let hash = this.finishers.length + Math.round(this.track.length) * 7 + this.hurdles.length * 131;
    for (const [seat, along] of this.best) hash = (Math.imul(hash, 31) + seat * 1000 + Math.round(along * 100)) | 0;
    return hash;
  }

  /** The flag a seat would come back to: the last one it has passed. */
  flagOf(seat: number): number {
    const so = this.best.get(seat) ?? 0;
    return [...this.flags].reverse().find(flag => flag <= so + 0.5) ?? 0;
  }

  private place(field: Field, hurdle: Hurdle, offset: number, way: number): void {
    const { kind } = hurdle;
    const centre = this.track.pointAt(hurdle.at);
    const tiles: number[] = [];
    // The tiles of the track across its width, for a stretch along it.
    const stretch = kind === 'gap' ? race.gapLength : race.stretch;
    for (let index = 0; index < field.tiles.length; index++) {
      const tile = field.centre(index);
      const along = (tile.x - centre.x) * centre.dx + (tile.z - centre.z) * centre.dz;
      const across = (tile.x - centre.x) * centre.dz - (tile.z - centre.z) * centre.dx;
      if (Math.abs(along) > stretch / 2 || Math.abs(across) > 1.01 || field.tiles[index] !== TILE.solid) continue;
      // A gap takes the whole width; a beam leaves one row; blinking tiles keep the width and come and go.
      if (kind === 'gap' || (kind === 'narrow' && Math.abs(across - hurdle.row) > 0.5)) field.tiles[index] = TILE.gone;
      else if (kind === 'blink') tiles.push(index);
    }
    if (kind === 'sweeper') this.sweepers.push({ x: centre.x, z: centre.z, angle: offset, speed: race.sweepSpeed * way });
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
