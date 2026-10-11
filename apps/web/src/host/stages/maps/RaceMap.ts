// Corrida Maluca: a track of pale toy blocks winding high over the morning clouds, from a green arch to a
// chequered one, with a flag at every place a fallen pet comes back to and bright bars that sweep across the way.
// Everything but the tiles is modelled in Blender (tools/blender/maps/race.py).
//
// How long the track is belongs to the rules, so whatever stands on it or beside it is placed here from the
// round itself: stilts where the track is always whole, an arch past each end, the flags, the bars, a
// grandstand behind the last lane and a marshals' tower beside the last turn.
//
// The place is alive, and it answers the race. Spectators on the grandstand, the tower and the windmill's
// island follow the leader, cheer whoever crosses the line and wince at whoever is swept off. A flag whips
// as each pet passes it, the windmill turns faster as the leader nears the line, and at the line a light
// runs over the finish arch and the balloons go up. Under the track the sky has traffic of its own: three
// layers of cloud, a blimp, a balloon race, a flock of birds and a plane towing a banner.
import type { AnyField, AnyRound, GameEvent } from '@boom/game';
import { TILE, tuning } from '@boom/game';
import { Color, Group, Mesh, type BufferGeometry, type MeshToonMaterial, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps, seats } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { GOLD, random, WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { Crowd, type Spot } from './crowd';

const COLUMNS = tuning.race.columns;
const ROWS = tuning.race.rows;
const palette = maps.race;
/** Metres of track ahead of each pet that the camera keeps in the picture. */
const LOOK_AHEAD = 5;
/** From the middle line of the track to its edge. */
const HALF_TRACK = 1.5;
/** How far past each end of the track its arch stands: clear of the floor, so it never comes between a pet and the camera. */
const ARCH_OFF = 1.5;
/** The bar as it is modelled: the game's reach and thickness are scaled from these. */
const BAR = { length: 3.4, thick: 0.36 };
/** A flag: how far from the middle of the track its pole stands (just off the edge), where the cloth hangs, where it folds, and how far the cloth reaches from the pole. */
const FLAG = { off: HALF_TRACK + 0.25, height: 1.86, fold: 0.6, reach: 1.3 };
/** The sky was modelled round a track 24 m across. What stands off one end of it is moved out by half of what a longer track adds. */
const REACH = COLUMNS / 2 - 12;
/** A stilt's top is wide, and must never show through a gap: the nearest one stands this far from the middle of an obstacle. */
const STILT_CLEAR = tuning.race.stretch / 2 + 1.1;
/** The grandstand: how far back from the finish along the last stretch its middle is, and how far outside the track's edge its front. */
const STAND = { back: 3.2, gap: 1.6 };
/** The marshals' tower stands behind the floor: how far behind its back edge, and how far in from its sides the outer two of the three places it may take are. */
const TOWER = { gap: 2.3, inset: 5.5 };
/** The three layers of cloud under the track and how fast each drifts, in metres a second: the nearest fastest, so the depth can be felt. */
const CLOUDS = [
  { name: 'clouds_near', speed: 0.55 },
  { name: 'clouds_mid', speed: 0.3 },
  { name: 'clouds_far', speed: 0.14 },
];
/** Whatever drifts shrinks away over its last metres before it goes round to the other side, and swells back in there. */
const FADE = { cloud: 6, craft: 4 };
/** The blimp, and the three balloons racing far below: metres a second, and how far past the middle each goes before it comes round. */
const BLIMP = { speed: 0.75, wrap: COLUMNS / 2 + 11 };
const RACERS = { speeds: [0.95, 0.7, 0.55], wrap: COLUMNS / 2 + 16 };
/** The windmill: radians a second while nothing is happening, and how much is added as the leader reaches the line. */
const MILL = { idle: 0.7, rush: 5 };
/** At the line the balloons go up this far and come down again over these seconds, and a light runs along the finish arch's lamps, one pass every `pass` seconds. */
const LIFT = { seconds: 3.2, height: 2.6 };
const LIGHTS = { seconds: 3.2, pass: 0.9, rest: 1.3, lit: 3 };
/** A flag whips for this long when a pet passes it or comes back at it. */
const WHIP = 0.9;
/** A flock of birds crosses under the track now and then: how many, how fast, wingbeats a second, how far past the track's ends they start, and the seconds between flocks. */
const FLOCK = { birds: 5, speed: 6, flap: 2.2, margin: 24, rest: [5, 11] as const };
/**
 * A plane towing a banner crosses behind the track from the far right, high up, to the near left, low: where it
 * starts and ends beyond the track's ends, its heights and distances, its speed and the seconds between passes.
 */
const PLANE = { from: { x: COLUMNS / 2 + 40, y: 5, z: -30 }, to: { x: -COLUMNS / 2 - 34, y: -8, z: 4 }, speed: 7, rest: [8, 15] as const };
/**
 * How what is placed here arrives: the way the model's own pieces do, growing out from the middle of the map to
 * their places, the near ones first. Seconds, and the distance at which the wait is longest.
 */
const ENTER = { wait: 0.12, spread: 0.45, grow: 0.5, reach: 28 };
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const backOut = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

type RaceField = Extract<AnyField, { gameMode: 'race' }>;
type FlagView = { along: number; x: number; z: number; near: Object3D; far: Object3D; phase: number; whip: number; passed: Set<number> };
type Drifter = { node: Object3D; speed: number; wrap: number; fade: number; size: number };
type Bird = { view: Object3D; back: number; side: number; phase: number };

/**
 * One piece made of a template stood at each of `places`, so that fourteen stilts are drawn as one thing and not as
 * fourteen. The template's meshes must lie where they are drawn, unturned (a part that was settled in its script).
 * The shapes this makes are the caller's to free: they are added to `made`.
 */
function stoodAt(template: Object3D, places: readonly { x: number; z: number }[], made: BufferGeometry[]): Group {
  const whole = new Group();
  if (places.length === 0) return whole;
  template.traverse(node => {
    if (!(node instanceof Mesh)) return;
    // Its outline is a mesh too, of the same shape, and is joined up the same way.
    const shape = mergeGeometries(places.map(place => (node.geometry as BufferGeometry).clone().translate(place.x, 0, place.z)));
    made.push(shape);
    const piece = new Mesh(shape, node.material);
    piece.castShadow = node.castShadow;
    piece.receiveShadow = node.receiveShadow;
    whole.add(piece);
  });
  return whole;
}

export class RaceMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'morning';
  readonly light = { hemisphere: 1.15, sun: 1.5 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.track, palette.trackDark]);
  private readonly model = new Model('race');
  /** What stands on the track and beside it, placed from the round; and what flies past. */
  private readonly placed = new Group();
  private readonly scenery = new Group();
  private arriving: { holder: Group; delay: number }[] = [];
  private age = 0;
  /** Shapes made here, which are this map's to free. */
  private readonly shapes: BufferGeometry[] = [];
  private readonly bars: Object3D[] = [];
  /** Each bar's post, and how far through its jolt it is (1 to 0) after the bar has hit someone. */
  private readonly posts: { view: Object3D; x: number; z: number; jolt: number }[] = [];
  private readonly flags: FlagView[] = [];
  private readonly arches: Object3D[] = [];
  private readonly lamps: { view: Object3D; paint: MeshToonMaterial }[] = [];
  private readonly drifting: Drifter[] = [];
  private readonly lifts: { node: Object3D; y: number }[] = [];
  private readonly sails: Object3D | undefined;
  private readonly birds: Bird[] = [];
  private readonly flock = { wait: 3, along: 0, y: 0, z: 0, slant: 0, way: 1 };
  private readonly plane: { view: Object3D; prop: Object3D | undefined; wait: number; t: number };
  private readonly crowd: Crowd;
  /** Where the crowd looks: at whoever is in front. */
  private readonly eye = { x: 0, z: 0 };
  /** Where confetti is thrown from when the first pet crosses the line: the middle of the grandstand. */
  private readonly cannon = { x: 0, z: 0 };
  /** How much of the track the leader has behind it, 0 to 1. */
  private lead = 0;
  private lights = 0;
  private lift = 0;

  constructor(kit: StageKit, field: RaceField) {
    this.kit = kit;
    const { model } = this;
    this.group.add(this.tiles.mesh, model.scene, this.placed, this.scenery);
    this.tiles.reset(true);
    // The grid is a rectangle; the track is the part of it that is there.
    field.tiles.forEach((state, index) => {
      if (state === TILE.gone) this.tiles.hide(index);
    });

    // The sky: what stands off one end of the track moves out with it.
    model.scene.traverse(node => {
      if (typeof node.userData.side === 'number') node.position.x += node.userData.side * REACH;
    });
    // Each layer of cloud says how many metres it repeats over: a bank that leaves on one side comes back on the other.
    for (const layer of CLOUDS) {
      const banks = model.node(layer.name);
      const wrap = Number(banks?.userData.period ?? 100) / 2;
      for (const cloud of banks?.children ?? []) this.drifting.push({ node: cloud, speed: layer.speed, wrap, fade: FADE.cloud, size: cloud.scale.x });
    }
    const blimp = model.node('blimp');
    if (blimp) this.drifting.push({ node: blimp, ...BLIMP, fade: FADE.craft, size: 1 });
    RACERS.speeds.forEach((speed, index) => {
      const racer = model.node(`racer_${index}`);
      if (racer) this.drifting.push({ node: racer, speed, wrap: RACERS.wrap, fade: FADE.craft, size: 1 });
    });
    for (const name of ['lift_0', 'lift_1', 'lift_2']) {
      const node = model.node(name);
      if (node) this.lifts.push({ node, y: node.position.y });
    }
    this.sails = model.node('mill_sails');

    // Not drawn until they have somewhere to go.
    for (let index = 0; index < FLOCK.birds; index++) {
      const view = model.part('bird');
      view.visible = false;
      this.scenery.add(view);
      // A V: the leader, then two either side, each pair farther back and farther out.
      const row = Math.ceil(index / 2);
      this.birds.push({ view, back: row * 1.1, side: (index % 2 === 0 ? 1 : -1) * row * 0.8, phase: index * 1.3 });
    }
    const plane = model.part('plane');
    plane.visible = false;
    plane.rotation.order = 'YZX';
    this.scenery.add(plane);
    this.plane = { view: plane, prop: plane.getObjectByName('plane_prop'), wait: random(4, 8), t: 0 };

    this.crowd = this.build(field);
    // Each thing placed goes into a holder that grows from nothing, so its own motion is left alone.
    for (const piece of [...this.placed.children]) {
      const holder = new Group();
      holder.scale.setScalar(0.0001);
      this.placed.add(holder);
      holder.add(piece);
      this.arriving.push({ holder, delay: ENTER.wait + Math.min(1, Math.hypot(piece.position.x, piece.position.z) / ENTER.reach) * ENTER.spread });
    }
    this.crowd.watch(this.eye);
    // They stand over nothing a shadow could fall on, so they cast none: a shadow nobody sees is still drawn.
    this.crowd.group.traverse(node => {
      node.castShadow = false;
    });
    this.group.add(this.crowd.group);
  }

  handle(event: GameEvent, round: AnyRound): void {
    const { confetti, words, rig, stars } = this.kit;
    if (event.t === 'phase' && event.phase === 'play') {
      // They are off.
      this.crowd.cheer(1.4);
    } else if (event.t === 'finish') {
      const pet = round.petById(event.pet);
      const color = seats[event.seat % seats.length]!.color;
      if (pet) confetti(pet.x, 1.5, pet.z, [new Color(color), new Color(colors.gold), WHITE], event.place === 1 ? 60 : 24);
      if (pet && event.place === 1) {
        words.pop(strings.words3d.finish, pet.x - 2, 3.2, pet.z - 0.5, { size: 1.2, color, seconds: 1.4 });
        rig.shake(0.3);
        // The grandstand throws its own, in the colours of its bunting.
        confetti(this.cannon.x, 2.2, this.cannon.z, [new Color(palette.mint), new Color(palette.lilac), WHITE], 36);
      }
      this.celebrate(event.place === 1 ? 3 : 1.6);
    } else if (event.t === 'swept') {
      const pet = round.petById(event.pet);
      if (pet) {
        stars(pet.x, 0.9, pet.z, 10);
        // The post of the bar that did it jolts: the one it is nearest.
        let nearest = Infinity;
        for (const post of this.posts) nearest = Math.min(nearest, Math.hypot(post.x - pet.x, post.z - pet.z));
        for (const post of this.posts) if (Math.hypot(post.x - pet.x, post.z - pet.z) === nearest) post.jolt = 1;
      }
      rig.shake(0.12);
      this.crowd.gasp();
    } else if (event.t === 'fall') {
      this.crowd.gasp();
    } else if (event.t === 'respawn') {
      // The flag it comes back at whips.
      const flag = this.flags.find(each => Math.hypot(each.x - event.x, each.z - event.z) < 0.5);
      if (flag) flag.whip = WHIP;
    } else if (event.t === 'roundWinner') {
      this.celebrate(3);
    }
  }

  /** A racer needs to see what is coming: the camera also keeps the next few metres of track ahead of every pet in view. */
  focus(round: AnyRound, points: { x: number; z: number }[]): void {
    if (round.gameMode !== 'race') return;
    for (const pet of round.pets) {
      const ahead = round.rules.track.pointAt((round.rules.best.get(pet.seat) ?? 0) + LOOK_AHEAD);
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
      // Whoever is in front is who the crowd watches, and how near the line they are is how fast the windmill turns.
      let front = -1;
      for (const pet of field.pets) {
        const best = field.rules.best.get(pet.seat) ?? 0;
        if (best <= front) continue;
        front = best;
        this.eye.x = pet.x;
        this.eye.z = pet.z;
      }
      this.lead = clamp01(front / field.rules.track.length);
      // A flag whips as each pet passes it, and the first one past gets a hand.
      for (const flag of this.flags) {
        for (const [seat, best] of field.rules.best) {
          if (best < flag.along || flag.passed.has(seat)) continue;
          flag.passed.add(seat);
          flag.whip = WHIP;
          if (flag.passed.size === 1) this.crowd.clap();
        }
      }
    }
    this.tiles.update(dt, time);
    this.model.update(dt);
    this.crowd.update(dt);
    if (this.arriving.length > 0) {
      this.age += dt;
      for (const { holder, delay } of this.arriving) holder.scale.setScalar(Math.max(0.0001, backOut(clamp01((this.age - delay) / ENTER.grow))));
      if (this.age > ENTER.wait + ENTER.spread + ENTER.grow) this.arriving = [];
    }

    // The sky moves: clouds slide by under the track, each layer at its own pace; the blimp crosses beneath it and the balloons race far below.
    for (const { node, speed, wrap, fade, size } of this.drifting) {
      node.position.x += speed * dt;
      if (node.position.x > wrap) node.position.x -= wrap * 2;
      node.scale.setScalar(Math.max(0.001, size * clamp01((wrap - Math.abs(node.position.x)) / fade)));
    }
    if (this.sails) this.sails.rotation.z += (MILL.idle + this.lead ** 2 * MILL.rush) * dt;

    // Each flag waves in two halves, the far one a beat behind the near one, like cloth; harder for a moment when it whips.
    for (const flag of this.flags) {
      flag.whip = Math.max(0, flag.whip - dt);
      const gust = 1 + (flag.whip / WHIP) * 1.6;
      flag.near.rotation.y = Math.sin(time * 5 * gust + flag.phase) * 0.3 * gust;
      flag.far.rotation.y = Math.sin(time * 5 * gust + flag.phase - 1.2) * 0.55 * gust;
    }
    for (const post of this.posts) {
      post.jolt = Math.max(0, post.jolt - dt / 0.35);
      post.view.scale.set(1 + Math.sin(post.jolt * Math.PI) * 0.35, 1 - Math.sin(post.jolt * Math.PI) * 0.25, 1 + Math.sin(post.jolt * Math.PI) * 0.35);
    }
    // The arches are blown up, not built: they wobble on their stilts.
    this.arches.forEach((arch, index) => {
      arch.rotation.z = Math.sin(time * 1.7 + index * 2) * 0.03;
      arch.scale.y = 1 + Math.sin(time * 2.3 + index) * 0.015;
    });

    // At the line: a light runs along the finish arch's lamps (each is lit once a pass, far slower than anything may blink), and the balloons go up and settle.
    this.lights = Math.max(0, this.lights - dt);
    const on = clamp01(this.lights / 0.5);
    const head = ((time / LIGHTS.pass) % 1) * this.lamps.length;
    this.lamps.forEach(({ view, paint }, index) => {
      const apart = Math.abs(index - head);
      const lit = on * clamp01(1 - Math.min(apart, this.lamps.length - apart) / 1.6);
      view.scale.setScalar(1 + lit * 0.7);
      paint.color.set(colors.cream).lerp(GOLD, lit).multiplyScalar(LIGHTS.rest + lit * LIGHTS.lit);
    });
    this.lift = Math.max(0, this.lift - dt);
    const up = Math.sin((1 - this.lift / LIFT.seconds) * Math.PI) ** 2 * LIFT.height;
    this.lifts.forEach(({ node, y }, index) => {
      node.position.y = y + up * (1 - index * 0.2);
    });

    this.fly(dt, time);
    this.tow(dt, time);
    this.weather(dt);
  }

  dispose(): void {
    this.tiles.dispose();
    this.crowd.dispose();
    this.model.dispose();
    for (const shape of this.shapes) shape.dispose();
    this.group.removeFromParent();
  }

  /** Somebody crossed the line, or the round is won: the crowd is up, the lamps run and the balloons rise. */
  private celebrate(seconds: number): void {
    this.crowd.cheer(seconds);
    this.lights = LIGHTS.seconds;
    this.lift = LIFT.seconds;
  }

  /** The flock: it comes in from one side under the track, crosses in a V and is gone; a while later another comes, somewhere else. */
  private fly(dt: number, time: number): void {
    const { flock } = this;
    const span = COLUMNS / 2 + FLOCK.margin;
    if (flock.wait > 0) {
      flock.wait -= dt;
      if (flock.wait > 0) return;
      // Always below the floor, where nothing can come between a pet and the camera.
      Object.assign(flock, { along: -span, y: random(-7, -3.5), z: random(-11, 7), slant: random(-0.15, 0.15), way: Math.random() < 0.5 ? -1 : 1 });
      for (const bird of this.birds) bird.view.visible = true;
    }
    flock.along += FLOCK.speed * dt;
    if (flock.along > span) {
      flock.wait = random(...FLOCK.rest);
      for (const bird of this.birds) bird.view.visible = false;
      return;
    }
    // The model flies toward +x: turned to the way the flock is going.
    const heading = Math.atan2(-flock.slant, flock.way);
    const shown = clamp01((span - Math.abs(flock.along)) / 3);
    for (const { view, back, side, phase } of this.birds) {
      const x = flock.along * flock.way - back * Math.cos(heading) + side * Math.sin(heading);
      const z = flock.z + flock.along * flock.slant + back * Math.sin(heading) + side * Math.cos(heading);
      view.position.set(x, flock.y + Math.sin(time * 1.3 + phase) * 0.15, z);
      view.rotation.y = heading;
      // A wingbeat, as it looks from above: the wings are drawn in and thrown out again.
      const beat = 0.5 + 0.5 * Math.cos(time * Math.PI * 2 * FLOCK.flap + phase);
      view.scale.set(Math.max(0.001, shown), Math.max(0.001, shown), Math.max(0.001, shown * (0.5 + 0.5 * beat)));
    }
  }

  /** The plane and its banner: across the sky behind the track, coming down as it comes nearer, and then a wait before the next pass. */
  private tow(dt: number, time: number): void {
    const { plane } = this;
    const { from, to } = PLANE;
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (plane.wait > 0) {
      plane.wait -= dt;
      if (plane.wait > 0) return;
      plane.t = 0;
      plane.view.visible = true;
    }
    plane.t += (PLANE.speed * dt) / length;
    if (plane.t >= 1) {
      plane.wait = random(...PLANE.rest);
      plane.view.visible = false;
      return;
    }
    const { view } = plane;
    view.position.set(from.x + (to.x - from.x) * plane.t, from.y + (to.y - from.y) * plane.t + Math.sin(time * 1.1) * 0.25, from.z + (to.z - from.z) * plane.t);
    // It rolls a little from side to side, noses down the way it is going, and faces it.
    view.rotation.set(Math.sin(time * 1.7) * 0.08, Math.atan2(-(to.z - from.z), to.x - from.x), Math.asin((to.y - from.y) / length));
    view.scale.setScalar(Math.max(0.001, clamp01(plane.t / 0.04) * clamp01((1 - plane.t) / 0.04)));
    if (plane.prop) plane.prop.rotation.x += 26 * dt;
  }

  /** What the wind carries: wisps of cloud and a few petals, all of it below the floor, where nothing can come between a pet and the camera. */
  private weather(dt: number): void {
    const { particles } = this.kit;
    const wide = COLUMNS / 2 + 8;
    if (Math.random() < 1.6 * dt) {
      particles.puff({ x: random(-wide, wide), y: random(-7, -1.6), z: random(-13, 11), vx: random(0.8, 1.6), life: random(3, 5), size: 0.25, sizeEnd: random(0.5, 0.9), color: WHITE });
    }
    if (Math.random() < 3 * dt) {
      const petal = [palette.mint, palette.lilac, colors.cream][Math.floor(Math.random() * 3)]!;
      particles.cube({ x: random(-wide, wide), y: random(-6, -0.8), z: random(-12, 10), vx: random(1.5, 2.6), vy: random(-0.35, 0.1), vz: random(-0.3, 0.3), life: random(4, 6), size: random(0.08, 0.13), spin: random(2, 6), color: new Color(petal) });
    }
  }

  /**
   * Everything that is placed from the round's own track, which is drawn afresh each round: nothing here may assume
   * where it runs, only that it starts at one side of the floor and ends in the back corner of the other. Returns
   * the spectators, standing where the stands say.
   */
  private build(field: RaceField): Crowd {
    const { model } = this;
    const { track, hurdles } = field.rules;
    const end = track.pointAt(track.length);

    // The last stretch before the line is a chequered flag laid on the floor.
    const ink = new Color(colors.ink);
    const white = new Color(colors.white);
    field.tiles.forEach((state, index) => {
      const { x, z } = this.tiles.centre(index);
      const along = (x - end.x) * end.dx + (z - end.z) * end.dz;
      const across = Math.abs((x - end.x) * end.dz - (z - end.z) * end.dx);
      if (state !== TILE.gone && along > -1 && across < HALF_TRACK) this.tiles.setColor(index, (Math.floor(x + 0.5) + Math.floor(z + 0.5)) % 2 === 0 ? ink : white, false);
    });

    // An arch past each end of the track, across it: off the floor, where it hides nobody.
    const arch = (name: string, at: number, side: number) => {
      const spot = track.pointAt(at);
      const whole = new Group();
      const tube = model.part(name);
      whole.add(model.part('arch_feet'), tube);
      whole.position.set(spot.x + spot.dx * ARCH_OFF * side, 0, spot.z + spot.dz * ARCH_OFF * side);
      whole.rotation.y = Math.atan2(-spot.dz, spot.dx);
      this.arches.push(tube);
      this.placed.add(whole);
      return tube;
    };
    arch('arch_start', 0, -1);
    const finish = arch('arch_finish', track.length, 1);
    // Its lamps, each with paint of its own so one can be lit without the others.
    for (let index = 0; ; index++) {
      const view = finish.getObjectByName(`lamp_${index}`);
      const paint = view ? model.own(view, 'cream') : null;
      if (!view || !paint) break;
      this.lamps.push({ view, paint });
    }

    // A flag wherever a fallen pet comes back, just off the track. The cloth points the way to run, which at a
    // corner is the way to turn, and it must never hang over a pet as the camera sees it, from the front and above:
    // a cloth up on its pole is drawn over whatever is a metre and a half behind the pole's foot.
    //   On a straight: on the side away from the camera, or the outer side of one that runs toward or away from it.
    //   At a corner: outside the turn, on the diagonal, where the cloth runs along the corner's far edge.
    //   At a corner the track comes into toward the camera: the diagonal is in front of it and the cloth would
    //   lie across it, so the pole stands on the side the track turns away from, a cloth's length out.
    //   At a corner the track leaves away from the camera: the diagonal is in front of it again, so the pole
    //   stands straight on past the corner, beside the stretch that leaves, with the cloth along its edge.
    field.rules.flags.slice(1).forEach((along, index) => {
      const spot = track.pointAt(along);
      const corner = track.legs.findIndex(leg => Math.abs(leg.start - along) < 0.01);
      const before = corner > 0 ? track.legs[corner - 1]! : null;
      const alongX = Math.abs(spot.dx) > Math.abs(spot.dz);
      const out = 1 + FLAG.reach / FLAG.off;
      const aside = !before
        ? alongX
          ? { x: 0, z: -1 }
          : { x: Math.sign(spot.x) || 1, z: 0 }
        : before.dz > 0.5
          ? { x: -spot.dx * out, z: -spot.dz * out }
          : spot.dz < -0.5
            ? { x: before.dx, z: before.dz }
            : { x: before.dx - spot.dx, z: before.dz - spot.dz };
      const flag = new Group();
      const cloth = new Group();
      const near = model.part('flag_cloth_a');
      const far = model.part('flag_cloth_b');
      far.position.x = FLAG.fold;
      near.add(far);
      cloth.add(near);
      cloth.position.y = FLAG.height;
      cloth.rotation.y = Math.atan2(-spot.dz, spot.dx);
      flag.add(model.part('flag_post'), cloth);
      flag.position.set(spot.x + aside.x * FLAG.off, 0, spot.z + aside.z * FLAG.off);
      this.flags.push({ along, x: spot.x, z: spot.z, near, far, phase: index * 1.9, whip: 0, passed: new Set() });
      this.placed.add(flag);
    });

    // The sweeping bars: a post in the middle of the track and the bar that turns on it, as long and as thick as the game says.
    for (const sweeper of field.rules.sweepers) {
      const post = model.part('sweeper_foot');
      post.position.set(sweeper.x, 0, sweeper.z);
      const bar = model.part('sweeper_bar');
      bar.scale.set((tuning.race.sweepThick * 0.9) / BAR.thick, 1, (tuning.race.sweepReach * 2) / BAR.length);
      bar.position.set(sweeper.x, 0, sweeper.z);
      this.bars.push(bar);
      this.posts.push({ view: post, x: sweeper.x, z: sweeper.z, jolt: 0 });
      this.placed.add(post, bar);
    }

    // The stilts: under each straight half way between one thing and the next (its corners and its obstacles),
    // pushed clear of any obstacle. Wherever the track can lose a tile there is none.
    const stilts: { x: number; z: number }[] = [];
    const obstacles = hurdles.map(hurdle => hurdle.at);
    for (const leg of track.legs) {
      const marks = [leg.start, ...obstacles.filter(at => at > leg.start && at < leg.start + leg.length), leg.start + leg.length];
      for (let index = 0; index + 1 < marks.length; index++) {
        let at = (marks[index]! + marks[index + 1]!) / 2;
        const near = obstacles.reduce((best, each) => (Math.abs(each - at) < Math.abs(best - at) ? each : best), Infinity);
        if (Math.abs(near - at) < STILT_CLEAR) at = near + Math.sign(at - near || 1) * STILT_CLEAR;
        // If that brings it too near the next obstacle, or off the end of its straight, there is no room for it.
        if (at < leg.start || at > leg.start + leg.length || obstacles.some(each => Math.abs(each - at) < STILT_CLEAR - 0.01)) continue;
        const spot = track.pointAt(at);
        stilts.push({ x: spot.x, z: spot.z });
      }
    }
    this.placed.add(stoodAt(model.part('stilt'), stilts, this.shapes));

    // Somewhere to watch from. The track ends in a back corner of the floor, so beside its last stretch there is
    // always open sky on the outside: behind the floor if it comes in along the back, off the floor's side if it
    // comes in toward the back. The grandstand stands there, by the finish, facing the track.
    const out = Math.abs(end.dx) > 0.5 ? { x: 0, z: -1 } : { x: Math.sign(end.x) || 1, z: 0 };
    const stand = model.part('stand');
    stand.position.set(end.x - end.dx * STAND.back + out.x * (HALF_TRACK + STAND.gap), 0, end.z - end.dz * STAND.back + out.z * (HALF_TRACK + STAND.gap));
    stand.rotation.y = Math.atan2(-out.x, -out.z);
    this.cannon.x = stand.position.x + out.x * 1.5;
    this.cannon.z = stand.position.z + out.z * 1.5;
    // The marshals' tower stands behind the floor, at whichever of three places is farthest from the start (where
    // six pets are being found by their players, and nothing should stand beside them) and from the grandstand.
    const tower = model.part('tower');
    const start = track.pointAt(0);
    const clear = (x: number) => Math.min(Math.hypot(x - start.x, -ROWS / 2 - TOWER.gap - start.z), Math.hypot(x - stand.position.x, -ROWS / 2 - TOWER.gap - stand.position.z));
    const places = [-1, 0, 1].map(side => side * (COLUMNS / 2 - TOWER.inset));
    tower.position.set(places.reduce((best, x) => (clear(x) > clear(best) ? x : best)), 0, -ROWS / 2 - TOWER.gap);
    this.placed.add(stand, tower);

    // The spectators stand where each of those says (x, how far back and how high, three numbers a place), and on the
    // windmill's island. None of them is one of the animals being raced.
    const spots: Spot[] = [];
    for (const holder of [stand, tower, model.node('mill_island')]) {
      if (!holder) continue;
      const numbers = (holder.userData.spots ?? []) as number[];
      const cos = Math.cos(holder.rotation.y);
      const sin = Math.sin(holder.rotation.y);
      for (let index = 0; index + 2 < numbers.length; index += 3) {
        const [aside, back, up] = [numbers[index]!, numbers[index + 1]!, numbers[index + 2]!];
        const x = holder.position.x + aside * cos - back * sin;
        const z = holder.position.z - aside * sin - back * cos;
        spots.push({ x, y: holder.position.y + up, z, turn: Math.atan2(-x, -z) });
      }
    }
    return new Crowd(spots, { seed: 11, leave: field.pets.map(pet => pet.pet) });
  }
}
