// The brawl's world: a white platform high in the clouds, with its barrels, meteors and Mystery Cube.
// The lobby, the title screen and the podium stand on it too. What floats round it and lies below it
// (islands, balloons, the clouds, a land far down, the lanterns of the last round) is modelled in Blender
// (tools/blender/maps/brawl.py) and brought to life here: pets that came to watch, a plane, a kite, birds and
// weather, all of which answer what happens on the platform.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, DynamicDrawUsage, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshToonMaterial, Quaternion, Vector3, type Material, type Object3D } from 'three';
import { colors, maps } from '../../../shared/tokens';
import { Model, modelsLoaded } from '../../render/models';
import { DANGER, GOLD, HOT, random, SMOKE, syncViews, type MapView, type SkyId, type StageKit } from '../kit';
import { BarrelView, CubeView, MeteorView } from '../Props';
import { TileField } from '../TileField';
import { Crowd, type Spot } from './crowd';

const HALF = tuning.arena.size / 2;
const DEBRIS = new Color(colors.floorDark);
const palette = maps.brawl;
const DUSK = new Color(palette.dusk);
/**
 * How far everything round the platform sinks into the dusk on the last round, so the floor stays the brightest
 * thing. What glows keeps its colour. The land far below sinks further, darker than the clouds over it: by
 * night it is a town's lit windows and little else.
 */
const DIM = 0.42;
const DIM_LAND = { piece: 'ground', by: 0.8 };

const CLOUD_SHAPES = ['cloud_a', 'cloud_b', 'cloud_c', 'cloud_bank'] as const;
/**
 * The sea of clouds: layers at several depths, each drifting at its own pace, so the platform reads as high up
 * and the sky as moving. `spots` are where a layer's clouds start, as x, z and which of the shapes; a cloud
 * leaves at one end of the layer's `span` and comes back at the other, small at both ends so none is seen to jump.
 * The nearest layer keeps to rows in front of the platform and behind it: a cloud close under a hole in the
 * floor would look like somewhere to land.
 * The last two layers lie far behind the platform, where a round's camera never looks. They are for the shots
 * from low down between rounds and at the podium, which would otherwise end in empty sky: the sea goes on to
 * a bank at the horizon, in the deeper colour, which is the one nearest the sky's, and low enough to leave a
 * strip of sky over it.
 */
const SEA: readonly { y: number; size: number; speed: number; span: number; deep: boolean; spots: readonly (readonly [number, number, number])[] }[] = [
  {
    y: -23,
    size: 2.7,
    speed: 0.22,
    span: 54,
    deep: true,
    spots: [[-40, -44, 0], [4, -46, 1], [-22, -27, 1], [24, -29, 0], [-48, -11, 0], [-6, -12, 0], [40, -10, 1], [-30, 6, 1], [14, 7, 0], [-50, 23, 1], [-10, 24, 0], [34, 23, 1]],
  },
  { y: -13.5, size: 1.6, speed: 0.38, span: 54, deep: false, spots: [[-36, -26, 1], [8, -24, 0], [40, -15, 2], [-22, -4, 0], [28, 2, 1], [-44, 10, 2], [-4, 17, 1], [48, 16, 0]] },
  { y: -5, size: 0.95, speed: 0.6, span: 54, deep: false, spots: [[-30, -13.5, 2], [14, -14.5, 1], [44, -20, 2], [-8, 13.5, 2], [34, 15, 2]] },
  { y: -27, size: 3.4, speed: 0.16, span: 120, deep: true, spots: [[-100, -66, 3], [-58, -78, 3], [-14, -68, 3], [30, -80, 3], [74, -70, 3], [112, -82, 3]] },
  { y: -42, size: 6.5, speed: 0.1, span: 190, deep: true, spots: [[-160, -128, 3], [-96, -142, 3], [-32, -130, 3], [32, -144, 3], [96, -132, 3], [160, -146, 3]] },
];
/**
 * The last round's paper lanterns: where each climbs (x, z), how high it gets before it goes, and its size.
 * In front of the platform they stop well below it, so none is ever between the camera and the floor.
 */
