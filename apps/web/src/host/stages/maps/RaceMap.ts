// Corrida Maluca: a track of pale toy blocks winding high over the morning clouds, from a green arch to a
// chequered one, with a flag at every place a fallen pet comes back to and bright bars that sweep across the way.
// Everything but the tiles is modelled in Blender (tools/blender/maps/race.py).
import type { AnyField, AnyRound, GameEvent } from '@boom/game';
import { pointAt, TILE, TRACK, tuning } from '@boom/game';
import { Color, Group, Mesh, type Object3D } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps, seats } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';

const COLUMNS = tuning.race.columns;
const ROWS = tuning.race.rows;
const palette = maps.race;
/** Metres of track ahead of each pet that the camera keeps in the picture. */
const LOOK_AHEAD = 5;
/** How far past each end of the track its arch stands: clear of the floor, so it never comes between a pet and the camera. */
const ARCH_OFF = 1.5;
/** The bar as it is modelled: the game's reach and thickness are scaled from these. */
const BAR = { length: 3.4, thick: 0.36 };
/** A flag: how far from the middle of the track its pole stands (just off the edge), where the cloth hangs, and where it folds. */
const FLAG = { off: 1.75, height: 1.86, fold: 0.6 };
/** The three layers of cloud and how fast each drifts, in metres a second: the nearest fastest, so the depth can be felt. */
const CLOUDS = [
  { name: 'clouds_near', speed: 0.55 },
  { name: 'clouds_mid', speed: 0.3 },
  { name: 'clouds_far', speed: 0.14 },
];
/** A cloud that drifts this far to one side comes round again on the other, well out of the picture. */
const WRAP = 34;
/** The blimp comes round sooner, so it is seen more than once a round. That is near enough to be seen, so it shrinks away over its last metres and swells back in. */
const BLIMP = { speed: 0.75, wrap: 23, fade: 4 };

type FlagView = { near: Object3D; far: Object3D; phase: number };
type Drifter = { node: Object3D; speed: number; wrap: number; fade: number };

