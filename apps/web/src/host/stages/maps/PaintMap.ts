// Pinta o Chão: a sheet of white paper taped to a cutting mat on an artist's desk, with giant pencils, brushes
// and crayons lying round it. The paper is the floor; each tile takes the colour of whoever stepped on it
// last, a little lightened, so pets still stand out. The desk, what lies on it, the pots and the falling
// bucket are modelled in Blender (tools/blender/maps/paint.py).
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, Group, type Object3D } from 'three';
import { motion } from '../../../shared/motion';
import { colors, maps, seats } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { syncViews, WHITE, random, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';

const COLUMNS = tuning.paint.columns;
const ROWS = tuning.paint.rows;
const palette = maps.paint;
/** How much white goes into a painted tile: enough that a pet's ring still shows on its own colour. */
const LIGHTEN = 0.42;
const painted = seats.map(seat => new Color(seat.color).lerp(new Color(colors.white), LIGHTEN));
const splashColor = seats.map(seat => new Color(seat.color));
/** Where the six pots stand along the back of the mat: three to each side, so the clock hides none of them. */
const POTS = { x: [-6.6, -4.7, -2.8, 2.8, 4.7, 6.6], z: -ROWS / 2 - 2.7, stagger: 0.55, floor: -0.06 };
/** Seconds a pot's jump lasts, how high it goes, and how hard it squashes when it comes down. */
const JUMP = { seconds: 0.55, height: 1.3, squash: 0.25 };
/** The pots pop in one after another once the map is up. */
const ARRIVE = { after: 0.25, each: motion.staggerMs / 500, seconds: motion.popIn.ms / 1000 };
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

class BucketView {
  readonly group = new Group();
  private landedAt = -1;

  /** `shape` is the model's bucket, standing on its own origin. */
  constructor(shape: Object3D) {
    this.group.add(shape);
  }

  /** Falls for as long as its timer runs, lands with a squash, then sits on the paper, rocking a little. */
  update(bucket: { x: number; z: number; left: number }, time: number): void {
    const falling = bucket.left > 0;
    if (!falling && this.landedAt < 0) this.landedAt = time;
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
    const shown = Math.max(0, Math.min(1, (this.age - this.delay) / ARRIVE.seconds));
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

  constructor(kit: StageKit) {
    this.kit = kit;
    this.group.add(this.tiles.mesh, this.model.scene);
    this.tiles.reset(true);
    // A pot for every player colour: the model's pot, with its paint coloured here.
    this.pots = seats.map((seat, index) => {
      const shape = this.model.part('pot');
      this.model.own(shape, 'potPaint')?.color.set(seat.color);
      const pot = new PotView(shape, POTS.x[index % POTS.x.length]!, POTS.floor, POTS.z - (index % 2) * POTS.stagger, ((index * 2.3) % 0.9) - 0.45, ARRIVE.after + index * ARRIVE.each);
      this.group.add(pot.group);
      return pot;
    });
  }

  handle(event: GameEvent): void {
    const { decals, particles, rig } = this.kit;
    if (event.t === 'bucket') decals.warning(event.x, event.z, 0.9, event.delay, new Color(colors.gold));
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
  }

  frame(round: AnyRound | null, dt: number, time: number): void {
    const field = round?.gameMode === 'paint' ? round : null;
    if (field) {
      // A tile whose owner changed takes the new colour, with a hop.
      for (let index = 0; index < this.owners.length; index++) {
        const owner = field.data[index]!;
        if (owner === this.owners[index]) continue;
        this.owners[index] = owner;
        this.tiles.setColor(index, owner === 0 ? null : painted[(owner - 1) % painted.length]!);
      }
    }
    syncViews(this.group, this.buckets, field?.rules.buckets ?? [], () => new BucketView(this.model.part('bucket')), (view, bucket) => view.update(bucket, time));
    for (const pot of this.pots) pot.update(dt);
    this.tiles.update(dt, time);
    // The brush rocking in its glass, the paper plane: whatever was given motion in Blender.
    this.model.update(dt);
  }

  dispose(): void {
    this.buckets.forEach(view => view.dispose());
    this.tiles.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }
}
