// Pinta o Chão: a sheet of white paper taped to a desk, with giant pencils lying round it. The paper is the
// floor; each tile takes the colour of whoever stepped on it last, a little lightened, so pets still stand out.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, TorusGeometry } from 'three';
import { colors, maps, seats } from '../../../shared/tokens';
import { syncViews, WHITE, random, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { disposeToys, toy } from './toys';

const COLUMNS = tuning.paint.columns;
const ROWS = tuning.paint.rows;
const palette = maps.paint;
/** How much white goes into a painted tile: enough that a pet's ring still shows on its own colour. */
const LIGHTEN = 0.42;
const painted = seats.map(seat => new Color(seat.color).lerp(new Color(colors.white), LIGHTEN));
const splashColor = seats.map(seat => new Color(seat.color));

class BucketView {
  readonly group = new Group();

  constructor() {
    const body = toy(new CylinderGeometry(0.42, 0.34, 0.6, 14), palette.bucket);
    const paint = toy(new CylinderGeometry(0.36, 0.36, 0.08, 14), colors.gold, 1);
    paint.position.y = 0.3;
    const handle = toy(new TorusGeometry(0.4, 0.05, 6, 16, Math.PI), colors.ink, 1);
    handle.position.y = 0.3;
    this.group.add(body, paint, handle);
  }

  /** Falls for as long as its timer runs, then sits on the paper, rocking a little. */
  update(bucket: { x: number; z: number; left: number }, time: number): void {
    const height = (bucket.left / tuning.paint.bucketDrop) * 11;
    this.group.position.set(bucket.x, 0.3 + height, bucket.z);
    this.group.rotation.z = bucket.left > 0 ? 0 : Math.sin(time * 5) * 0.12;
  }

  dispose(): void {
    this.group.removeFromParent();
    disposeToys(this.group);
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
  private readonly scenery = new Group();

  constructor(kit: StageKit) {
    this.kit = kit;
    this.group.add(this.tiles.mesh, this.scenery);
    this.tiles.reset(true);
    this.build();
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
    syncViews(this.group, this.buckets, field?.rules.buckets ?? [], () => new BucketView(), (view, bucket) => view.update(bucket, time));
    this.tiles.update(dt, time);
  }

  dispose(): void {
    this.buckets.forEach(view => view.dispose());
    this.tiles.dispose();
    disposeToys(this.scenery);
    this.group.removeFromParent();
  }

  /** The desk the paper lies on, the tape at its corners and edges, and what an artist left lying about. */
  private build(): void {
    const desk = toy(new BoxGeometry(COLUMNS + 16, 1, ROWS + 14), palette.desk, 1);
    desk.position.y = -1.06;
    desk.receiveShadow = true;
    desk.castShadow = false;
    this.scenery.add(desk);

    // A low rim of tape all the way round: it is also the wall nobody can walk through.
    for (const [x, z, width, depth] of [
      [0, -ROWS / 2 - 0.25, COLUMNS + 1, 0.5],
      [0, ROWS / 2 + 0.25, COLUMNS + 1, 0.5],
      [-COLUMNS / 2 - 0.25, 0, 0.5, ROWS],
      [COLUMNS / 2 + 0.25, 0, 0.5, ROWS],
    ] as const) {
      const strip = toy(new BoxGeometry(width, 0.3, depth), palette.tape, 1.02);
      strip.position.set(x, -0.03, z);
      this.scenery.add(strip);
    }

    const pencil = (x: number, z: number, turn: number, length: number, body: string) => {
      const group = new Group();
      const shaft = toy(new CylinderGeometry(0.42, 0.42, length, 6), body);
      const wood = toy(new ConeGeometry(0.42, 1, 6), palette.wood);
      wood.position.y = length / 2 + 0.5;
      const lead = toy(new ConeGeometry(0.16, 0.38, 6), palette.lead, 1);
      lead.position.y = length / 2 + 0.82;
      const eraser = toy(new CylinderGeometry(0.44, 0.44, 0.6, 12), palette.eraser);
      eraser.position.y = -length / 2 - 0.3;
      group.add(shaft, wood, lead, eraser);
      group.rotation.set(Math.PI / 2, 0, turn);
      group.position.set(x, -0.1, z);
      this.scenery.add(group);
    };
    pencil(-COLUMNS / 2 - 3.2, -1.5, 0.25, 8, palette.pencil);
    pencil(COLUMNS / 2 + 3.4, 1, -0.4, 7, seats[1].color);
    pencil(1.5, -ROWS / 2 - 3, Math.PI / 2 + 0.15, 9, seats[0].color);

    // Pots of paint along the back, one for every player colour.
    seats.forEach((seat, index) => {
      const pot = new Group();
      const jar = toy(new CylinderGeometry(0.7, 0.6, 1, 14), palette.bucket);
      const paint = toy(new CylinderGeometry(0.62, 0.62, 0.1, 14), seat.color, 1);
      paint.position.y = 0.5;
      pot.add(jar, paint);
      pot.position.set(-COLUMNS / 2 + 1.2 + index * 2.3, -0.06, -ROWS / 2 - 5.6 + (index % 2) * 0.8);
      this.scenery.add(pot);
    });
  }
}
