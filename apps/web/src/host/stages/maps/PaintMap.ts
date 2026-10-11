// Pinta o Chão: a sheet of white paper taped to a cutting mat on an artist's desk, at a window, with giant
// pencils, brushes and crayons lying round it. The paper is the floor; each tile takes the colour of whoever
// stepped on it last, a little lightened, so pets still stand out. The desk, what lies on it, the room behind
// it, the pots and the falling bucket are modelled in Blender (tools/blender/maps/paint.py).
//
// The desk is alive, and it answers the round: guests watch from the ruler, the sketchbook and the palette;
// the lamp turns its head to whoever is ahead; the toy bird drinks faster as the clock runs down; a bucket
// landing rolls the pencil and rattles the brush in its glass; and a bucket kicked over makes its kicker's
// pot jump, squeezes the tube and leaves paint on the mat, so the desk ends the round messier than it began.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, Group, Vector3, type Object3D } from 'three';
import { motion } from '../../../shared/motion';
import { colors, maps, seats } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { syncViews, WHITE, random, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { Crowd, type Spot } from './crowd';

const COLUMNS = tuning.paint.columns;
const ROWS = tuning.paint.rows;
const palette = maps.paint;
/** How much white goes into a painted tile: enough that a pet's ring still shows on its own colour. */
const LIGHTEN = 0.42;
const painted = seats.map(seat => new Color(seat.color).lerp(new Color(colors.white), LIGHTEN));
const splashColor = seats.map(seat => new Color(seat.color));
const WATER = new Color(palette.water);
const DUST = new Color(palette.bulb);
/** Where the six pots stand: three at each end of the back of the mat, where the clock at the top of the picture never covers one. */
const POTS = { x: [-11.5, -9.7, -7.9, 7.9, 9.7, 11.5], z: -ROWS / 2 - 2.95, stagger: 0.4, floor: -0.06 };
/** Seconds a pot's jump lasts, how high it goes, and how hard it squashes when it comes down. */
const JUMP = { seconds: 0.55, height: 1.3, squash: 0.25 };
/** The pots pop in one after another once the map is up. */
const ARRIVE = { after: 0.25, each: motion.staggerMs / 500, seconds: motion.popIn.ms / 1000 };
/** The lamp: how far its head turns either way (radians), how fast, and how it sweeps when there is nobody to follow. */
const LAMP = { reach: 0.75, turn: 2.2, sweep: 0.5, sweepPace: 0.7, dust: 2.5 };
/** The bird: seconds from one drink to the next at the start of a round and at its end, how far it tips (radians), and when in that time its beak is in the water. */
const BIRD = { calm: 4.6, hurried: 1.7, hurryFrom: 0.55, tip: 1.15, down: 0.62, up: 0.76 };
/** The pencil: how far it rolls each time, from one flat to the next. */
const ROLL = 0.46;
/** The wind-up toy: metres a second, and seconds it stands being wound at each end. */
const TOY = { speed: 1.5, wind: 3 };
/** The paper plane: seconds a flight lasts, seconds it lies between two, and how high and how far back it goes round. */
const PLANE = { flight: 4.6, rest: 9, high: 5.5, back: -ROWS / 2 - 7.5, wide: COLUMNS / 2 + 7 };
/** Paint left on the mat by each bucket kicked over, and the most there can be. */
const SPLATS = { each: 2, most: 12 };
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => clamp01(t) ** 2 * (3 - 2 * clamp01(t));

class BucketView {
  readonly group = new Group();
  private readonly onLand: () => void;
  private landedAt = -1;

  /** `shape` is the model's bucket, standing on its own origin. `onLand` hears it come down. */
  constructor(shape: Object3D, onLand: () => void) {
    this.onLand = onLand;
    this.group.add(shape);
  }

  /** Falls for as long as its timer runs, lands with a squash, then sits on the paper, rocking a little. */
  update(bucket: { x: number; z: number; left: number }, time: number): void {
    const falling = bucket.left > 0;
    if (!falling && this.landedAt < 0) {
      this.landedAt = time;
      this.onLand();
    }
    const height = (bucket.left / tuning.paint.bucketDrop) * 11;
    this.group.position.set(bucket.x, height, bucket.z);
    this.group.rotation.z = falling ? 0 : Math.sin(time * 5) * 0.12;
    const age = time - this.landedAt;
    const squash = falling ? -0.1 : 0.3 * Math.exp(-age * 9) * Math.cos(age * 20);
    this.group.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
  }

  /** The shape and its colours belong to the model. */
  dispose(): void {
    this.group.removeFromParent();
  }
}

/** One of the pots at the back, full of one player's colour. It pops in when the map appears, and jumps when that player kicks a bucket over. */
class PotView {
  readonly group = new Group();
  private readonly rest: number;
  private readonly delay: number;
  private age = 0;
  /** 0 to 1 while it is in the air, and the seconds since it last came down. */
  private air = 1;
  private landed = 10;

  constructor(shape: Object3D, x: number, y: number, z: number, turn: number, delay: number) {
    this.rest = y;
    this.delay = delay;
    this.group.add(shape);
    this.group.position.set(x, y, z);
    this.group.rotation.y = turn;
    this.group.scale.setScalar(0.001);
  }

  /** Where paint flies from when it jumps: the middle of its brim. */
  get brim(): { x: number; y: number; z: number } {
    return { x: this.group.position.x, y: this.group.position.y + 1.1, z: this.group.position.z };
  }

  hop(): void {
    this.air = 0;
  }

  update(dt: number): void {
    this.age += dt;
    const shown = clamp01((this.age - this.delay) / ARRIVE.seconds);
    if (this.air < 1) {
      this.air = Math.min(1, this.air + dt / JUMP.seconds);
      if (this.air >= 1) this.landed = 0;
    } else {
      this.landed += dt;
    }
    // Up and down once, stretched while it is in the air. When it comes down it flattens and springs back.
    const arc = Math.sin(this.air * Math.PI);
    const stretch = this.air < 1 ? arc * 0.2 : -JUMP.squash * Math.exp(-this.landed * 9) * Math.cos(this.landed * 20);
    const size = Math.max(0.001, backOut(shown));
    this.group.position.y = this.rest + arc * JUMP.height;
    this.group.scale.set(size * (1 - stretch * 0.5), size * (1 + stretch), size * (1 - stretch * 0.5));
  }
}

/** A splash of paint lying on the mat: it pops in where it lands. */
type Splat = { shape: Object3D; size: number; age: number };

export class PaintMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'morning';
  readonly light = { hemisphere: 1.15, sun: 1.5 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.paper, palette.paperDark]);
  private readonly owners = new Uint8Array(COLUMNS * ROWS);
  private readonly buckets = new Map<number, BucketView>();
  private readonly model = new Model('paint');
  private readonly pots: PotView[];
  private readonly crowd: Crowd;
  /** Seconds since the map appeared: what the map's own pieces pop in by. */
  private age = 0;

  private readonly lamp: Object3D | undefined;
  private readonly lampAim = new Vector3();
  private readonly bird: Object3D | undefined;
  private readonly ripples: { ring: Object3D; spread: number }[] = [];
  private readonly water = new Vector3();
  private drink = 0;
  private drinks = 0;
  private readonly brush: Object3D | undefined;
  private rattle = 0;
  private readonly pencil: Object3D | undefined;
  private readonly pencilRest = new Vector3();
  private readonly pencilAxis = new Vector3(1, 0, 0);
  private rolled = 0;
  private rollTo = 0;
  private readonly tube: Object3D | undefined;
  private readonly nozzle = new Vector3();
  private squeeze = 0;
  private readonly splatSpots: Vector3[] = [];
  private readonly splats: Splat[] = [];
  private readonly toy: Object3D;
  private readonly toyKey: Object3D | undefined;
  private readonly toyEnds: [Vector3, Vector3] = [new Vector3(), new Vector3()];
  private toyAt = 0;
  private toyWay = 1;
  private toyWait = 0;
  private toyHop = 0;
  private readonly plane: Object3D;
  private readonly pads: [Vector3, Vector3] = [new Vector3(), new Vector3()];
  private planeAt = 0;
  private planeFlying = -1;
  private planeRest = 4;
  private drips = 0;

  constructor(kit: StageKit) {
    this.kit = kit;
    this.group.add(this.tiles.mesh, this.model.scene);
    this.tiles.reset(true);
    const { model } = this;
    const at = (name: string, into: Vector3) => into.copy(model.node(name)?.position ?? into);

    // A pot for every player colour: the model's pot, with its paint coloured here.
    this.pots = seats.map((seat, index) => {
      const shape = model.part('pot');
      model.own(shape, 'potPaint')?.color.set(seat.color);
      const pot = new PotView(shape, POTS.x[index % POTS.x.length]!, POTS.floor, POTS.z + (index % 2) * POTS.stagger, ((index * 2.3) % 0.9) - 0.45, ARRIVE.after + index * ARRIVE.each);
      this.group.add(pot.group);
      return pot;
    });

    this.lamp = model.node('lamp_head');
    at('mark_lamp_aim', this.lampAim);
    this.bird = model.node('bird');
    at('mark_water', this.water);
    for (let index = 0; ; index++) {
      const ring = model.node(`ripple_${index}`);
      if (!ring) break;
      ring.scale.setScalar(0.001);
      this.ripples.push({ ring, spread: 1 });
    }
    this.brush = model.node('brush');
    this.pencil = model.node('pencil');
    if (this.pencil) {
      this.pencilRest.copy(this.pencil.position);
      this.pencilAxis.copy(model.node('mark_pencil_tip')?.position ?? this.pencilRest.clone().setX(this.pencilRest.x + 1)).sub(this.pencilRest).normalize();
    }
    this.tube = model.node('tube');
    at('mark_tube', this.nozzle);
    for (let index = 0; ; index++) {
      const spot = model.node(`splat_${index}`)?.position;
      if (!spot) break;
      this.splatSpots.push(spot.clone());
    }

    this.toy = model.part('toy');
    this.toyKey = this.toy.getObjectByName('toy_key');
    at('mark_toy_a', this.toyEnds[0]);
    at('mark_toy_b', this.toyEnds[1]);
    this.toy.scale.setScalar(0.001);
    this.plane = model.part('plane');
    // Heading first, then nose up or down, then banked: so a turn in the air looks like one.
    this.plane.rotation.order = 'YZX';
    at('mark_plane_a', this.pads[0]);
    at('mark_plane_b', this.pads[1]);
    this.plane.scale.setScalar(0.001);
    this.group.add(this.toy, this.plane);

    // The guests stand wherever the model left a place for one, and face the paper.
    const spots: Spot[] = [];
    for (let index = 0; ; index++) {
      const stand = model.node(`stand_${index}`)?.position;
      if (!stand) break;
      spots.push({ x: stand.x, y: stand.y, z: stand.z, turn: Math.atan2(-stand.x, -stand.z) });
    }
    this.crowd = new Crowd(spots, { seed: 3 });
    this.group.add(this.crowd.group);
  }

  handle(event: GameEvent): void {
    const { decals, particles, rig } = this.kit;
    if (event.t === 'bucket') decals.warning(event.x, event.z, 0.9, event.delay, new Color(colors.gold));
    if (event.t === 'roundWinner') {
      // The whole desk celebrates: the guests dance, every pot jumps, the brush rattles and the plane goes up.
      this.crowd.cheer(3);
      this.pots.forEach(pot => pot.hop());
      this.rattle = 1.5;
      this.throwPlane();
    }
    if (event.t !== 'splash') return;
    // Paint flies out as far as it reaches, in the colour of whoever kicked the bucket.
    const color = splashColor[event.seat % splashColor.length]!;
    decals.shock(event.x, event.z, event.radius, color, 0.4);
    rig.shake(0.18);
    for (let index = 0; index < 34; index++) {
      const angle = random(0, Math.PI * 2);
      const reach = random(0.4, 1) * event.radius;
      particles.cube({ x: event.x, y: 0.5, z: event.z, vx: Math.sin(angle) * reach * 2.4, vy: random(3, 8), vz: Math.cos(angle) * reach * 2.4, life: random(0.5, 0.9), size: random(0.12, 0.26), gravity: 22, spin: random(-10, 10), bounce: true, color });
    }
    particles.puff({ x: event.x, y: 0.5, z: event.z, life: 0.3, size: 0.6, sizeEnd: 1.4, color: WHITE });
    // The kicker's pot at the back jumps for joy and spills a little.
    const pot = this.pots[event.seat % this.pots.length]!;
    pot.hop();
    for (let index = 0; index < 8; index++) {
      particles.cube({ ...pot.brim, vx: random(-2, 2), vy: random(4, 8), vz: random(-1, 2), life: random(0.4, 0.7), size: random(0.1, 0.2), gravity: 20, spin: random(-10, 10), color });
    }
    // The desk feels it too: the guests clap, the tube squirts, the toy jumps, the plane takes off, and paint lands on the mat to stay.
    this.crowd.clap();
    this.squeeze = 1;
    for (let index = 0; index < 10; index++) {
      particles.cube({ x: this.nozzle.x, y: this.nozzle.y, z: this.nozzle.z, vx: random(-5, -2), vy: random(1, 4), vz: random(-1, 1), life: random(0.3, 0.6), size: random(0.1, 0.18), gravity: 18, spin: 9, color });
    }
    this.toyHop = 1;
    this.rattle = Math.max(this.rattle, 1);
    this.throwPlane();
    for (let index = 0; index < SPLATS.each; index++) this.splat(color);
  }

  frame(round: AnyRound | null, dt: number, time: number): void {
    const field = round?.gameMode === 'paint' ? round : null;
    this.age += dt;
    if (field) {
      // A tile whose owner changed takes the new colour, with a hop.
      for (let index = 0; index < this.owners.length; index++) {
        const owner = field.data[index]!;
        if (owner === this.owners[index]) continue;
        this.owners[index] = owner;
        this.tiles.setColor(index, owner === 0 ? null : painted[(owner - 1) % painted.length]!);
      }
    }
    syncViews(this.group, this.buckets, field?.rules.buckets ?? [], () => new BucketView(this.model.part('bucket'), () => this.landed()), (view, bucket) => view.update(bucket, time));
    for (const pot of this.pots) pot.update(dt);
    this.tiles.update(dt, time);

    // Who is ahead, unless the count is being kept dark: then nobody on the desk knows either.
    let leader: { x: number; z: number } | null = null;
    let most = 0;
    for (const pet of field?.playing ? field.pets : []) {
      const count = field!.rules.metric(field!, pet.seat);
      if (count === 'hidden') {
        leader = null;
        break;
      }
      if (count > most) [most, leader] = [count, pet];
    }
    // The guests watch a bucket on its way down, and otherwise whoever is ahead.
    const falling = field?.rules.buckets.find(bucket => bucket.left > 0);
    this.crowd.watch(falling ? { x: falling.x, z: falling.z } : leader ? { x: leader.x, z: leader.z } : null);
    this.crowd.update(dt);

    const spent = field && field.cap > 0 ? clamp01(field.time / field.cap) : 0;
    this.lampFrame(leader, dt, time);
    this.birdFrame(spent, dt, time);
    this.deskFrame(dt, time);
    this.toyFrame(dt, time);
    this.planeFrame(dt);
    this.splatFrame(dt);
    // Whatever was given motion in Blender.
    this.model.update(dt);
  }

  dispose(): void {
    this.buckets.forEach(view => view.dispose());
    this.crowd.dispose();
    this.tiles.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }

  /** A bucket coming down shakes the desk: the pencil rolls over to its next flat and the brush rattles in its glass. */
  private landed(): void {
    this.rollTo = this.rollTo > 0 ? -ROLL : ROLL;
    this.rattle = Math.max(this.rattle, 1);
    for (let index = 0; index < 4; index++) {
      this.kit.particles.cube({ x: this.water.x + random(-0.5, 0.5), y: this.water.y, z: this.water.z + random(-0.5, 0.5), vx: random(-1.5, 1.5), vy: random(2.5, 4.5), vz: random(-1.5, 1.5), life: random(0.3, 0.5), size: random(0.07, 0.12), gravity: 16, color: WATER });
    }
  }

  /** The lamp's head follows whoever is ahead. With nobody to follow, it looks slowly from side to side. Dust drifts in its light. */
  private lampFrame(leader: { x: number; z: number } | null, dt: number, time: number): void {
    if (!this.lamp) return;
    const head = this.lamp.position;
    const rest = Math.atan2(this.lampAim.x - head.x, this.lampAim.z - head.z);
    const wanted = leader ? Math.atan2(leader.x - head.x, leader.z - head.z) - rest : Math.sin(time * LAMP.sweepPace) * LAMP.sweep;
    const turn = Math.max(-LAMP.reach, Math.min(LAMP.reach, Math.atan2(Math.sin(wanted), Math.cos(wanted))));
    this.lamp.rotation.y += (turn - this.lamp.rotation.y) * (1 - Math.exp(-LAMP.turn * dt));
    if (Math.random() >= LAMP.dust * dt || this.age < 1.5) return;
    // Motes, between the head and where it shines, and never over the paper.
    const along = random(0.15, 0.5);
    const cos = Math.cos(this.lamp.rotation.y);
    const sin = Math.sin(this.lamp.rotation.y);
    const reachX = this.lampAim.x - head.x;
    const reachZ = this.lampAim.z - head.z;
    const x = head.x + (reachX * cos + reachZ * sin) * along + random(-0.5, 0.5);
    if (x > -COLUMNS / 2 - 0.8) return;
    this.kit.particles.cube({ x, y: head.y + (this.lampAim.y - head.y) * along + random(-0.3, 0.3), z: head.z + (-reachX * sin + reachZ * cos) * along + random(-0.5, 0.5), vx: random(-0.1, 0.1), vy: random(-0.25, 0.05), vz: random(-0.1, 0.1), life: random(1.6, 2.6), size: random(0.04, 0.07), spin: 2, color: DUST });
  }

  /** The bird rocks, tips its beak into the glass and comes up again, sooner each time as the round runs out. Each drink leaves a ring on the water. */
  private birdFrame(spent: number, dt: number, time: number): void {
    const { particles } = this.kit;
    const hurry = smooth((spent - BIRD.hurryFrom) / (1 - BIRD.hurryFrom));
    const before = this.drink;
    this.drink = (this.drink + dt / (BIRD.calm + (BIRD.hurried - BIRD.calm) * hurry)) % 1;
    if (this.bird) {
      // Rocking, down, held, and up with a swing back past upright.
      const rock = Math.sin(time * 4.2) * 0.09 * (1 - smooth((this.drink - 0.3) / 0.15));
      const tipped = smooth((this.drink - 0.42) / (BIRD.down - 0.42)) - smooth((this.drink - BIRD.up) / (0.94 - BIRD.up));
      this.bird.rotation.z = -(rock + tipped * BIRD.tip);
    }
    if (before < BIRD.down && this.drink >= BIRD.down && this.age > 1.5) {
      const ripple = this.ripples[this.drinks++ % Math.max(1, this.ripples.length)];
      if (ripple) ripple.spread = 0;
      for (let index = 0; index < 3; index++) {
        particles.cube({ x: this.water.x - 0.5, y: this.water.y, z: this.water.z, vx: random(-1.2, 0.4), vy: random(1.5, 3), vz: random(-1, 1), life: random(0.25, 0.4), size: random(0.06, 0.1), gravity: 14, color: WATER });
      }
    }
    for (const ripple of this.ripples) {
      ripple.spread = Math.min(1, ripple.spread + dt / 1.6);
      // It runs out to the glass and is gone: thin as it goes, so it is not there one moment and missing the next.
      const size = ripple.spread >= 1 ? 0.001 : 0.15 + 0.85 * ripple.spread;
      ripple.ring.scale.set(size, ripple.spread >= 1 ? 0.001 : 1 - ripple.spread * 0.8, size);
    }
  }

  /** What a knock sets going and time brings to rest: the brush in the glass, the pencil on the sketchbook, the tube. And the pots drip. */
  private deskFrame(dt: number, time: number): void {
    this.rattle = Math.max(0, this.rattle - dt * 1.4);
    if (this.brush) this.brush.rotation.set(Math.sin(time * 31) * 0.07 * this.rattle, 0, Math.cos(time * 27) * 0.07 * this.rattle);

    if (this.pencil) {
      this.rolled += (this.rollTo - this.rolled) * (1 - Math.exp(-6 * dt));
      // Across the page, sideways to the way it points, turning as it goes and lifting over each edge of its six.
      const turns = this.rolled / ROLL;
      this.pencil.position.set(this.pencilRest.x - this.pencilAxis.z * this.rolled, this.pencilRest.y + Math.abs(Math.sin(turns * Math.PI)) * 0.07, this.pencilRest.z + this.pencilAxis.x * this.rolled);
      this.pencil.quaternion.setFromAxisAngle(this.pencilAxis, (turns * Math.PI) / 3);
    }

    this.squeeze = Math.max(0, this.squeeze - dt / 0.45);
    if (this.tube) {
      const pressed = Math.sin(this.squeeze * Math.PI);
      this.tube.scale.set(1 - pressed * 0.1, 1 - pressed * 0.3, 1 + pressed * 0.2);
    }

    // A drop falls from one pot or another now and then, in its colour.
    this.drips += dt;
    if (this.drips > 0.7 && this.age > 2) {
      this.drips = random(-0.4, 0);
      const which = Math.floor(Math.random() * this.pots.length);
      const { x, y, z } = this.pots[which]!.brim;
      this.kit.particles.cube({ x: x + 0.13, y: y - 0.55, z: z + 0.9, vy: -0.5, life: 0.4, size: 0.1, gravity: 9, color: splashColor[which % splashColor.length]! });
    }
  }

  /** The wind-up toy walks the back of the desk from one end to the other, is wound, and walks back. */
  private toyFrame(dt: number, time: number): void {
    const [from, to] = this.toyEnds;
    const length = from.distanceTo(to) || 1;
    const walking = this.toyWait <= 0;
    if (walking) {
      this.toyAt += ((TOY.speed * this.toyWay) / length) * dt;
      if (this.toyAt >= 1 || this.toyAt <= 0) {
        this.toyAt = clamp01(this.toyAt);
        this.toyWay = -this.toyWay;
        this.toyWait = TOY.wind;
      }
    } else {
      this.toyWait -= dt;
    }
    this.toyHop = Math.max(0, this.toyHop - dt / 0.4);
    const step = walking ? Math.abs(Math.sin(time * 11)) : 0;
    this.toy.position.set(from.x + (to.x - from.x) * this.toyAt, from.y + step * 0.05 + Math.sin(this.toyHop * Math.PI) * 0.6, from.z + (to.z - from.z) * this.toyAt);
    // It turns round while it is wound, and waddles while it walks.
    const heading = Math.atan2(-(to.z - from.z), to.x - from.x) + (this.toyWay > 0 ? 0 : Math.PI);
    this.toy.rotation.y += Math.atan2(Math.sin(heading - this.toy.rotation.y), Math.cos(heading - this.toy.rotation.y)) * (1 - Math.exp(-4 * dt));
    this.toy.rotation.x = walking ? Math.sin(time * 11) * 0.07 : 0;
    // The key runs down as it walks and is wound back quickly, the other way.
    if (this.toyKey) this.toyKey.rotation.x += (walking ? 5 : -14) * dt;
    this.toy.scale.setScalar(Math.max(0.001, backOut(clamp01((this.age - 0.9) / ARRIVE.seconds))));
  }

  /** Sends the plane off to the other side of the desk, if it is lying still. */
  private throwPlane(): void {
    if (this.planeFlying < 0 && this.age > 2) this.planeFlying = 0;
  }

  /** The paper plane lies at one side of the desk until it is thrown, then goes round the back, high, to land at the other. */
  private planeFrame(dt: number): void {
    const { plane } = this;
    plane.scale.setScalar(Math.max(0.001, backOut(clamp01((this.age - 1.1) / ARRIVE.seconds))));
    const from = this.pads[this.planeAt]!;
    if (this.planeFlying < 0) {
      this.planeRest -= dt;
      if (this.planeRest <= 0) this.throwPlane();
      plane.position.copy(from);
      // Nose toward the paper, waiting.
      plane.rotation.set(0, Math.atan2(from.z, -from.x), 0);
      return;
    }
    this.planeFlying += dt / PLANE.flight;
    const to = this.pads[1 - this.planeAt]!;
    const side = Math.sign(from.x) || 1;
    // Out and up at its own side, across behind everything, and down at the other.
    const path = [from, new Vector3(side * PLANE.wide, PLANE.high * 0.7, from.z * 0.2), new Vector3(side * PLANE.wide * 0.5, PLANE.high, PLANE.back), new Vector3(-side * PLANE.wide * 0.5, PLANE.high, PLANE.back), new Vector3(-side * PLANE.wide, PLANE.high * 0.7, to.z * 0.2), to];
    const where = (share: number, into: Vector3) => {
      const along = clamp01(share) * (path.length - 1);
      const index = Math.min(path.length - 2, Math.floor(along));
      const t = along - index;
      const [a, b, c, d] = [path[Math.max(0, index - 1)]!, path[index]!, path[index + 1]!, path[Math.min(path.length - 1, index + 2)]!];
      // A curve through every point, so the flight has no corners.
      const blend = (p0: number, p1: number, p2: number, p3: number) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
      return into.set(blend(a.x, b.x, c.x, d.x), blend(a.y, b.y, c.y, d.y), blend(a.z, b.z, c.z, d.z));
    };
    const share = smooth(this.planeFlying);
    where(share, plane.position);
    const ahead = where(share + 0.02, new Vector3()).sub(plane.position);
    const before = plane.rotation.y;
    if (ahead.lengthSq() > 1e-6) plane.rotation.set(0, Math.atan2(-ahead.z, ahead.x), Math.atan2(ahead.y, Math.hypot(ahead.x, ahead.z)));
    // It leans into its turns.
    plane.rotation.x = Math.max(-0.6, Math.min(0.6, Math.atan2(Math.sin(plane.rotation.y - before), Math.cos(plane.rotation.y - before)) * 6));
    if (this.planeFlying >= 1) {
      this.planeFlying = -1;
      this.planeAt = 1 - this.planeAt;
      this.planeRest = PLANE.rest + random(0, 4);
      this.kit.dust(to.x, to.z, 3);
    }
  }

  /** Lays a splash of paint on the mat, at the next free place, in that colour a little lightened, the way dried paint is. */
  private splat(color: Color): void {
    if (this.splats.length >= Math.min(SPLATS.most, this.splatSpots.length)) return;
    const spot = this.splatSpots[this.splats.length]!;
    const shape = this.model.part('splat');
    this.model.own(shape, 'potPaint')?.color.copy(color).lerp(WHITE, 0.25);
    shape.position.set(spot.x + random(-0.3, 0.3), spot.y + this.splats.length * 0.002, spot.z + random(-0.3, 0.3));
    shape.rotation.y = random(0, Math.PI * 2);
    shape.scale.setScalar(0.001);
    this.splats.push({ shape, size: random(0.7, 1.15), age: -random(0.15, 0.4) });
    this.group.add(shape);
  }

  private splatFrame(dt: number): void {
    for (const splat of this.splats) {
      if (splat.age >= ARRIVE.seconds) continue;
      splat.age += dt;
      splat.shape.scale.setScalar(Math.max(0.001, backOut(clamp01(splat.age / ARRIVE.seconds)) * splat.size));
    }
  }
}