export class RaceMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'morning';
  readonly light = { hemisphere: 1.15, sun: 1.5 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.track, palette.trackDark]);
  private readonly model = new Model('race');
  private readonly scenery = new Group();
  private readonly bars: Object3D[] = [];
  private readonly flags: FlagView[] = [];
  private readonly arches: Object3D[] = [];
  private readonly drifting: Drifter[] = [];

  constructor(kit: StageKit, field: Extract<AnyField, { gameMode: 'race' }>) {
    this.kit = kit;
    this.group.add(this.tiles.mesh, this.model.scene, this.scenery);
    this.tiles.reset(true);
    // The grid is a rectangle; the track is the part of it that is there.
    field.tiles.forEach((state, index) => {
      if (state === TILE.gone) this.tiles.hide(index);
    });
    // What lies under the track would catch its shadow, and the shadow's map ends a few metres out: it would stop in mid-air.
    this.model.scene.traverse(node => {
      if (node instanceof Mesh) node.receiveShadow = false;
    });
    for (const layer of CLOUDS) {
      for (const cloud of this.model.node(layer.name)?.children ?? []) this.drifting.push({ node: cloud, speed: layer.speed, wrap: WRAP, fade: 0 });
    }
    const blimp = this.model.node('blimp');
    if (blimp) this.drifting.push({ node: blimp, ...BLIMP });
    this.build(field);
  }

  handle(event: GameEvent, round: AnyRound): void {
    const { confetti, words, rig, stars } = this.kit;
    if (event.t === 'finish') {
      const pet = round.petById(event.pet);
      if (!pet) return;
      const color = seats[event.seat % seats.length]!.color;
      confetti(pet.x, 1.5, pet.z, [new Color(color), new Color(colors.gold), WHITE], event.place === 1 ? 60 : 24);
      if (event.place === 1) {
        words.pop(strings.words3d.finish, pet.x - 2, 3.2, pet.z - 0.5, { size: 1.2, color, seconds: 1.4 });
        rig.shake(0.3);
      }
    } else if (event.t === 'swept') {
      const pet = round.petById(event.pet);
      if (pet) stars(pet.x, 0.9, pet.z, 10);
      rig.shake(0.12);
    }
  }

  /** A racer needs to see what is coming: the camera also keeps the next few metres of track ahead of every pet in view. */
  focus(round: AnyRound, points: { x: number; z: number }[]): void {
    if (round.gameMode !== 'race') return;
    for (const pet of round.pets) {
      const ahead = pointAt((round.rules.best.get(pet.seat) ?? 0) + LOOK_AHEAD);
      points.push({ x: ahead.x, z: ahead.z });
    }
  }

  frame(round: AnyRound | null, dt: number, time: number): void {
    const field = round?.gameMode === 'race' ? round : null;
    if (field) {
      // Tiles that blink shake, fall and come back as the game says.
      this.tiles.sync(field.tiles);
      field.rules.sweepers.forEach((sweeper, index) => {
        const bar = this.bars[index];
        if (bar) bar.rotation.y = sweeper.angle;
      });
    }
    this.tiles.update(dt, time);
    this.model.update(dt);

    // The sky moves: clouds slide by under the track, each layer at its own pace, and the blimp crosses beneath it.
    for (const { node, speed, wrap, fade } of this.drifting) {
      node.position.x += speed * dt;
      if (node.position.x > wrap) node.position.x -= wrap * 2;
      if (fade > 0) node.scale.setScalar(Math.max(0.001, Math.min(1, (wrap - Math.abs(node.position.x)) / fade)));
    }
    // Each flag waves in two halves, the far one a beat behind the near one, like cloth.
    for (const flag of this.flags) {
      flag.near.rotation.y = Math.sin(time * 5 + flag.phase) * 0.3;
      flag.far.rotation.y = Math.sin(time * 5 + flag.phase - 1.2) * 0.55;
    }
    // The arches are blown up, not built: they wobble on their stilts.
    this.arches.forEach((arch, index) => {
      arch.rotation.z = Math.sin(time * 1.7 + index * 2) * 0.03;
      arch.scale.y = 1 + Math.sin(time * 2.3 + index) * 0.015;
    });
  }

  dispose(): void {
    this.tiles.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }

  private build(field: Extract<AnyField, { gameMode: 'race' }>): void {
    // The last stretch before the line is a chequered flag laid on the floor.
    const ink = new Color(colors.ink);
    const white = new Color(colors.white);
    field.tiles.forEach((state, index) => {
      const { x, z } = this.tiles.centre(index);
      if (state !== TILE.gone && z < -4 && x > COLUMNS / 2 - 2) this.tiles.setColor(index, (Math.floor(x) + Math.floor(z)) % 2 === 0 ? ink : white, false);
    });

    // An arch past each end of the track, across it: off the floor, where it hides nobody.
    const arch = (name: string, at: number, side: number) => {
      const spot = pointAt(at);
      const whole = new Group();
      const tube = this.model.part(name);
      whole.add(this.model.part('arch_feet'), tube);
      whole.position.set(spot.x + spot.dx * ARCH_OFF * side, 0, spot.z + spot.dz * ARCH_OFF * side);
      whole.rotation.y = Math.atan2(-spot.dz, spot.dx);
      this.arches.push(tube);
      this.scenery.add(whole);
    };
    arch('arch_start', 0, -1);
    arch('arch_finish', TRACK, 1);

    // A flag wherever a fallen pet comes back: just off the track, on the side away from the camera (or the
    // outer side of a turn), so its cloth never hangs over a pet. The cloth points the way to run.
    field.rules.flags.slice(1).forEach((along, index) => {
      const spot = pointAt(along);
      const flag = new Group();
      const cloth = new Group();
      const near = this.model.part('flag_cloth_a');
      const far = this.model.part('flag_cloth_b');
      far.position.x = FLAG.fold;
      near.add(far);
      cloth.add(near);
      cloth.position.y = FLAG.height;
      cloth.rotation.y = Math.atan2(-spot.dz, spot.dx);
      flag.add(this.model.part('flag_post'), cloth);
      const alongX = Math.abs(spot.dx) > Math.abs(spot.dz);
      flag.position.set(spot.x + (alongX ? 0 : Math.sign(spot.x) * FLAG.off), 0, spot.z - (alongX ? FLAG.off : 0));
      this.flags.push({ near, far, phase: index * 1.9 });
      this.scenery.add(flag);
    });

    // The sweeping bars: a post in the middle of the track and the bar that turns on it, as long and as thick as the game says.
    for (const sweeper of field.rules.sweepers) {
      const post = this.model.part('sweeper_foot');
      post.position.set(sweeper.x, 0, sweeper.z);
      const bar = this.model.part('sweeper_bar');
      bar.scale.set((tuning.race.sweepThick * 0.9) / BAR.thick, 1, (tuning.race.sweepReach * 2) / BAR.length);
      bar.position.set(sweeper.x, 0, sweeper.z);
      this.bars.push(bar);
      this.scenery.add(post, bar);
    }
  }
}
