// Corrida Maluca: a track of pale toy blocks winding over the morning clouds, from a green arch to a gold
// one, with a flag at every place a fallen pet comes back to and bright bars that sweep across the way.
import type { AnyField, AnyRound, GameEvent } from '@boom/game';
import { pointAt, TILE, TRACK, tuning } from '@boom/game';
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps, seats } from '../../../shared/tokens';
import { WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { disposeToys, makeClouds, toy } from './toys';

const COLUMNS = tuning.race.columns;
const ROWS = tuning.race.rows;
const palette = maps.race;
/** Metres of track ahead of each pet that the camera keeps in the picture. */
const LOOK_AHEAD = 5;

export class RaceMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'morning';
  readonly light = { hemisphere: 1.15, sun: 1.5 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.track, palette.trackDark]);
  private readonly scenery = new Group();
  private readonly bars: Group[] = [];

  constructor(kit: StageKit, field: Extract<AnyField, { gameMode: 'race' }>) {
    this.kit = kit;
    this.group.add(this.tiles.mesh, this.scenery);
    this.tiles.reset(true);
    // The grid is a rectangle; the track is the part of it that is there.
    field.tiles.forEach((state, index) => {
      if (state === TILE.gone) this.tiles.hide(index);
    });
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
  }

  dispose(): void {
    this.tiles.dispose();
    disposeToys(this.scenery);
    this.group.removeFromParent();
  }

  private build(field: Extract<AnyField, { gameMode: 'race' }>): void {
    this.scenery.add(makeClouds());

    // The last stretch before the line is a chequered flag laid on the floor.
    const ink = new Color(colors.ink);
    const white = new Color(colors.white);
    field.tiles.forEach((state, index) => {
      const { x, z } = this.tiles.centre(index);
      if (state !== TILE.gone && z < -4 && x > COLUMNS / 2 - 2) this.tiles.setColor(index, (Math.floor(x) + Math.floor(z)) % 2 === 0 ? ink : white, false);
    });

    const arch = (at: number, color: string) => {
      const spot = pointAt(at);
      const group = new Group();
      for (const side of [-1, 1]) {
        const post = toy(new CylinderGeometry(0.22, 0.22, 3.4, 10), palette.post);
        post.position.set(0, 1.7, side * 1.75);
        group.add(post);
      }
      const beam = toy(new BoxGeometry(0.5, 0.7, 4.2), color, 1.04);
      beam.position.y = 3.5;
      group.add(beam);
      group.position.set(spot.x, 0, spot.z);
      this.scenery.add(group);
    };
    arch(1.6, palette.start);
    arch(TRACK - 0.6, palette.flag);

    // A flag wherever a fallen pet comes back, standing just off the track on its outer side.
    for (const along of field.rules.flags.slice(1)) {
      const spot = pointAt(along);
      const flag = new Group();
      const pole = toy(new CylinderGeometry(0.07, 0.07, 2.2, 6), palette.post, 1.2);
      pole.position.y = 1.1;
      const cloth = toy(new ConeGeometry(0.45, 0.9, 3), palette.flag, 1.08);
      cloth.rotation.z = -Math.PI / 2;
      cloth.scale.z = 0.25;
      cloth.position.set(0.48, 1.8, 0);
      flag.add(pole, cloth);
      flag.position.set(spot.x - spot.dz * 1.25, 0, spot.z + spot.dx * 1.25);
      this.scenery.add(flag);
    }

    // The sweeping bars: a post in the middle of the track and an arm on either side of it.
    for (const sweeper of field.rules.sweepers) {
      const post = toy(new CylinderGeometry(0.28, 0.34, 0.8, 10), palette.post);
      post.position.set(sweeper.x, 0.4, sweeper.z);
      const bar = new Group();
      const arm = toy(new BoxGeometry(tuning.race.sweepThick * 0.9, 0.34, tuning.race.sweepReach * 2), palette.bar, 1.05);
      arm.position.y = 0.42;
      bar.add(arm);
      bar.position.set(sweeper.x, 0, sweeper.z);
      this.bars.push(bar);
      this.scenery.add(post, bar);
    }
  }
}
