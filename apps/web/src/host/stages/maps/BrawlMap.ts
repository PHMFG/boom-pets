// The brawl's world: a white platform high in the clouds, with its barrels, meteors and Mystery Cube.
// The lobby, the title screen and the podium stand on it too. What floats round it (islands, balloons, the
// clouds, the lanterns of the last round) is modelled in Blender (tools/blender/maps/brawl.py).
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, Group, Mesh, MeshToonMaterial, type Object3D } from 'three';
import { colors, maps } from '../../../shared/tokens';
import { Model, modelsLoaded } from '../../render/models';
import { DANGER, GOLD, HOT, random, SMOKE, syncViews, type MapView, type SkyId, type StageKit } from '../kit';
import { BarrelView, CubeView, MeteorView } from '../Props';
import { TileField } from '../TileField';

const HALF = tuning.arena.size / 2;
const DEBRIS = new Color(colors.floorDark);
const palette = maps.brawl;
const DUSK = new Color(palette.dusk);

const CLOUD_SHAPES = ['cloud_a', 'cloud_b', 'cloud_c'] as const;
/** Clouds leave at one end of this stretch and come back at the other, small at both ends so none is seen to jump. */
const SPAN = 54;
/**
 * The sea of clouds: layers at several depths, each drifting at its own pace, so the platform reads as high up
 * and the sky as moving. `spots` are where a layer's clouds start, as x, z and which of the three shapes.
 * The nearest layer keeps to rows in front of the platform and behind it: a cloud close under a hole in the
 * floor would look like somewhere to land.
 */
const SEA: readonly { y: number; size: number; speed: number; deep: boolean; spots: readonly (readonly [number, number, number])[] }[] = [
  {
    y: -23,
    size: 2.7,
    speed: 0.22,
    deep: true,
    spots: [[-40, -44, 0], [4, -46, 1], [-22, -27, 1], [24, -29, 0], [-48, -11, 0], [-6, -12, 0], [40, -10, 1], [-30, 6, 1], [14, 7, 0], [-50, 23, 1], [-10, 24, 0], [34, 23, 1]],
  },
  { y: -13.5, size: 1.6, speed: 0.38, deep: false, spots: [[-36, -26, 1], [8, -24, 0], [40, -15, 2], [-22, -4, 0], [28, 2, 1], [-44, 10, 2], [-4, 17, 1], [48, 16, 0]] },
  { y: -5, size: 0.95, speed: 0.6, deep: false, spots: [[-30, -13.5, 2], [14, -14.5, 1], [44, -20, 2], [-8, 13.5, 2], [34, 15, 2]] },
];
/**
 * The last round's paper lanterns: where each climbs (x, z), how high it gets before it goes, and its size.
 * In front of the platform they stop well below it, so none is ever between the camera and the floor.
 */
const LANTERNS: readonly (readonly [number, number, number, number])[] = [
  [-12, -13, 1, 1.2], [-3, -16.5, 2, 1], [6, -14, 1, 1.4], [14, -12.5, 2, 1.1], [1, -24, 4, 1.6], [-19, -19, 3, 1.4], [20, -20, 3, 1.2],
  [-14.5, -1, -2, 1.1], [15, 2, -2, 1.1], [-22, -8, 1, 1.5], [23, -7, 1, 1.4], [-13, 14, -5, 1.2], [12, 15, -5, 1.1],
];
/** Lanterns start this far down, inside the clouds, and take this many seconds to climb. */
const LANTERN = { from: -16, seconds: 34 };
/** The balloons wander: how far each strays from where it was built, along x and along z, and how slowly it goes round. */
const BALLOONS = [['balloon_warm', 1.6, 2, 0.11], ['balloon_cool', 0.7, 5, 0.08], ['balloon_sun', 4, 2, 0.06]] as const;
/**
 * Gulls circle the platform: how wide, how high, how fast (radians a second) and where on the circle each starts.
 * Every circle is wider than the platform's corners and below its floor, so a gull is never between a player and a pet.
 */
const GULLS = [[15, -2.6, 0.17, 0], [17.5, -4, 0.14, 2.1], [18.6, -3.3, 0.14, 2.45]] as const;
/** Wingbeats a second. */
const FLAP = 2.2;

