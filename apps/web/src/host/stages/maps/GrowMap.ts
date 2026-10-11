// Come e Cresce: a red and white picnic blanket on a wooden table in a garden, with food raining on it. The
// food is chunky and bright; the blanket is pale, so the pets and what they are after both stand out on it.
// The table, the picnic laid round the blanket, the garden far below and the four kinds of food are
// modelled in Blender (tools/blender/maps/grow.py).
//
// The picnic is alive, and it answers the round: guests watch from the basket, the jam and a row of bottle
// caps; the jelly shakes when food lands near it; the teapot whistles when somebody grows; the basket's flap
// bangs and the ants break file on a bite; and as the clock runs the cake goes slice by slice and the ants
// carry the cookie away.
import type { AnyRound, Food, FoodKind, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, Group, Vector3, type Object3D } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps, seats } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { random, syncViews, WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { Crowd, type Spot } from './crowd';

const COLUMNS = tuning.grow.columns;
const ROWS = tuning.grow.rows;
const palette = maps.grow;
const CURSED = new Color(colors.tierCursed);
const SPONGE = new Color(palette.sponge);
const COOKIE = new Color(palette.cookie);
const PETALS = [new Color(palette.icing), WHITE, new Color(palette.clothPale)];
/**
 * How each kind is held up to the camera, which looks down from the front: the ring leans toward it so its
 * hole shows, the others lean back so their profile does. `lift` keeps a leaning piece clear of the blanket.
 * The flat slice and the bent pepper only rock, keeping their best side forward; the round ones turn right round.
 */
const SHOW: Record<FoodKind, { lean: number; lift: number; rocks: boolean }> = {
  apple: { lean: -0.25, lift: 0.12, rocks: false },
  donut: { lean: 0.55, lift: 0.3, rocks: false },
  melon: { lean: -0.3, lift: 0.14, rocks: true },
  pepper: { lean: -0.35, lift: 0.14, rocks: true },
};
/** How hard a piece squashes when it lands. */
const SQUASH = 0.3;
/** The cake: six slices make it whole, one is already on a plate, and these shares of the round are when the next ones go. */
const CAKE = { slices: 5, turn: Math.PI / 3, gap: (225 * Math.PI) / 180, order: [0, 4, 1, 3], gone: [0.16, 0.36, 0.56, 0.76] };
/** The cookie: how many bites the ants take out of it over a round, and how small it ends. */
const NIBBLES = { count: 6, least: 0.42 };
/** The ants: how many walk each way, metres a second, how far apart the two files are, and how far a fright throws one. */
const ANTS = { each: 6, speed: 0.8, lane: 0.42, fright: 1.1 };
/** The basket's flap: where it rests ajar and the lowest it bangs down to (radians), and its spring. */
const FLAP = { open: 0.6, shut: 0.16, stiffness: 60, damping: 5, bang: -9 };
/** The teapot: seconds a whistle lasts, puffs of steam a second while idle and while whistling. */
const WHISTLE = { seconds: 0.9, idle: 2.2, jet: 34 };
/** The ladybird: metres a second, how far outside the blanket it walks, and seconds between two rests. */
const LADYBIRD = { speed: 0.8, x: COLUMNS / 2 + 0.72, z: ROWS / 2 + 0.78, every: 9, rest: 1.6 };
/** Petals come down round the blanket, never over it: this many a second. */
const PETAL_RATE = 2.5;
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

class FoodView {
  readonly group = new Group();
  private readonly shape: Object3D;
  private readonly show: (typeof SHOW)[FoodKind];
  private readonly spin = random(0.7, 1.8) * (Math.random() < 0.5 ? -1 : 1);
  private readonly onLand: (x: number, z: number) => void;
  private landedAt = -1;

  /** `shape` is the model's piece of that kind, standing on its own origin. `onLand` hears where it came down. */
  constructor(kind: FoodKind, shape: Object3D, onLand: (x: number, z: number) => void) {
    this.shape = shape;
    this.show = SHOW[kind];
    this.onLand = onLand;
    this.group.add(shape);
    this.group.rotation.x = this.show.lean;
  }

  /** Falls for as long as its timer runs, lands with a squash, then lies on the blanket, bobbing so it is seen. */
  update(food: Food, time: number): void {
    const falling = food.left > 0;
    if (!falling && this.landedAt < 0) {
      this.landedAt = time;
      this.onLand(food.x, food.z);
    }
    const height = (food.left / tuning.grow.dropTime) * 7;
    this.group.position.set(food.x, this.show.lift + height + (falling ? 0 : Math.abs(Math.sin(time * 3 + food.id)) * 0.08), food.z);
    this.shape.rotation.y = this.show.rocks ? Math.sin(time * this.spin + food.id) * 0.6 : time * this.spin;
    // Stretched on the way down; on landing it flattens and springs back.
    const age = time - this.landedAt;
    const squash = falling ? -0.12 : SQUASH * Math.exp(-age * 9) * Math.cos(age * 20);
    this.group.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
  }

  /** The shape and its colours belong to the model. */
  dispose(): void {
    this.group.removeFromParent();
  }
}

/** One ant of a file: how far along it is (0 to 1), and how far a fright has thrown it off its line. */
type Ant = { shape: Object3D; along: number; home: boolean; offX: number; offZ: number };
/** One slice of the cake on the stand: 1 while it is there, falling to 0 as it is taken. */
type Slice = { shape: Object3D; there: number; taken: boolean };

export class GrowMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'day';
  readonly light = { hemisphere: 1.15, sun: 1.5 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.cloth, palette.clothPale]);
  private readonly foods = new Map<number, FoodView>();
  private readonly model = new Model('grow');
  private readonly crowd: Crowd;
  /** Seconds since the map appeared: what the map's own pieces pop in by. */
  private age = 0;

  private readonly jelly: Object3D | undefined;
  private wobble = 0.4;
  private readonly lid: Object3D | undefined;
  private readonly lidRest = new Vector3();
  private readonly spout = new Vector3();
  private whistle = 0;
  private steam = 0;
  private readonly flap: Object3D | undefined;
  private flapAngle = 0;
  private flapSpeed = 0;
  private readonly cookie: Object3D | undefined;
  private nibbles = 0;
  private hurry = 0;
  private readonly slices: Slice[] = [];
  private readonly ants: Ant[] = [];
  private readonly antsFrom = new Vector3();
  private readonly antsTo = new Vector3();
  private readonly ladybird: Object3D;
  private ladybirdAt = 0;
  private ladybirdRest = 0;
  private ladybirdNext = LADYBIRD.every;
  /** How many sizes each seat has grown, to hear when one grows another. */
  private readonly sizes = new Map<number, number>();

  constructor(kit: StageKit) {
    this.kit = kit;
    // Gingham: where a pale stripe crosses a pale stripe, the square is a shade deeper.
    const cross = new Color(palette.clothCross);
    for (let column = 1; column < COLUMNS; column += 2) for (let row = 1; row < ROWS; row += 2) this.tiles.setColor(column * ROWS + row, cross, false);
    this.group.add(this.tiles.mesh, this.model.scene);
    this.tiles.reset(true);
    for (let column = 1; column < COLUMNS; column += 2) for (let row = 1; row < ROWS; row += 2) this.tiles.setColor(column * ROWS + row, cross, false);

    const { model } = this;
    this.jelly = model.node('jelly');
    this.lid = model.node('teapot_lid');
    if (this.lid) this.lidRest.copy(this.lid.position);
    this.spout.copy(model.node('mark_spout')?.position ?? this.lidRest);
    this.flap = model.node('basket_flap');
    this.flapAngle = FLAP.open;
    this.cookie = model.node('cookie');

    // The cake: every slice but the one already served, in a ring on the stand, the gap turned to the camera.
    const stand = model.node('mark_cake')?.position ?? new Vector3();
    for (let index = 0; index < CAKE.slices; index++) {
      const shape = model.part('slice');
      shape.position.copy(stand);
      shape.rotation.y = CAKE.gap + (index + 1) * CAKE.turn;
      shape.scale.setScalar(0.001);
      this.slices.push({ shape, there: 1, taken: false });
      this.group.add(shape);
    }

    // The ants: one file out to the cookie, one home with the crumbs.
    this.antsFrom.copy(model.node('mark_ants_from')?.position ?? new Vector3());
    this.antsTo.copy(model.node('mark_ants_to')?.position ?? new Vector3());
    for (let index = 0; index < ANTS.each * 2; index++) {
      const home = index % 2 === 1;
      const shape = model.part(home ? 'ant_loaded' : 'ant');
      this.ants.push({ shape, along: Math.floor(index / 2) / ANTS.each, home, offX: 0, offZ: 0 });
      this.group.add(shape);
    }
    this.ladybird = model.part('ladybird');
    this.ladybird.scale.setScalar(0.001);
    this.group.add(this.ladybird);

    // The guests stand wherever the model left a place for one, and face the blanket.
    const spots: Spot[] = [];
    for (let index = 0; ; index++) {
      const at = model.node(`stand_${index}`)?.position;
      if (!at) break;
      spots.push({ x: at.x, y: at.y, z: at.z, turn: Math.atan2(-at.x, -at.z) });
    }
    this.crowd = new Crowd(spots, { seed: 7 });
    this.group.add(this.crowd.group);
  }

  handle(event: GameEvent, round: AnyRound): void {
    const { particles, words, rig, stars } = this.kit;
    if (event.t === 'roundWinner') {
      // The whole picnic celebrates: the guests dance, the pot whistles, the flap claps.
      this.crowd.cheer(3);
      this.whistle = WHISTLE.seconds * 2;
      this.flapSpeed = FLAP.bang;
      this.wobble = 2.4;
      return;
    }
    if (event.t === 'eat') {
      // A bite taken: crumbs in the eater's colour. A pepper goes up in a purple puff instead.
      const color = event.kind === 'pepper' ? CURSED : new Color(seats[event.seat % seats.length]!.color);
      for (let index = 0; index < (event.kind === 'melon' ? 9 : 5); index++) {
        const angle = random(0, Math.PI * 2);
        particles.cube({ x: event.x, y: 0.5, z: event.z, vx: Math.sin(angle) * random(1, 3), vy: random(2, 5), vz: Math.cos(angle) * random(1, 3), life: random(0.3, 0.6), size: random(0.07, 0.14), gravity: 16, spin: 9, color });
      }
      if (event.kind === 'pepper') {
        particles.puff({ x: event.x, y: 0.6, z: event.z, life: 0.4, size: 0.4, sizeEnd: 1, color: CURSED });
        this.crowd.gasp();
        this.wobble = Math.max(this.wobble, 1.6);
      } else if (event.kind === 'melon') {
        this.crowd.clap();
      }
      return;
    }
    if (event.t !== 'bite') return;
    const victim = round.petById(event.victim);
    if (!victim) return;
    stars(victim.x, 1, victim.z, 10);
    rig.shake(0.25);
    words.pop(strings.words3d.bite, victim.x, 2.6, victim.z - 0.6, { size: 0.8, color: seats[event.seat % seats.length]!.color, seconds: 0.8 });
    particles.puff({ x: victim.x, y: 0.8, z: victim.z, life: 0.3, size: 0.5, sizeEnd: 1.1, color: WHITE });
    // A bite shakes the table: the guests start, the flap bangs, the jelly quivers and the ants break file.
    this.crowd.gasp();
    this.flapSpeed = FLAP.bang;
    this.wobble = 2.2;
    for (const ant of this.ants) {
      const angle = random(0, Math.PI * 2);
      ant.offX = Math.sin(angle) * random(0.4, ANTS.fright);
      // Away from the blanket, never onto it.
      ant.offZ = -Math.abs(Math.cos(angle)) * random(0.4, ANTS.fright);
    }
    this.hurry = 1.5;
  }

  frame(round: AnyRound | null, dt: number, time: number): void {
    const field = round?.gameMode === 'grow' ? round : null;
    this.age += dt;
    syncViews(this.group, this.foods, field?.rules.foods ?? [], food => new FoodView(food.kind, this.model.part(food.kind), (x, z) => this.landed(x, z)), (view, food) => view.update(food, time));
    this.tiles.update(dt, time);

    // The guests follow whoever is biggest. When a pet grows a size, the pot whistles and they clap.
    let biggest: { x: number; z: number } | null = null;
    let most = -1;
    for (const pet of field?.playing ? field.pets : []) {
      const eaten = field!.rules.eaten(pet.seat);
      if (eaten > most) [most, biggest] = [eaten, pet];
      const size = field!.rules.size(pet.seat);
      if (size > (this.sizes.get(pet.seat) ?? 0)) {
        this.whistle = WHISTLE.seconds;
        this.crowd.clap();
      }
      this.sizes.set(pet.seat, size);
    }
    this.crowd.watch(biggest && most > 0 ? { x: biggest.x, z: biggest.z } : null);
    this.crowd.update(dt);

    const spent = field && field.cap > 0 ? clamp01(field.time / field.cap) : 0;
    this.jellyFrame(dt, time);
    this.teapotFrame(dt, time);
    this.flapFrame(dt, time);
    this.cakeFrame(spent, dt);
    this.antsFrame(spent, dt, time);
    this.ladybirdFrame(dt, time);
    this.petals(dt);
    // The bee and the butterfly: whatever was given motion in Blender.
    this.model.update(dt);
  }

  dispose(): void {
    this.foods.forEach(view => view.dispose());
    this.crowd.dispose();
    this.tiles.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }

  /** Food coming down near the jelly sets it shaking, harder the nearer it lands. */
  private landed(x: number, z: number): void {
    if (!this.jelly) return;
    const near = 1 - Math.hypot(x - this.jelly.position.x, z - this.jelly.position.z) / 9;
    if (near > 0) this.wobble = Math.min(2.4, this.wobble + near * 1.6);
  }

  /** It never quite stops; a shake dies away to that. */
  private jellyFrame(dt: number, time: number): void {
    if (!this.jelly) return;
    this.wobble += (0.4 - this.wobble) * (1 - Math.exp(-1.6 * dt));
    const swing = this.wobble * 0.07;
    this.jelly.rotation.set(Math.sin(time * 10.3) * swing, 0, Math.cos(time * 9.1) * swing);
    const squash = Math.sin(time * 13) * this.wobble * 0.045;
    this.jelly.scale.set(1 + squash, 1 - squash * 1.4, 1 + squash);
  }

  /** A wisp of steam all the time; a jet of it, and a dancing lid, while it whistles. */
  private teapotFrame(dt: number, time: number): void {
    const { particles } = this.kit;
    const whistling = this.whistle > 0;
    this.whistle = Math.max(0, this.whistle - dt);
    // Out of the spout and away from the pot, which is the way the spout points.
    const out = Math.hypot(this.spout.x - this.lidRest.x, this.spout.z - this.lidRest.z) || 1;
    const dirX = (this.spout.x - this.lidRest.x) / out;
    const dirZ = (this.spout.z - this.lidRest.z) / out;
    this.steam += dt * (whistling ? WHISTLE.jet : WHISTLE.idle);
    for (; this.steam >= 1 && this.age > 1.2; this.steam--) {
      const push = whistling ? random(2.5, 4.5) : random(0.2, 0.5);
      particles.puff({ x: this.spout.x, y: this.spout.y, z: this.spout.z, vx: dirX * push + random(-0.2, 0.2), vy: whistling ? random(3, 5) : random(0.9, 1.4), vz: dirZ * push + random(-0.2, 0.2), life: whistling ? random(0.4, 0.7) : random(1.2, 1.8), size: whistling ? 0.18 : 0.14, sizeEnd: whistling ? 0.5 : 0.42, drag: whistling ? 2.2 : 0.4, color: WHITE });
    }
    if (!this.lid) return;
    const rattle = whistling ? 1 : 0;
    this.lid.position.set(this.lidRest.x, this.lidRest.y + Math.abs(Math.sin(time * 38)) * 0.16 * rattle, this.lidRest.z);
    this.lid.rotation.set(Math.sin(time * 31) * 0.14 * rattle, 0, Math.cos(time * 27) * 0.14 * rattle);
  }

  /** The basket's flap rests ajar on a spring. A bang drives it down; it bounces off the loaf and comes back up. */
  private flapFrame(dt: number, time: number): void {
    if (!this.flap) return;
    const rest = FLAP.open + Math.sin(time * 0.9) * 0.03;
    this.flapSpeed += ((rest - this.flapAngle) * FLAP.stiffness - this.flapSpeed * FLAP.damping) * dt;
    this.flapAngle += this.flapSpeed * dt;
    if (this.flapAngle < FLAP.shut) {
      this.flapAngle = FLAP.shut;
      this.flapSpeed = Math.abs(this.flapSpeed) * 0.45;
    }
    this.flap.rotation.z = this.flapAngle;
  }

  /** The slices pop onto the stand as the map arrives, and are taken one by one as the round goes by. */
  private cakeFrame(spent: number, dt: number): void {
    const { particles } = this.kit;
    CAKE.order.forEach((which, turn) => {
      const slice = this.slices[which];
      if (!slice || slice.taken || spent < CAKE.gone[turn]!) return;
      slice.taken = true;
      const { x, y, z } = slice.shape.position;
      const angle = slice.shape.rotation.y;
      for (let index = 0; index < 10; index++) {
        particles.cube({ x: x + Math.cos(angle) * 0.7, y: y + 0.8, z: z - Math.sin(angle) * 0.7, vx: random(-2, 2), vy: random(2, 5), vz: random(-2, 2), life: random(0.4, 0.8), size: random(0.08, 0.16), gravity: 16, spin: 9, color: SPONGE });
      }
    });
    this.slices.forEach((slice, index) => {
      if (slice.taken) slice.there = Math.max(0, slice.there - dt / 0.3);
      const arrived = clamp01((this.age - 0.7 - index * 0.07) / 0.3);
      // Taken with a little swell first, then gone.
      const leaving = slice.there > 0.6 ? 1 + (1 - slice.there) * 0.3 : (slice.there / 0.6) * 1.12;
      slice.shape.scale.setScalar(Math.max(0.001, (arrived === 1 ? 1 : backOut(arrived)) * (slice.taken ? leaving : 1)));
      slice.shape.position.y += slice.taken && slice.there > 0 ? dt * 1.6 : 0;
      slice.shape.visible = slice.there > 0;
    });
  }

  /** Two files between the basket and the cookie. Each bite they take out of it makes it smaller. */
  private antsFrame(spent: number, dt: number, time: number): void {
    const { particles } = this.kit;
    const bites = Math.floor(spent * NIBBLES.count);
    if (bites > this.nibbles && this.cookie) {
      this.nibbles = bites;
      this.hurry = 1.2;
      for (let index = 0; index < 5; index++) {
        particles.cube({ x: this.cookie.position.x + random(-0.6, 0.6), y: this.cookie.position.y + 0.4, z: this.cookie.position.z + random(-0.6, 0.6), vx: random(-1.5, 1.5), vy: random(1.5, 3.5), vz: random(-1.5, 1.5), life: random(0.3, 0.6), size: random(0.06, 0.12), gravity: 14, spin: 9, color: COOKIE });
      }
    }
    if (this.cookie) {
      const size = 1 - (this.nibbles / NIBBLES.count) * (1 - NIBBLES.least);
      this.cookie.scale.setScalar(this.cookie.scale.x + (size - this.cookie.scale.x) * (1 - Math.exp(-6 * dt)));
    }

    this.hurry = Math.max(0, this.hurry - dt);
    const length = Math.hypot(this.antsTo.x - this.antsFrom.x, this.antsTo.z - this.antsFrom.z) || 1;
    const step = ((ANTS.speed * (this.hurry > 0 ? 2.2 : 1)) / length) * dt;
    const settle = Math.exp(-2.4 * dt);
    this.ants.forEach((ant, index) => {
      ant.along = (ant.along + step) % 1;
      ant.offX *= settle;
      ant.offZ *= settle;
      const [from, to] = ant.home ? [this.antsTo, this.antsFrom] : [this.antsFrom, this.antsTo];
      const lane = ant.home ? ANTS.lane : -ANTS.lane;
      ant.shape.position.set(from.x + (to.x - from.x) * ant.along + ant.offX, from.y + Math.abs(Math.sin(time * 16 + index)) * 0.03, from.z + (to.z - from.z) * ant.along + lane + ant.offZ);
      ant.shape.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x) + Math.sin(time * 15 + index * 1.7) * 0.14;
      // Each comes out of the basket or the cookie small and goes in small, so none appears or vanishes.
      const ends = Math.min(1, ant.along / 0.07, (1 - ant.along) / 0.07);
      ant.shape.scale.setScalar(Math.max(0.001, ends * clamp01((this.age - 0.8) / 0.3)));
    });
  }

  /** Round and round the blanket's edge, just outside it, stopping now and then to think. */
  private ladybirdFrame(dt: number, time: number): void {
    this.ladybirdNext -= dt;
    if (this.ladybirdNext <= 0) {
      this.ladybirdNext = LADYBIRD.every + random(0, 4);
      this.ladybirdRest = LADYBIRD.rest;
    }
    this.ladybirdRest = Math.max(0, this.ladybirdRest - dt);
    const walking = this.ladybirdRest <= 0;
    if (walking) this.ladybirdAt += LADYBIRD.speed * dt;
    // The four sides in turn, starting along the back.
    const sides = [LADYBIRD.x * 2, LADYBIRD.z * 2, LADYBIRD.x * 2, LADYBIRD.z * 2];
    let left = this.ladybirdAt % (sides[0]! * 2 + sides[1]! * 2);
    let side = 0;
    while (left > sides[side]!) left -= sides[side++]!;
    const corners = [[-LADYBIRD.x, -LADYBIRD.z], [LADYBIRD.x, -LADYBIRD.z], [LADYBIRD.x, LADYBIRD.z], [-LADYBIRD.x, LADYBIRD.z]] as const;
    const [fromX, fromZ] = corners[side]!;
    const [toX, toZ] = corners[(side + 1) % 4]!;
    const share = left / sides[side]!;
    const heading = Math.atan2(-(toZ - fromZ), toX - fromX);
    this.ladybird.position.set(fromX + (toX - fromX) * share, -0.16, fromZ + (toZ - fromZ) * share);
    const turn = Math.atan2(Math.sin(heading - this.ladybird.rotation.y), Math.cos(heading - this.ladybird.rotation.y));
    this.ladybird.rotation.y += turn * (1 - Math.exp(-8 * dt)) + (walking ? Math.sin(time * 13) * 0.02 : 0);
    this.ladybird.scale.setScalar(Math.max(0.001, backOut(clamp01((this.age - 1) / 0.3))));
  }

  /** Petals off a tree overhead, coming down round the blanket and never over it. */
  private petals(dt: number): void {
    if (Math.random() >= PETAL_RATE * dt) return;
    const x = random(-15, 15);
    const z = random(-11, 11);
    if (Math.abs(x) < COLUMNS / 2 + 1 && Math.abs(z) < ROWS / 2 + 1) return;
    this.kit.particles.cube({ x, y: random(6, 8), z, vx: random(-0.5, 0.1), vy: random(-1.3, -0.9), vz: random(-0.2, 0.2), life: random(5, 6.5), size: random(0.07, 0.11), spin: random(-3, 3), color: PETALS[Math.floor(Math.random() * PETALS.length)]! });
  }
}