const LANTERNS: readonly (readonly [number, number, number, number])[] = [
  [-12, -13, 1, 1.2], [-3, -16.5, 2, 1], [6, -14, 1, 1.4], [14, -12.5, 2, 1.1], [1, -24, 4, 1.6], [-19, -19, 3, 1.4], [20, -20, 3, 1.2],
  [-14.5, -1, -2, 1.1], [15, 2, -2, 1.1], [-22, -8, 1, 1.5], [23, -7, 1, 1.4], [-13, 14, -5, 1.2], [12, 15, -5, 1.1],
];
/** Lanterns start this far down, inside the clouds, and take this many seconds to climb. A blast sets them all swinging (radians, on top of their own sway). */
const LANTERN = { from: -16, seconds: 34, sway: 0.14, swing: 0.5 };
/** The balloons wander: how far each strays from where it was built, along x and along z, and how slowly it goes round. */
const BALLOONS = [['balloon_warm', 1.2, 2, 0.11], ['balloon_cool', 0.7, 5, 0.08], ['balloon_sun', 6, 3, 0.06]] as const;
/**
 * A blast rocks the balloons: each swings like a weight on a spring from the middle of its envelope (`hang`
 * metres over its basket, for a balloon of size 1). `push` is how hard a barrel's blast one metre off would
 * set it swinging, in radians a second; it falls away with distance, and nothing nearer than `near` counts as nearer.
 */
const ROCK = { hang: 2.4, stiff: 5, damp: 1.1, push: 8, near: 6 };
/**
 * Gulls circle the platform: how wide, how high, how fast (radians a second) and where on the circle each starts.
 * Every circle is wider than the platform's corners and below its floor, so a gull is never between a player and a pet.
 * A blast scatters them: for a moment each flies wider, higher and faster, beating hard, and then settles back.
 */
const GULLS = [[15, -2.6, 0.17, 0], [17.5, -4, 0.14, 2.1], [18.6, -3.3, 0.14, 2.45]] as const;
const SCARE = { wider: 5, higher: 1.6, faster: 3, settle: 0.5 };
/** Wingbeats a second. */
const FLAP = 2.2;
/**
 * The pets that came to watch: which piece of the model carries them and where on it they stand, in that
 * piece's own measure. A balloon is built bigger than it is modelled, so its passenger is made smaller to match.
 * They are off the floor, far from its front edge, smaller than a player's pet and edged in white: nobody's.
 */
const WATCHERS: readonly { on: string; seed: number; spots: readonly Spot[] }[] = [
  { on: 'mill', seed: 3, spots: [{ x: 1.3, y: 0.2, z: 2.4, scale: 1.2 }, { x: -1, y: 0.2, z: 2.3, scale: 1.2 }] },
  { on: 'home', seed: 5, spots: [{ x: 1.2, y: 0.2, z: 0.7, scale: 1.2 }, { x: 2.2, y: 0.18, z: 0.9, scale: 1.2 }] },
  { on: 'lone', seed: 8, spots: [{ x: 0.9, y: 0.2, z: 1, scale: 1.2 }] },
  { on: 'far', seed: 13, spots: [{ x: 1.3, y: 0.2, z: 1.3, scale: 1.2 }] },
  { on: 'balloon_warm', seed: 21, spots: [{ x: 0, y: -1.25, z: 0, scale: 0.75 }] },
  { on: 'balloon_cool', seed: 34, spots: [{ x: 0, y: -1.25, z: 0, scale: 0.95 }] },
];
/** Seconds something that just happened holds the watchers' eyes before they go back to the fight, and the least between one gasp and the next. */
const GAZE = { blast: 1.2, fall: 1.4, knockout: 1.2, gasp: 1.1 };
/**
 * The windmill's sails: radians a second in a light wind, and how much more in the gust a blast or a round's
 * start sends through. The gust dies away by `calm` of itself a second. There are four sails, so even racing
 * one passes the top of its turn no more than 2.6 times a second, the fastest anything here may pulse.
 */
const SAILS = { on: 'mill_sails', turn: 0.9, race: 3.1, calm: 0.5 };
/**
 * The plane and its banner: an oval round the platform, wide of it and below its floor, so that it crosses
 * the top of a round's picture behind the platform's far edge and is never over the floor. `across` and
 * `deep` are the oval's half-widths, `back` where its middle is, `seconds` one whole round. `length` is one
 * length of banner; each waves a little later than the one before it.
 */
const PLANE = { across: 44, deep: 22, back: -2, height: -10.5, seconds: 75, size: 1.15, length: 2, bank: -0.22, prop: 4 };
/** The kite: flown from the windmill's island. `hand` is where its line is held, in the island's own measure, and `out` where the kite hangs from there. */
const KITE = { on: 'mill', hand: { x: -1, y: 0.95, z: 2.3 }, out: { x: 2.4, y: 5.6, z: -0.6 }, stiff: 6, damp: 1.6 };
/**
 * A skein of far birds: an oval well wide of the platform and lower than the gulls, flown in a V. `gap` is
 * the space between one bird and the next; a blast throws the V open, and it closes again.
 */