export class BrawlMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId;
  readonly light: { hemisphere: number; sun: number };
  readonly bounds = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };

  private readonly kit: StageKit;
  private readonly tiles = new TileField();
  /** Null on the map put up while the game is still loading: that one is never drawn. */
  private readonly model: Model | null = modelsLoaded() ? new Model('brawl') : null;
  private readonly clouds: { view: Object3D; x: number; y: number; z: number; size: number; speed: number; phase: number }[] = [];
  private readonly lanterns: { view: Object3D; x: number; z: number; top: number; size: number; phase: number }[] = [];
  private readonly balloons: { carrier: Group; x: number; z: number; pace: number }[] = [];
  private readonly gulls: { view: Object3D; wings: Object3D[]; radius: number; y: number; pace: number; start: number }[] = [];
  private readonly barrels = new Map<number, BarrelView>();
  private readonly meteors = new Map<number, MeteorView>();
  private cube: CubeView | null = null;
  private cubeLanded = false;

  /** `night` is the last round's look. With `ripple` the tiles pop up from below in a wave from the centre. */
  constructor(kit: StageKit, options: { night: boolean; ripple: boolean }) {
    this.kit = kit;
    this.sky = options.night ? 'night' : 'day';
    this.light = options.night ? { hemisphere: 0.95, sun: 1.3 } : { hemisphere: 1.15, sun: 1.55 };
    this.group.add(this.tiles.mesh);
    if (this.model) this.dress(this.model, options.night);
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
    this.drift(time);
    this.model?.update(dt);
  }

  dispose(): void {
    [...this.barrels.values(), ...this.meteors.values()].forEach(view => view.dispose());
    this.cube?.dispose();
    this.tiles.dispose();
    this.model?.dispose();
    this.group.removeFromParent();
  }

  /** Puts the modelled sky round the platform: the islands and balloons where they were built, the sea of clouds in its layers, and by night the lanterns. */
  private dress(model: Model, night: boolean): void {
    this.group.add(model.scene);
    // Lit windows are for the night.
    model.scene.traverse(node => {
      if (node.name.startsWith('night_')) node.visible = night;
    });

    // A balloon bobs as it was built to; what carries it here takes it for a slow walk round its spot.
    for (const [name, x, z, pace] of BALLOONS) {
      const balloon = model.node(name);
      if (!balloon) continue;
      const carrier = new Group();
      carrier.add(balloon);
      this.balloons.push({ carrier, x, z, pace });
      this.group.add(carrier);
    }
    for (const [radius, y, pace, start] of GULLS) {
      const view = model.part('gull');
      this.gulls.push({ view, wings: ['gull_wing_l', 'gull_wing_r'].map(name => view.getObjectByName(name)!), radius, y, pace, start });
      this.group.add(view);
    }
    // By night the islands, the balloons and the gulls sink into the dusk, so the floor stays the brightest thing. What glows keeps its colour.
    if (night) {
      const dimmed = new Set<MeshToonMaterial>();
      for (const root of [model.scene, ...this.balloons.map(balloon => balloon.carrier), ...this.gulls.map(gull => gull.view)]) {
        root.traverse(node => {
          if (!(node instanceof Mesh) || !(node.material instanceof MeshToonMaterial) || dimmed.has(node.material)) return;
          dimmed.add(node.material);
          node.material.color.lerp(DUSK, 0.42);
        });
      }
    }

    for (const layer of SEA) {
      const views = layer.spots.map(([x, z, shape], index) => {
        const view = model.part(CLOUD_SHAPES[shape]!);
        // Every other one is turned round, so three shapes do not read as three shapes.
        view.rotation.y = index % 2 === 0 ? 0 : Math.PI;
        this.clouds.push({ view, x, y: layer.y, z, size: layer.size * (0.85 + ((index * 7) % 5) * 0.075), speed: layer.speed, phase: index * 1.7 + layer.y });
        this.group.add(view);
        return view;
      });
      // One colour for each layer and time of day: deeper is darker, and night darker still, so the white floor stays the brightest thing.
      const color = night ? (layer.deep ? palette.cloudDeepNight : palette.cloudNight) : layer.deep ? palette.cloudDeep : null;
      const paint = color ? model.own(views[0]!, 'cloud') : null;
      if (!paint || !color) continue;
      paint.color.set(color);
      for (const view of views) {
        view.traverse(node => {
          if (node instanceof Mesh && node.userData.color === 'cloud') node.material = paint;
        });
      }
    }

    if (!night) return;
    LANTERNS.forEach(([x, z, top, size], index) => {
      const view = model.part('lantern');
      this.lanterns.push({ view, x, z, top, size, phase: (index * 0.618) % 1 });
      this.group.add(view);
    });
  }

  /** Moves what the wind moves: the clouds along their layers, the lanterns up through them. */
  private drift(time: number): void {
    for (const cloud of this.clouds) {
      const along = ((((cloud.x + time * cloud.speed + SPAN) % (SPAN * 2)) + SPAN * 2) % (SPAN * 2)) - SPAN;
      const size = cloud.size * Math.min(1, (SPAN - Math.abs(along)) / 9);
      cloud.view.position.set(along, cloud.y + Math.sin(time * 0.3 + cloud.phase) * 0.35, cloud.z);
      cloud.view.scale.setScalar(Math.max(0.001, size));
    }
    this.balloons.forEach(({ carrier, x, z, pace }, index) => {
      carrier.position.set(Math.sin(time * pace + index * 2) * x, 0, Math.cos(time * pace * 0.8 + index) * z);
    });
    this.gulls.forEach(({ view, wings, radius, y, pace, start }, index) => {
      const angle = start + time * pace;
      view.position.set(Math.sin(angle) * radius, y + Math.sin(time * 0.6 + index * 2) * 0.5, Math.cos(angle) * radius);
      // Nose along the circle, leaning into the turn; a few beats, then a glide.
      view.rotation.set(0, angle - Math.PI / 2, -0.3, 'YXZ');
      const beat = Math.sin(time * Math.PI * 2 * FLAP + index) * (0.25 + 0.35 * Math.max(0, Math.sin(time * 0.9 + index * 1.7)));
      wings[0]!.rotation.z = -beat;
      wings[1]!.rotation.z = beat;
    });
    for (const lantern of this.lanterns) {
      // Each climbs, swaying, grows out of the clouds at the bottom and shrinks to nothing at the top.
      const climb = (time / LANTERN.seconds + lantern.phase) % 1;
      const size = lantern.size * Math.min(1, climb / 0.1, (1 - climb) / 0.03);
      const sway = lantern.phase * 40;
      lantern.view.position.set(lantern.x + Math.sin(time * 0.5 + sway) * 0.7, LANTERN.from + (lantern.top - LANTERN.from) * climb, lantern.z + Math.cos(time * 0.4 + sway) * 0.7);
      lantern.view.rotation.z = Math.sin(time * 0.9 + sway) * 0.14;
      lantern.view.scale.setScalar(Math.max(0.001, size));
    }
  }
}
