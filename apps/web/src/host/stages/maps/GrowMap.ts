// Come e Cresce: a red and white picnic blanket on a wooden table, with food raining on it. The food is
// chunky and bright; the blanket is pale, so the pets and what they are after both stand out on it.
import type { AnyRound, Food, FoodKind, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps, seats } from '../../../shared/tokens';
import { random, syncViews, WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { disposeToys, toy } from './toys';

const COLUMNS = tuning.grow.columns;
const ROWS = tuning.grow.rows;
const palette = maps.grow;
const CURSED = new Color(colors.tierCursed);

/** One piece of food, built from a few plain shapes. Each kind has a shape of its own, not only a colour. */
function makeFood(kind: FoodKind): Group {
  const group = new Group();
  if (kind === 'apple') {
    const stem = toy(new CylinderGeometry(0.03, 0.04, 0.16, 5), palette.stem, 1);
    stem.position.y = 0.34;
    const leaf = toy(new SphereGeometry(0.1, 6, 4), palette.leaf, 1);
    leaf.scale.set(1, 0.35, 0.6);
    leaf.position.set(0.1, 0.38, 0);
    group.add(toy(new SphereGeometry(0.3, 12, 8), palette.apple, 1.09), stem, leaf);
  } else if (kind === 'donut') {
    const dough = toy(new TorusGeometry(0.27, 0.13, 8, 16), palette.dough, 1.07);
    const icing = toy(new TorusGeometry(0.27, 0.115, 8, 16), palette.icing, 1);
    dough.rotation.x = icing.rotation.x = Math.PI / 2;
    icing.position.y = 0.05;
    group.add(dough, icing);
  } else if (kind === 'melon') {
    // A fat slice standing on its rind.
    const rind = toy(new CylinderGeometry(0.52, 0.52, 0.24, 14, 1, false, 0, Math.PI), palette.rind, 1.06);
    const flesh = toy(new CylinderGeometry(0.44, 0.44, 0.26, 14, 1, false, 0, Math.PI), palette.flesh, 1);
    rind.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    flesh.rotation.copy(rind.rotation);
    group.add(rind, flesh);
    group.position.y = 0.1;
  } else {
    // The pepper wears the colours of a curse: it is the one thing here not to eat.
    const body = toy(new ConeGeometry(0.2, 0.62, 8), colors.tierCursed, 1.1);
    body.rotation.z = Math.PI;
    const stem = toy(new CylinderGeometry(0.04, 0.06, 0.16, 5), colors.tierCursedAccent, 1);
    stem.position.y = 0.36;
    group.add(body, stem);
  }
  return group;
}

class FoodView {
  readonly group: Group;
  private readonly spin = random(-2, 2);

  constructor(kind: FoodKind) {
    this.group = makeFood(kind);
  }

  /** Falls for as long as its timer runs, then lies on the blanket, bobbing so it is seen. */
  update(food: Food, time: number): void {
    const height = (food.left / tuning.grow.dropTime) * 7;
    this.group.position.set(food.x, 0.34 + height + (food.left > 0 ? 0 : Math.abs(Math.sin(time * 3 + food.id)) * 0.08), food.z);
    this.group.rotation.y = time * this.spin;
  }

  dispose(): void {
    this.group.removeFromParent();
    disposeToys(this.group);
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
  private readonly scenery = new Group();

  constructor(kit: StageKit) {
    this.kit = kit;
    // Gingham: where a pale stripe crosses a pale stripe, the square is a shade deeper.
    const cross = new Color(palette.clothCross);
    for (let column = 1; column < COLUMNS; column += 2) for (let row = 1; row < ROWS; row += 2) this.tiles.setColor(column * ROWS + row, cross, false);
    this.group.add(this.tiles.mesh, this.scenery);
    this.tiles.reset(true);
    for (let column = 1; column < COLUMNS; column += 2) for (let row = 1; row < ROWS; row += 2) this.tiles.setColor(column * ROWS + row, cross, false);
    this.build();
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
    syncViews(this.group, this.foods, field?.rules.foods ?? [], food => new FoodView(food.kind), (view, food) => view.update(food, time));
    this.tiles.update(dt, time);
  }

  dispose(): void {
    this.foods.forEach(view => view.dispose());
    this.tiles.dispose();
    disposeToys(this.scenery);
    this.group.removeFromParent();
  }

  /** The table the blanket lies on, with a giant plate, a fork and a basket left on it. */
  private build(): void {
    const table = toy(new BoxGeometry(COLUMNS + 18, 1, ROWS + 16), palette.table, 1);
    table.position.y = -1.06;
    table.receiveShadow = true;
    table.castShadow = false;
    this.scenery.add(table);

    const plate = new Group();
    plate.add(toy(new CylinderGeometry(3.4, 3, 0.3, 28), palette.plate, 1.02));
    const dip = toy(new CylinderGeometry(2.3, 2.3, 0.06, 28), palette.clothPale, 1);
    dip.position.y = 0.16;
    plate.add(dip);
    plate.position.set(-COLUMNS / 2 - 4.6, -0.4, -ROWS / 2 - 1);
    this.scenery.add(plate);

    const fork = new Group();
    const handle = toy(new BoxGeometry(0.5, 0.2, 6), palette.plate);
    const neck = toy(new BoxGeometry(1.5, 0.2, 0.6), palette.plate);
    neck.position.z = -3.2;
    fork.add(handle, neck);
    for (const x of [-0.6, 0, 0.6]) {
      const prong = toy(new BoxGeometry(0.22, 0.2, 2), palette.plate);
      prong.position.set(x, 0, -4.4);
      fork.add(prong);
    }
    fork.position.set(COLUMNS / 2 + 3.6, -0.45, 0.5);
    fork.rotation.y = 0.2;
    this.scenery.add(fork);

    // A few whole fruit beyond the far edge, for the look of plenty.
    for (const [index, kind] of (['apple', 'melon', 'donut', 'apple'] as const).entries()) {
      const food = makeFood(kind);
      food.scale.setScalar(3.2);
      food.position.set(-4 + index * 3.6, 0.4, -ROWS / 2 - 4.2 - (index % 2) * 1.4);
      food.rotation.y = index * 1.1;
      this.scenery.add(food);
    }
  }
}