const SKEIN = { birds: 6, across: 36, deep: 24, height: -7, seconds: 58, gap: 1.1, size: 1, open: 2.5 };
/**
 * Small weather, made of particles. Wisps of cloud pass beside the platform, below its floor and drifting away
 * from it, so none is ever over a pet or under a hole. Leaves blow from the islands' trees and smoke rises
 * from the cottage's chimney: each is where it starts, in its island's own measure. `rate` is how many a second.
 */
const WISPS = { near: 11.5, far: 16, low: -4, high: -2.2, drift: 0.5, rate: 0.7 };
const LEAVES = { rate: 1.3, from: [{ on: 'mill', x: -2.4, y: 2.1, z: -0.6 }, { on: 'mill', x: 2.7, y: 1.8, z: -1.4 }, { on: 'home', x: 1.9, y: 2.6, z: -0.9 }, { on: 'lone', x: 0.2, y: 2.4, z: -0.1 }] } as const;
const CHIMNEY = { on: 'home', x: 0.35, y: 2.5, z: -0.6, rate: 2.2 };
/** By night: fireflies round the islands, and now and then a shooting star far behind the platform. Seconds between stars, and how long one burns. */
const FIREFLIES = { rate: 5, on: ['mill', 'home', 'lone', 'far'] } as const;
const STAR = { least: 5, most: 11, burns: 0.75 };
const UPRIGHT = new Quaternion();
const UP = new Vector3(0, 1, 0);

/** The one mesh of a template that is a single piece. */
function meshOf(template: Object3D): Mesh {
  let found: Mesh | null = null;
  template.traverse(node => {
    if (!found && node instanceof Mesh) found = node;
  });
  if (!found) throw new Error(`The template "${template.name}" has no mesh.`);
  return found;
}

/**
 * Many copies of one shape drawn in a single go: a layer of clouds, the swarm of lanterns, a skein of birds.
 * The shape is the model's; each copy is placed every frame.
 */
