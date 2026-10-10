// The brawl's world: a white platform high in the clouds, with its barrels, meteors and Mystery Cube.
// The lobby, the title screen and the podium stand on it too.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, Group, IcosahedronGeometry, Mesh } from 'three';
import { colors } from '../../../shared/tokens';
import { toonMaterial } from '../../render/materials';
import { DANGER, GOLD, HOT, random, SMOKE, syncViews, type MapView, type SkyId, type StageKit } from '../kit';
import { BarrelView, CubeView, MeteorView } from '../Props';
import { TileField } from '../TileField';

const HALF = tuning.arena.size / 2;
const DEBRIS = new Color(colors.floorDark);

export class BrawlMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId;
  readonly light: { hemisphere: number; sun: number };
  readonly bounds = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };

  private readonly kit: StageKit;
  private readonly tiles = new TileField();
  private readonly cloudGeometry = new IcosahedronGeometry(1, 1);
  private readonly cloudMaterial = toonMaterial({ color: colors.cloud });
  private readonly barrels = new Map<number, BarrelView>();
  private readonly meteors = new Map<number, MeteorView>();
  private cube: CubeView | null = null;
  private cubeLanded = false;

  /** `night` is the last round's look. With `ripple` the tiles pop up from below in a wave from the centre. */
  constructor(kit: StageKit, options: { night: boolean; ripple: boolean }) {
    this.kit = kit;
    this.sky = options.night ? 'night' : 'day';
    this.light = options.night ? { hemisphere: 0.95, sun: 1.3 } : { hemisphere: 1.15, sun: 1.55 };
    this.group.add(this.tiles.mesh, this.clouds());
    this.tiles.reset(options.ripple);
  }

  handle(event: GameEvent, round: AnyRound): void {
    const { decals, particles, confetti } = this.kit;
    switch (event.t) {
      case 'barrelArmed': {
        const barrel = round.gameMode === 'brawl' ? round.barrels.find(candidate => candidate.id === event.barrel) : undefined;
        if (barrel) decals.warning(barrel.x, barrel.z, tuning.barrel.blastRadius, Math.max(event.delay, 0.12), DANGER);
        return;
      }
      case 'tileWarn':
        return this.tiles.warn(event.index);
      case 'tileFall': {
        this.tiles.drop(event.index, event.broken);
        const { x, z } = this.tiles.centre(event.index);
        for (let index = 0; index < (event.broken ? 4 : 2); index++) {
          particles.cube({ x: x + random(-0.4, 0.4), y: 0.1, z: z + random(-0.4, 0.4), vx: random(-2, 2), vy: random(1, 5), vz: random(-2, 2), life: random(0.5, 1), size: random(0.1, 0.22), gravity: 22, spin: random(-8, 8), color: DEBRIS });
        }
        return;
      }
      case 'cubeSpawn':
        return decals.warning(event.x, event.z, 0.9, tuning.cube.dropTime, GOLD);
      case 'cubeCollected':
        confetti(event.x, 0.8, event.z, [GOLD, new Color(colors.white)], 18);
        return decals.shock(event.x, event.z, 1.6, GOLD);
      case 'meteorCall':
        return decals.warning(event.x, event.z, event.radius, event.delay, DANGER);
      default:
        return;
    }
  }

  frame(round: AnyRound | null, dt: number, time: number, alpha: number): void {
    const { particles, decals, dust } = this.kit;
    const brawl = round?.gameMode === 'brawl' ? round : null;

    syncViews(this.group, this.barrels, brawl?.barrels ?? [], () => new BarrelView(), (view, barrel) => {
      view.update(barrel, alpha, dt, time);
      const { x, y, z } = view.group.position;
      // A lit fuse spits sparks; a thrown barrel leaves a trail of smoke.
      if (barrel.fuse !== null) particles.spark({ x: x + random(-0.2, 0.2), y: y + 0.6, z: z + random(-0.2, 0.2), vx: random(-2, 2), vy: random(2, 5), vz: random(-2, 2), life: 0.25, size: 0.1, gravity: 12, color: HOT });
      if (barrel.thrown && Math.random() < 0.5) particles.puff({ x, y, z, life: 0.35, size: 0.3, sizeEnd: 0.1, color: SMOKE[0]! });
    });
    syncViews(this.group, this.meteors, brawl?.meteors ?? [], () => new MeteorView(), (view, meteor) => {
      view.update(meteor, time);
      const { x, y, z } = view.group.position;
      particles.spark({ x, y, z, vx: random(-1, 1), vy: random(0, 2), vz: random(-1, 1), life: 0.3, size: 0.3, color: HOT });
    });

    const cube = brawl?.cube ?? null;
    if (cube && !this.cube) {
      this.cube = new CubeView();
      this.group.add(this.cube.group);
    } else if (!cube && this.cube) {
      this.cube.dispose();
      this.cube = null;
    }
    if (cube) this.cube?.update(cube, dt, time);
    if (cube?.landed && !this.cubeLanded) {
      dust(cube.x, cube.z, 8);
      decals.shock(cube.x, cube.z, 1.4, GOLD, 0.35);
    }
    this.cubeLanded = cube?.landed ?? false;

    this.tiles.update(dt, time);
  }

  dispose(): void {
    [...this.barrels.values(), ...this.meteors.values()].forEach(view => view.dispose());
    this.cube?.dispose();
    this.tiles.dispose();
    this.cloudGeometry.dispose();
    this.cloudMaterial.dispose();
    this.group.removeFromParent();
  }

  /** A slow sea of clouds far below, so the platform reads as high up. */
  private clouds(): Group {
    const group = new Group();
    for (let index = 0; index < 16; index++) {
      const cloud = new Mesh(this.cloudGeometry, this.cloudMaterial);
      const angle = (index / 16) * Math.PI * 2;
      const reach = 14 + (index % 4) * 6;
      cloud.position.set(Math.sin(angle) * reach, -13 - (index % 3) * 2, Math.cos(angle) * reach - 4);
      cloud.scale.set(5 + (index % 3) * 2, 2.2, 4 + (index % 2) * 2);
      group.add(cloud);
    }
    return group;
  }
}
