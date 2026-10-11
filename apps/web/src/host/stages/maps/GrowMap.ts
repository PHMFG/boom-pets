// Come e Cresce: a red and white picnic blanket on a wooden table, with food raining on it. The food is
// chunky and bright; the blanket is pale, so the pets and what they are after both stand out on it.
// The table, the picnic laid round the blanket and the four kinds of food are modelled in Blender
// (tools/blender/maps/grow.py).
import type { AnyRound, Food, FoodKind, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, Group, type Object3D } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps, seats } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { random, syncViews, WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';

const COLUMNS = tuning.grow.columns;
const ROWS = tuning.grow.rows;
const palette = maps.grow;
const CURSED = new Color(colors.tierCursed);
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

class FoodView {
  readonly group = new Group();
  private readonly shape: Object3D;
  private readonly show: (typeof SHOW)[FoodKind];
  private readonly spin = random(0.7, 1.8) * (Math.random() < 0.5 ? -1 : 1);
  private landedAt = -1;

  /** `shape` is the model's piece of that kind, standing on its own origin. */
  constructor(kind: FoodKind, shape: Object3D) {
    this.shape = shape;
    this.show = SHOW[kind];
    this.group.add(shape);
    this.group.rotation.x = this.show.lean;
  }

  /** Falls for as long as its timer runs, lands with a squash, then lies on the blanket, bobbing so it is seen. */
  update(food: Food, time: number): void {
    const falling = food.left > 0;
    if (!falling && this.landedAt < 0) this.landedAt = time;
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

export class GrowMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'day';
  readonly light = { hemisphere: 1.15, sun: 1.5 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.cloth, palette.clothPale]);
  private readonly foods = new Map<number, FoodView>();
  private readonly model = new Model('grow');

  constructor(kit: StageKit) {
    this.kit = kit;
    // Gingham: where a pale stripe crosses a pale stripe, the square is a shade deeper.
    const cross = new Color(palette.clothCross);
    for (let column = 1; column < COLUMNS; column += 2) for (let row = 1; row < ROWS; row += 2) this.tiles.setColor(column * ROWS + row, cross, false);
    this.group.add(this.tiles.mesh, this.model.scene);
    this.tiles.reset(true);
    for (let column = 1; column < COLUMNS; column += 2) for (let row = 1; row < ROWS; row += 2) this.tiles.setColor(column * ROWS + row, cross, false);
  }

  handle(event: GameEvent, round: AnyRound): void {
    const { particles, words, rig, stars } = this.kit;
    if (event.t === 'eat') {
      // A bite taken: crumbs in the eater's colour. A pepper goes up in a purple puff instead.
      const color = event.kind === 'pepper' ? CURSED : new Color(seats[event.seat % seats.length]!.color);
      for (let index = 0; index < (event.kind === 'melon' ? 9 : 5); index++) {
        const angle = random(0, Math.PI * 2);
        particles.cube({ x: event.x, y: 0.5, z: event.z, vx: Math.sin(angle) * random(1, 3), vy: random(2, 5), vz: Math.cos(angle) * random(1, 3), life: random(0.3, 0.6), size: random(0.07, 0.14), gravity: 16, spin: 9, color });
      }
      if (event.kind === 'pepper') particles.puff({ x: event.x, y: 0.6, z: event.z, life: 0.4, size: 0.4, sizeEnd: 1, color: CURSED });
      return;
    }
    if (event.t !== 'bite') return;
    const victim = round.petById(event.victim);
    if (!victim) return;
    stars(victim.x, 1, victim.z, 10);
    rig.shake(0.25);
    words.pop(strings.words3d.bite, victim.x, 2.6, victim.z - 0.6, { size: 0.8, color: seats[event.seat % seats.length]!.color, seconds: 0.8 });
    particles.puff({ x: victim.x, y: 0.8, z: victim.z, life: 0.3, size: 0.5, sizeEnd: 1.1, color: WHITE });
  }

  frame(round: AnyRound | null, dt: number, time: number): void {
    const field = round?.gameMode === 'grow' ? round : null;
    syncViews(this.group, this.foods, field?.rules.foods ?? [], food => new FoodView(food.kind, this.model.part(food.kind)), (view, food) => view.update(food, time));
    this.tiles.update(dt, time);
    // The jelly wobbles, the ants march, the teapot steams: whatever was given motion in Blender.
    this.model.update(dt);
  }

  dispose(): void {
    this.foods.forEach(view => view.dispose());
    this.tiles.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }
}