function flock(shape: Mesh, material: Material | Material[], count: number): InstancedMesh {
  const mesh = new InstancedMesh(shape.geometry, material, count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // They are spread all round the platform, and where they are changes every frame.
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Everything round the platform and below it. None of it is the round's: it is the place the round happens
 * in, and it watches. It is given what happened (`blast`, `look`, `cheer`, `clap`, `gust`) and answers.
 */
class Surroundings {
  readonly group = new Group();
  private readonly kit: StageKit;
  private readonly night: boolean;
  private readonly model = new Model('brawl');
  /** Each layer of the sea, one shape at a time: every cloud of that shape in the layer is one copy. */
  private readonly clouds: { mesh: InstancedMesh; span: number; items: { x: number; y: number; z: number; size: number; speed: number; phase: number; turn: Quaternion }[] }[] = [];
  /** The lanterns' shades and their caps: two meshes, a copy of each for every lantern. */
  private lanternParts: InstancedMesh[] = [];
  private readonly lanterns: { x: number; z: number; top: number; size: number; phase: number }[] = [];
  private readonly balloons: { carrier: Group; pivot: Group; at: Vector3; x: number; z: number; pace: number; lean: { x: number; z: number }; speed: { x: number; z: number } }[] = [];
  private readonly gulls: { view: Object3D; wings: Object3D[]; radius: number; y: number; pace: number; turn: number; scare: number }[] = [];
  /** Each group of watchers, the piece it stands on, and what it is looking at, in that piece's own measure. */
  private readonly watchers: { crowd: Crowd; on: Object3D; eyes: { x: number; z: number } }[] = [];
  private readonly sails: Object3D | undefined;
  private readonly plane: { root: Object3D; prop: Object3D | undefined; banner: Object3D[] };
  private readonly kite: { view: Object3D; line: Object3D; on: Object3D | undefined; lean: { x: number; y: number }; speed: { x: number; y: number } };
  private readonly skein: InstancedMesh;
  private readonly wisp: Color;
  private readonly leaf: Color;
  private readonly glow = new Color(palette.lantern).multiplyScalar(2);
  /** What the watchers are looking at, and until when it holds their eyes over the fight itself. */
  private readonly gaze = { x: 0, z: 0, until: 0 };
  private now = 0;
  private gaspAt = -10;
  /** Each dies away by itself: the gust in the windmill's sails, the swing of the lanterns, how far open the skein is thrown. */
  private wind = 0;
  private swing = 0;
  private spread = 0;
  private star: { x: number; y: number; z: number; vx: number; vy: number; left: number } | null = null;
  private starIn = 3;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly aim = new Vector3();
  private readonly scale = new Vector3();
  private readonly turn = new Quaternion();
  private readonly euler = new Euler();

  constructor(kit: StageKit, night: boolean) {
    this.kit = kit;
    this.night = night;
    const model = this.model;
    this.group.add(model.scene);
    // Lit windows are for the night.
    model.scene.traverse(node => {
      if (node.name.startsWith('night_')) node.visible = night;
    });
    this.sails = model.node(SAILS.on);

    // Those who came to watch stand on the islands and ride in the baskets, and go wherever those go.
    for (const { on, seed, spots } of WATCHERS) {
      const piece = model.node(on);
      if (!piece) continue;
      const crowd = new Crowd(spots, { seed });
      // They are far from the floor: a shadow of theirs would fall on nothing.
      crowd.group.traverse(node => {
        if (node instanceof Mesh) node.castShadow = false;
      });
      piece.add(crowd.group);
      const eyes = { x: 0, z: 0 };
      crowd.watch(eyes);
      this.watchers.push({ crowd, on: piece, eyes });
    }

    // A balloon bobs as it was built to. What carries it here takes it for a slow walk round its spot, and lets it swing.
    for (const [name, x, z, pace] of BALLOONS) {
      const balloon = model.node(name);
      if (!balloon) continue;
      const at = balloon.position.clone();
      const hang = at.clone().setY(at.y + ROCK.hang * balloon.scale.y);
      const carrier = new Group();
      const pivot = new Group();
      const back = new Group();
      pivot.position.copy(hang);
      back.position.copy(hang).negate();
      back.add(balloon);
      pivot.add(back);
      carrier.add(pivot);
      this.balloons.push({ carrier, pivot, at, x, z, pace, lean: { x: 0, z: 0 }, speed: { x: 0, z: 0 } });
      this.group.add(carrier);
    }
    for (const [radius, y, pace, start] of GULLS) {
      const view = model.part('gull');
      this.gulls.push({ view, wings: ['gull_wing_l', 'gull_wing_r'].map(name => view.getObjectByName(name)!), radius, y, pace, turn: start, scare: 0 });
      this.group.add(view);
    }

    // The plane: each length of its banner hangs from the end of the one before, so a wave runs down it.
    const root = model.part('plane');
    const banner = ['banner_0', 'banner_1', 'banner_2'].flatMap(name => root.getObjectByName(name) ?? []);
    banner.forEach((length, index) => {
      if (index === 0) return;
      banner[index - 1]!.add(length);
      length.position.set(0, 0, PLANE.length);
    });
    root.scale.setScalar(PLANE.size);
    this.plane = { root, prop: root.getObjectByName('plane_prop'), banner };
    this.kite = { view: model.part('kite'), line: model.part('kite_line'), on: model.node(KITE.on), lean: { x: 0, y: 0 }, speed: { x: 0, y: 0 } };
    const bird = meshOf(model.part('bird'));
    this.skein = flock(bird, bird.material, SKEIN.birds);
    this.group.add(root, this.kite.view, this.kite.line, this.skein);

    // By night all of that sinks into the dusk. The clouds and the lanterns, added after, have their own night colours.
    if (night) {
      const dimmed = new Set<MeshToonMaterial>();
      this.group.traverse(node => {
        if (!(node instanceof Mesh) || !(node.material instanceof MeshToonMaterial) || dimmed.has(node.material)) return;
        dimmed.add(node.material);
        node.material.color.lerp(DUSK, node.name === DIM_LAND.piece || node.parent?.name === DIM_LAND.piece ? DIM_LAND.by : DIM);
      });
    }
    this.wisp = new Color(night ? palette.cloudNight : colors.cloud);
    this.leaf = new Color(palette.leaf).lerp(DUSK, night ? DIM : 0);

    const turned = new Quaternion().setFromAxisAngle(UP, Math.PI);
    for (const layer of SEA) {
      // One colour for each layer and time of day: deeper is darker, and night darker still, so the white floor stays the brightest thing.
      const color = night ? (layer.deep ? palette.cloudDeepNight : palette.cloudNight) : layer.deep ? palette.cloudDeep : null;
      let paint: MeshToonMaterial | null = null;
      for (const [shape, name] of CLOUD_SHAPES.entries()) {
        const spots = layer.spots.filter(spot => spot[2] === shape);
        if (spots.length === 0) continue;
        const template = model.part(name);
        if (color && !paint) {
          paint = model.own(template, 'cloud');
          paint?.color.set(color);
        }
        const source = meshOf(template);
        const mesh = flock(source, paint ?? source.material, spots.length);
        // Every other one is turned round, so a few shapes do not read as a few shapes.
        const items = spots.map(([x, z], index) => ({ x, y: layer.y, z, size: layer.size * (0.85 + ((index * 7) % 5) * 0.075), speed: layer.speed, phase: index * 1.7 + layer.y + shape, turn: index % 2 === 0 ? UPRIGHT : turned }));
        this.clouds.push({ mesh, span: layer.span, items });
        this.group.add(mesh);
      }
    }

    if (!night) return;
    const lantern = model.part('lantern');
    this.lanternParts = lantern.children.map(piece => flock(meshOf(piece), meshOf(piece).material, LANTERNS.length));
    this.group.add(...this.lanternParts);
    LANTERNS.forEach(([x, z, top, size], index) => this.lanterns.push({ x, z, top, size, phase: (index * 0.618) % 1 }));
  }

  /** Something went off at that spot, a blast of that reach: everything out here feels it. */
  blast(x: number, z: number, radius: number): void {
    const force = Math.min(1.6, radius / tuning.barrel.blastRadius);
    for (const balloon of this.balloons) {
      const dx = balloon.at.x - x;
      const dz = balloon.at.z - z;
      const far = Math.max(ROCK.near, Math.hypot(dx, dz));
      // Its basket swings away from the blast.
      balloon.speed.z += ((dx / far) * force * ROCK.push) / far;
      balloon.speed.x -= ((dz / far) * force * ROCK.push) / far;
    }
    for (const gull of this.gulls) gull.scare = Math.min(1, gull.scare + 0.5 * force);
    this.spread = Math.min(1, this.spread + 0.6 * force);
    this.wind = Math.min(1, this.wind + 0.5 * force);
    this.swing = Math.min(1, this.swing + 0.7 * force);
    this.kite.speed.x += 2.4 * force;
    this.kite.speed.y += 3 * force;
    this.look(x, z, GAZE.blast);
    // They start at a blast, but not at every one of a chain.
    if (this.now - this.gaspAt < GAZE.gasp) return;
    this.gaspAt = this.now;
    for (const { crowd } of this.watchers) crowd.gasp();
  }

  /** Turns every watcher's head to that spot for a moment. */
  look(x: number, z: number, seconds: number): void {
    Object.assign(this.gaze, { x, z, until: this.now + seconds });
  }

  cheer(seconds: number): void {
    for (const { crowd } of this.watchers) crowd.cheer(seconds);
  }

  clap(): void {
    for (const { crowd } of this.watchers) crowd.clap();
  }

  /** A gust through the windmill's sails. */
  gust(): void {
    this.wind = 1;
  }

  /** Once a frame. `round` is null when the platform is the podium's stage. */
  frame(round: AnyRound | null, dt: number, time: number): void {
    this.now = time;
    this.wind = Math.max(0, this.wind - SAILS.calm * dt);
    this.swing *= Math.exp(-1.2 * dt);
    this.spread *= Math.exp(-0.7 * dt);
    this.model.update(dt);
    this.drift(dt, time);
    this.fly(dt, time);
    this.attend(round, dt, time);
    this.weather(dt);
  }

  dispose(): void {
    for (const { crowd } of this.watchers) crowd.dispose();
    // The shapes are the model's own; only the copies are freed here.
    for (const mesh of [...this.clouds.map(layer => layer.mesh), ...this.lanternParts, this.skein]) mesh.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }

  /** Moves what the wind moves: the clouds along their layers, the lanterns up through them, the balloons, the sails. */
  private drift(dt: number, time: number): void {
    for (const { mesh, span, items } of this.clouds) {
      items.forEach((cloud, index) => {
        const along = ((((cloud.x + time * cloud.speed + span) % (span * 2)) + span * 2) % (span * 2)) - span;
        const size = Math.max(0.001, cloud.size * Math.min(1, (span - Math.abs(along)) / 9));
        this.position.set(along, cloud.y + Math.sin(time * 0.3 + cloud.phase) * 0.35, cloud.z);
        mesh.setMatrixAt(index, this.matrix.compose(this.position, cloud.turn, this.scale.setScalar(size)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.lanterns.forEach((lantern, index) => {
      // Each climbs, swaying, grows out of the clouds at the bottom and shrinks to nothing at the top.
      const climb = (time / LANTERN.seconds + lantern.phase) % 1;
      const size = Math.max(0.001, lantern.size * Math.min(1, climb / 0.1, (1 - climb) / 0.03));
      const sway = lantern.phase * 40;
      this.position.set(lantern.x + Math.sin(time * 0.5 + sway) * 0.7, LANTERN.from + (lantern.top - LANTERN.from) * climb, lantern.z + Math.cos(time * 0.4 + sway) * 0.7);
      // A blast sets them swinging harder, and a little faster, for a moment.
      this.turn.setFromEuler(this.euler.set(0, 0, Math.sin(time * (0.9 + this.swing * 2.2) + sway) * (LANTERN.sway + this.swing * LANTERN.swing)));
      this.matrix.compose(this.position, this.turn, this.scale.setScalar(size));
      for (const part of this.lanternParts) part.setMatrixAt(index, this.matrix);
    });
    for (const part of this.lanternParts) part.instanceMatrix.needsUpdate = true;

    this.balloons.forEach(({ carrier, pivot, x, z, pace, lean, speed }, index) => {
      carrier.position.set(Math.sin(time * pace + index * 2) * x, 0, Math.cos(time * pace * 0.8 + index) * z);
      for (const axis of ['x', 'z'] as const) {
        speed[axis] += (-ROCK.stiff * lean[axis] - ROCK.damp * speed[axis]) * dt;
        lean[axis] += speed[axis] * dt;
      }
      pivot.rotation.set(lean.x, 0, lean.z);
    });
    if (this.sails) this.sails.rotation.z -= dt * (SAILS.turn + this.wind * SAILS.race);
  }

  /** Moves what flies: the gulls, the plane and its banner, the kite on its line, the skein of far birds. */
  private fly(dt: number, time: number): void {
    this.gulls.forEach((gull, index) => {
      const { view, wings, radius, y, pace } = gull;
      gull.scare = Math.max(0, gull.scare - SCARE.settle * dt);
      gull.turn += dt * pace * (1 + gull.scare * SCARE.faster);
      const wide = radius + gull.scare * SCARE.wider;
      view.position.set(Math.sin(gull.turn) * wide, y + gull.scare * SCARE.higher + Math.sin(time * 0.6 + index * 2) * 0.5, Math.cos(gull.turn) * wide);
      // Nose along the circle, leaning into the turn; a few beats, then a glide. A scared gull only beats.
      view.rotation.set(0, gull.turn - Math.PI / 2, -0.3, 'YXZ');
      const glide = Math.max(0, Math.sin(time * 0.9 + index * 1.7));
      const beat = Math.sin(time * Math.PI * 2 * FLAP + index) * Math.min(0.7, 0.25 + 0.35 * glide + gull.scare * 0.6);
      wings[0]!.rotation.z = -beat;
      wings[1]!.rotation.z = beat;
    });

    const { root, prop, banner } = this.plane;
    const round = (time / PLANE.seconds) * Math.PI * 2;
    root.position.set(Math.cos(round) * PLANE.across, PLANE.height + Math.sin(time * 0.7) * 0.6, PLANE.back + Math.sin(round) * PLANE.deep);
    // Nose along its way round, banked into the turn. Its banner waves, a wave running down it from the tow line.
    root.rotation.set(0, Math.atan2(Math.sin(round) * PLANE.across, -Math.cos(round) * PLANE.deep), PLANE.bank, 'YXZ');
    // Four blades: turned slowly enough that they are seen to turn, and do not flicker.
    if (prop) prop.rotation.z = time * PLANE.prop;
    banner.forEach((length, index) => {
      length.rotation.y = Math.sin(time * 2.4 - index * 1.1) * (0.2 + index * 0.06);
    });

    // The kite hangs out from the hand that holds it, wandering, and a blast makes it dart before it settles.
    const { view, line, on, lean, speed } = this.kite;
    for (const axis of ['x', 'y'] as const) {
      speed[axis] += (-KITE.stiff * lean[axis] - KITE.damp * speed[axis]) * dt;
      lean[axis] += speed[axis] * dt;
    }
    this.position.set(KITE.hand.x, KITE.hand.y, KITE.hand.z);
    on?.localToWorld(this.position);
    view.position.set(this.position.x + KITE.out.x + Math.sin(time * 0.5) * 1.1 + lean.x, this.position.y + KITE.out.y + Math.sin(time * 1.1) * 0.5 + lean.y, this.position.z + KITE.out.z + Math.cos(time * 0.37) * 0.7);
    view.rotation.set(-0.4, 0.3, Math.cos(time * 0.5) * 0.3 + speed.x * 0.12);
    // Its line runs from the hand to the kite's middle: one metre of line, turned that way and stretched.
    this.aim.copy(view.position).sub(this.position);
    const length = this.aim.length();
    line.position.copy(this.position);
    line.quaternion.setFromUnitVectors(UP, this.aim.divideScalar(length || 1));
    line.scale.set(1, length, 1);

    // The skein: a V behind its leader, each bird a little behind and to one side of the one before.
    const lead = (time / SKEIN.seconds) * Math.PI * 2 + 1;
    for (let index = 0; index < SKEIN.birds; index++) {
      const rank = Math.ceil(index / 2);
      const side = index % 2 === 0 ? 1 : -1;
      const along = lead - (rank * SKEIN.gap * 1.2) / SKEIN.across;
      // Thrown open by a blast, each to its own side and height, and closing again.
      const out = side * rank * SKEIN.gap * (1 + this.spread * SKEIN.open);
      this.position.set(Math.cos(along) * (SKEIN.across + out), SKEIN.height + Math.sin(time * 0.5 + index) * 0.3 + this.spread * Math.sin(index * 2.4) * 1.6, Math.sin(along) * (SKEIN.deep + out));
      this.turn.setFromEuler(this.euler.set(0, Math.atan2(Math.sin(along) * SKEIN.across, -Math.cos(along) * SKEIN.deep), 0));
      // A wingbeat is the bird narrowing and widening: just over one a second.
      const beat = 1 - 0.32 * Math.abs(Math.sin(time * Math.PI * 1.1 + index * 0.9));
      this.skein.setMatrixAt(index, this.matrix.compose(this.position, this.turn, this.scale.set(SKEIN.size * beat, SKEIN.size, SKEIN.size)));
    }
    this.skein.instanceMatrix.needsUpdate = true;
  }

  /** The watchers: where they look, each group from where it stands. */
  private attend(round: AnyRound | null, dt: number, time: number): void {
    // The fight has their eyes, unless something louder took them a moment ago. With nobody on the floor, its middle does.
    if (time > this.gaze.until) {
      let x = 0;
      let z = 0;
      let count = 0;
      for (const pet of round?.pets ?? []) {
        if (pet.y < -2) continue;
        x += pet.x;
        z += pet.z;
        count++;
      }
      this.gaze.x = count > 0 ? x / count : 0;
      this.gaze.z = count > 0 ? z / count : 0;
    }
    for (const { crowd, on, eyes } of this.watchers) {
      on.worldToLocal(this.position.set(this.gaze.x, 0, this.gaze.z));
      eyes.x = this.position.x;
      eyes.z = this.position.z;
      crowd.update(dt);
    }
  }

  /** Small weather, out of the particle pools: a few at a time, so the round's own effects are never crowded out. */
  private weather(dt: number): void {
    const { particles } = this.kit;
    const chance = (perSecond: number) => Math.random() < perSecond * dt;
    if (chance(WISPS.rate)) {
      // Three puffs make a wisp. It drifts away from the platform, swells, and shrinks to nothing.
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * random(WISPS.near, WISPS.far);
      const y = random(WISPS.low, WISPS.high);
      const z = random(-HALF - 2, HALF + 2);
      for (let puff = 0; puff < 3; puff++) {
        particles.puff({ x: x + side * puff * 0.9, y: y + random(-0.15, 0.15), z: z + random(-0.5, 0.5), vx: side * WISPS.drift, vz: -0.3, life: random(4.5, 6), size: puff === 1 ? 1.5 : 1.1, sizeEnd: puff === 1 ? 2.3 : 1.7, color: this.wisp });
      }
    }
    if (chance(LEAVES.rate)) {
      const tree = LEAVES.from[Math.floor(Math.random() * LEAVES.from.length)]!;
      const at = this.model.node(tree.on)?.localToWorld(this.position.set(tree.x + random(-0.5, 0.5), tree.y, tree.z + random(-0.5, 0.5)));
      if (at) particles.cube({ x: at.x, y: at.y, z: at.z, vx: random(0.6, 1.5), vy: random(-0.1, 0.6), vz: random(-0.5, 0.5), life: random(2.4, 3.6), size: random(0.1, 0.17), gravity: 1.3, drag: 0.4, spin: random(-5, 5), color: this.leaf });
    }
    if (chance(CHIMNEY.rate)) {
      const at = this.model.node(CHIMNEY.on)?.localToWorld(this.position.set(CHIMNEY.x, CHIMNEY.y, CHIMNEY.z));
      if (at) particles.puff({ x: at.x, y: at.y, z: at.z, vx: random(0.2, 0.5), vy: random(1, 1.5), life: random(1.8, 2.4), size: 0.22, sizeEnd: random(0.5, 0.7), drag: 0.3, color: SMOKE[this.night ? 1 : 0]! });
    }
    if (!this.night) return;

    if (chance(FIREFLIES.rate)) {
      const island = this.model.node(FIREFLIES.on[Math.floor(Math.random() * FIREFLIES.on.length)]!);
      const at = island?.localToWorld(this.position.set(random(-3.5, 3.5), random(0.4, 2.6), random(-3.5, 3.5)));
      if (at) particles.spark({ x: at.x, y: at.y, z: at.z, vx: random(-0.3, 0.3), vy: random(-0.1, 0.3), vz: random(-0.3, 0.3), life: random(1.6, 2.6), size: 0.11, color: this.glow });
    }
    // A shooting star: a bright point crossing the far sky, shedding a tail that shrinks away behind it.
    this.starIn -= dt;
    if (this.starIn <= 0 && !this.star) {
      this.starIn = random(STAR.least, STAR.most);
      const way = Math.random() < 0.5 ? -1 : 1;
      this.star = { x: -way * random(10, 55), y: random(20, 32), z: random(-95, -55), vx: way * random(26, 40), vy: -random(6, 11), left: STAR.burns };
    }
    if (this.star) {
      const star = this.star;
      star.left -= dt;
      star.x += star.vx * dt;
      star.y += star.vy * dt;
      particles.spark({ x: star.x, y: star.y, z: star.z, vx: star.vx * 0.15, vy: star.vy * 0.15, life: 0.5, size: 0.7, sizeEnd: 0.15, color: HOT });
      if (star.left <= 0) this.star = null;
    }
  }
}

export class BrawlMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId;
  readonly light: { hemisphere: number; sun: number };
  readonly bounds = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };

  private readonly kit: StageKit;
  private readonly tiles = new TileField();
  /** Null on the map put up while the game is still loading: that one is never drawn. */
  private readonly around: Surroundings | null;
  private readonly barrels = new Map<number, BarrelView>();
  private readonly meteors = new Map<number, MeteorView>();
  private cube: CubeView | null = null;
  private cubeLanded = false;

  /** `night` is the last round's look. With `ripple` the tiles pop up from below in a wave from the centre. */
  constructor(kit: StageKit, options: { night: boolean; ripple: boolean }) {
    this.kit = kit;
    this.sky = options.night ? 'night' : 'day';
    this.light = options.night ? { hemisphere: 0.95, sun: 1.3 } : { hemisphere: 1.15, sun: 1.55 };
    this.around = modelsLoaded() ? new Surroundings(kit, options.night) : null;
    this.group.add(this.tiles.mesh);
    if (this.around) this.group.add(this.around.group);
    this.tiles.reset(options.ripple);
  }

  handle(event: GameEvent, round: AnyRound): void {
    const { decals, particles, confetti } = this.kit;
    this.tell(event, round);
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
    this.around?.frame(round, dt, time);
  }

  dispose(): void {
    [...this.barrels.values(), ...this.meteors.values()].forEach(view => view.dispose());
    this.cube?.dispose();
    this.tiles.dispose();
    this.around?.dispose();
    this.group.removeFromParent();
  }

  /** Tells the world round the platform what just happened on it, so it can answer. */
  private tell(event: GameEvent, round: AnyRound): void {
    const around = this.around;
    if (!around) return;
    switch (event.t) {
      case 'explosion':
        return around.blast(event.x, event.z, event.radius);
      case 'fall': {
        // A pet going over the edge is watched all the way down.
        const pet = round.petById(event.pet);
        if (pet) around.look(pet.x, pet.z, GAZE.fall);
        return;
      }
      case 'eliminated':
        if (event.decoy) return;
        around.look(event.x, event.z, GAZE.knockout);
        return around.cheer(1.6);
      case 'cubeSpawn':
        return around.look(event.x, event.z, tuning.cube.dropTime);
      case 'countdown':
        // The round starts with a gust.
        if (event.n === 0) around.gust();
        return;
      case 'roundWinner': {
        const winner = event.seats[0] === undefined ? undefined : round.petOfSeat(event.seats[0]);
        if (winner) around.look(winner.x, winner.z, tuning.match.roundEnd);
        around.gust();
        return around.cheer(3);
      }
      case 'finale':
        // The platform is the podium's stage now: the islands and the baskets are its far seats.
        around.look(0, 0, 2);
        return event.place === 1 ? around.cheer(4) : around.clap();
      default:
        return;
    }
  }
}
