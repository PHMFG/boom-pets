// Everything on the platform that is not a pet: barrels, the Mystery Cube, meteors, ghosts,
// slot reels, the capsule machine, pop-up words and the podium. The props are modelled in Blender
// (tools/blender/maps/brawl.py and finale.py); light, and what carries a picture, is made here.
import type { Barrel, Cube, GachaView, Ghost, Meteor, PowerId, Tier } from '@boom/game';
import { tuning } from '@boom/game';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type Camera,
  type MeshToonMaterial,
  type Object3D,
} from 'three';
import type { PetId } from '../../shared/pets';
import { POWER_ICON, TIER_COLOR } from '../../shared/powers';
import { colors, maps, seats as seatTokens } from '../../shared/tokens';
import { createPet, type PetInstance } from '../render/assets';
import { tileTexture } from '../render/emoji';
import { Model } from '../render/models';
import { Word3D } from '../render/Text3D';

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const backOut = (t: number, strength = 2.2) => 1 + (strength + 1) * (t - 1) ** 3 + strength * (t - 1) ** 2;
export const seatColor = (seat: number): string => seatTokens[seat % seatTokens.length]!.color;

/**
 * The brawl's modelled props. One copy of the file serves every barrel, cube, meteor and machine of the
 * whole game. It is made the first time a prop is needed, and by then the models are loaded.
 */
let kept: Model | null = null;
const props = (): Model => (kept ??= new Model('brawl'));

/** Gives one copy a material of its own for one of its colours, to change as it likes and to free when it goes. */
function ownMaterial(root: Object3D, color: string): MeshToonMaterial {
  const painted: Mesh[] = [];
  root.traverse(node => {
    if (node instanceof Mesh && node.userData.color === color) painted.push(node);
  });
  const mesh = painted[0];
  if (!mesh) throw new Error(`The prop has nothing coloured "${color}".`);
  const material = (mesh.material as MeshToonMaterial).clone();
  mesh.material = material;
  return material;
}

// ── Barrel ───────────────────────────────────────────────────────────────────

export class BarrelView {
  readonly group = new Group();
  private readonly body: MeshToonMaterial;
  private readonly bobOffset = Math.random() * 6;
  private age = 0;

  constructor() {
    const barrel = props().part('barrel');
    // Its staves are its own, so one barrel can go white-hot without the rest.
    this.body = ownMaterial(barrel, 'danger');
    this.group.add(barrel);
  }

  update(barrel: Barrel, alpha: number, dt: number, time: number): void {
    this.age += dt;
    this.group.position.set(lerp(barrel.px, barrel.x, alpha), lerp(barrel.py, barrel.y, alpha), lerp(barrel.pz, barrel.z, alpha));
    // Idle barrels breathe; a lit one swells and turns white in the instant before it goes.
    const lit = barrel.fuse === null ? 0 : 1 - clamp01(barrel.fuse / tuning.barrel.chainDelay);
    const breathe = 1 + Math.sin(time * 3 + this.bobOffset) * 0.035;
    const pop = this.age < 0.28 ? backOut(this.age / 0.28) : 1;
    this.group.scale.set(pop * (1 + lit * 0.4), pop * breathe * (1 + lit * 0.25), pop * (1 + lit * 0.4));
    this.body.emissive.setScalar(barrel.fuse === null ? 0 : 0.5 + lit * 1.8);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.body.dispose();
  }
}

// ── Mystery Cube ─────────────────────────────────────────────────────────────

// Shared by every cube, so a match that spawns dozens of them allocates these once.
const cubeBeam = new CylinderGeometry(0.28, 0.28, 14, 10, 1, true);
const beamMaterial = new MeshBasicMaterial({ color: new Color(colors.gold).multiplyScalar(1.5), transparent: true, opacity: 0.22, depthWrite: false });

export class CubeView {
  readonly group = new Group();
  private readonly box = new Group();
  private readonly chute: Object3D;
  private age = 0;
  /** Seconds since it touched down: the parachute squishes away over the first of them. */
  private down = 0;

  constructor() {
    this.box.add(props().part('cube'));
    this.chute = props().part('chute');
    // A column of light so the cube can be found from across the room.
    const beam = new Mesh(cubeBeam, beamMaterial);
    beam.position.y = 7;
    this.group.add(this.box, this.chute, beam);
  }

  update(cube: Cube, dt: number, time: number): void {
    this.age += dt;
    this.down = cube.landed ? this.down + dt : 0;
    this.group.position.set(cube.x, cube.y + (cube.landed ? Math.sin(time * 3) * 0.12 : 0), cube.z);
    this.box.rotation.set(0, time * 1.8, cube.landed ? 0 : Math.sin(time * 5) * 0.2);
    // The question mark pulses, slowly.
    const arrive = this.age < 0.3 ? backOut(this.age / 0.3) : 1;
    this.box.scale.setScalar(arrive * (1 + Math.sin(time * 4) * 0.06));
    // The parachute sways on the way down, and is let go on the floor: a swell, then gone.
    const leave = clamp01(this.down / 0.16);
    this.chute.visible = leave < 1;
    this.chute.rotation.z = Math.sin(time * 4) * 0.1;
    this.chute.scale.setScalar(Math.max(0.001, arrive * (leave < 0.3 ? 1 + 0.08 * (leave / 0.3) : 1.08 * (1 - (leave - 0.3) / 0.7))));
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}

// ── Meteor ───────────────────────────────────────────────────────────────────

/** Where a meteor starts from, relative to where it lands. Its fire points back up this way. */
const METEOR_FROM = new Vector3(7, 30, -5);
const UP = new Vector3(0, 1, 0);

export class MeteorView {
  readonly group = new Group();
  private readonly rock: Object3D;
  private readonly fire: Object3D;

  constructor() {
    this.rock = props().part('meteor');
    this.fire = props().part('meteor_fire');
    this.fire.quaternion.setFromUnitVectors(UP, METEOR_FROM.clone().normalize());
    this.group.add(this.rock, this.fire);
  }

  /** Falls along a slant and speeds up, arriving exactly as the timer hits zero. */
  update(meteor: Meteor, time: number): void {
    const t = 1 - clamp01(meteor.left / meteor.total);
    const fall = t * t;
    this.group.position.copy(METEOR_FROM).multiplyScalar(1 - fall);
    this.group.position.x += meteor.x;
    this.group.position.z += meteor.z;
    this.group.scale.setScalar(meteor.radius * 0.5);
    // The rock tumbles; the fire behind it only flickers, and stretches as the rock speeds up.
    this.rock.rotation.set(time * 7, time * 5, 0);
    const flicker = Math.sin(time * 15) * 0.1;
    this.fire.scale.set(1 + flicker, 0.7 + t * 0.5 + Math.sin(time * 11) * 0.08, 1 - flicker);
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}

// ── Ghost ────────────────────────────────────────────────────────────────────

const cursorRing = new RingGeometry(0.75, 0.95, 36).rotateX(-Math.PI / 2);
const cursorDot = new RingGeometry(0, 0.16, 16).rotateX(-Math.PI / 2);

/** A knocked-out player: a see-through pet floating over a target ring that marks where its meteor will land. */
export class GhostView {
  readonly group = new Group();
  readonly seat: number;
  private readonly pet: PetInstance;
  private readonly marker: MeshBasicMaterial;
  private readonly body = new Group();
  private age = 0;

  constructor(seat: number, model: PetId) {
    this.seat = seat;
    this.pet = createPet(model, seatColor(seat));
    this.pet.body.transparent = true;
    this.pet.body.opacity = 0.55;
    this.pet.body.emissive.set(seatColor(seat)).multiplyScalar(0.35);
    this.pet.model.scale.setScalar(0.5);
    this.pet.model.traverse(node => {
      if (node instanceof Mesh) node.castShadow = false;
    });
    this.pet.actions.get('idle')?.play();
    this.marker = new MeshBasicMaterial({ color: seatColor(seat), toneMapped: false });
    const ring = new Mesh(cursorRing, this.marker);
    const dot = new Mesh(cursorDot, this.marker);
    ring.position.y = dot.position.y = 0.05;
    this.body.add(this.pet.model);
    this.group.add(this.body, ring, dot);
  }

  update(ghost: Ghost, dt: number, time: number): void {
    this.age += dt;
    this.pet.mixer.update(dt);
    this.group.position.set(ghost.x, 0, ghost.z);
    this.body.position.y = 2.6 + Math.sin(time * 2.4 + this.seat) * 0.25;
    this.body.rotation.y = Math.sin(time * 1.3 + this.seat) * 0.5;
    this.body.scale.setScalar(this.age < 0.3 ? backOut(this.age / 0.3) : 1);
    // The target on the floor is the brawl's: where this ghost's meteor will land. A ghost that only watches has none.
    const [, ring, dot] = this.group.children;
    ring!.visible = dot!.visible = ghost.cursor;
    // The ring is small while the meteor recharges and full size, turning, when it is ready.
    const ready = ghost.cooldown === 0;
    const charge = ghost.cooldownTotal > 0 ? 1 - ghost.cooldown / ghost.cooldownTotal : 1;
    ring!.scale.setScalar(ready ? 1 + Math.sin(time * 6) * 0.06 : 0.35 + 0.65 * charge);
  }

  /** Where the name tag goes. */
  get headHeight(): number {
    return this.body.position.y + 1.3;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.pet.dispose();
    this.marker.dispose();
  }
}

// ── Slot reels ───────────────────────────────────────────────────────────────

const reelBox = new BoxGeometry(0.44, 0.44, 0.44);
const REEL_STOPS = [0.5, 0.75, 1.0];
/** How far the reels stand above the spot the stage gives them: clear of the pet's name tag, which is drawn over that spot. */
const REEL_LIFT = 0.9;
const ALL_ICONS = Object.values(POWER_ICON);

/** Three little drums over a pet's head. They stop left to right on a result that was decided before they spun. */
export class SlotReels {
  readonly group = new Group();
  done = false;
  private readonly reels: { mesh: Mesh; material: MeshBasicMaterial; stopped: boolean; punch: number; swapIn: number }[] = [];
  private readonly tier: Tier;
  private readonly power: PowerId;
  private time = 0;
  /** Called as each reel stops, with its index. */
  onStop: ((index: number) => void) | null = null;

  constructor(tier: Tier, power: PowerId) {
    this.tier = tier;
    this.power = power;
    // The case the reels spin in is modelled; the reels carry pictures, so they are made here.
    const frame = props().part('reels');
    frame.position.y = REEL_LIFT;
    this.group.add(frame);
    for (let index = 0; index < 3; index++) {
      const material = new MeshBasicMaterial({ map: tileTexture(ALL_ICONS[index]!, colors.cream) });
      const mesh = new Mesh(reelBox, material);
      mesh.position.set((index - 1) * 0.52, REEL_LIFT, 0);
      this.group.add(mesh);
      this.reels.push({ mesh, material, stopped: false, punch: 0, swapIn: 0 });
    }
  }

  update(dt: number, camera: Camera): void {
    this.time += dt;
    this.group.quaternion.copy(camera.quaternion);
    const enter = Math.min(1, this.time / 0.2);
    // Linger on the result for half a second, then squish away.
    const leave = clamp01((this.time - 1.5) / 0.16);
    this.group.scale.setScalar(backOut(enter) * (1 - leave));
    if (leave >= 1) this.done = true;

    this.reels.forEach((reel, index) => {
      if (!reel.stopped && this.time >= REEL_STOPS[index]!) {
        reel.stopped = true;
        reel.punch = 1;
        reel.material.map = tileTexture(POWER_ICON[this.power], TIER_COLOR[this.tier]);
        reel.material.needsUpdate = true;
        reel.mesh.rotation.x = 0;
        this.onStop?.(index);
      }
      if (reel.stopped) {
        reel.punch *= Math.exp(-9 * dt);
        reel.mesh.scale.setScalar(1 + reel.punch * 0.45);
        return;
      }
      reel.mesh.rotation.x += dt * 24;
      reel.swapIn -= dt;
      if (reel.swapIn <= 0) {
        reel.swapIn = 0.07;
        reel.material.map = tileTexture(ALL_ICONS[Math.floor(Math.random() * ALL_ICONS.length)]!, colors.cream);
        reel.material.needsUpdate = true;
      }
    });
  }

  dispose(): void {
    this.group.removeFromParent();
    this.reels.forEach(reel => reel.material.dispose());
  }
}

// ── Capsule machine ──────────────────────────────────────────────────────────

const RAINBOW = seatTokens.map(seat => seat.color);

/** The SUPER gacha machine. Its whole show is a function of the gacha's clock, so it can never drift out of step. */
export class GachaMachine {
  readonly group = new Group();
  /** Fired once, when the machine hits the floor. */
  onLand: (() => void) | null = null;
  private readonly machine = new Group();
  private readonly lever = new Group();
  private capsule: Object3D | null = null;
  /** The top half of the capsule, which changes colour as it cracks. */
  private shell: MeshToonMaterial | null = null;
  private landed = false;
  private readonly tint = new Color();

  constructor() {
    this.group.add(this.machine);
    this.group.visible = false;
  }

  update(gacha: GachaView | null, x: number, z: number, time: number): void {
    if (!gacha || gacha.time < tuning.gacha.machineAt) {
      this.group.visible = false;
      this.landed = false;
      return;
    }
    const capsule = this.capsule ?? this.build();
    const { machineAt, leverUntil, revealAt, duration } = tuning.gacha;
    this.group.visible = true;
    this.group.position.set(x, 0, z);

    // Drops from the sky, then squashes on landing.
    const drop = clamp01((gacha.time - machineAt) / 0.22);
    const sinceLanding = gacha.time - machineAt - 0.22;
    if (drop >= 1 && !this.landed) {
      this.landed = true;
      this.onLand?.();
    }
    const squash = sinceLanding > 0 ? 1 - Math.exp(-sinceLanding * 9) * Math.cos(sinceLanding * 28) * 0.3 : 1;
    const leave = clamp01((gacha.time - (duration - 0.3)) / 0.25);
    this.machine.position.y = (1 - drop * drop) * 16;
    this.machine.scale.set((2 - squash) * (1 - leave), squash * (1 - leave), (2 - squash) * (1 - leave));
    // The lever follows the winner's thumb.
    this.lever.rotation.z = -gacha.lever * 1.5;

    // The fake-out: a grey capsule that shakes, cracks to gold, then goes rainbow.
    const out = clamp01((gacha.time - leverUntil) / 0.2);
    const reveal = clamp01((gacha.time - leverUntil) / (revealAt - leverUntil));
    capsule.visible = gacha.time >= leverUntil && gacha.time < revealAt;
    const shake = reveal * 0.12;
    capsule.position.set(Math.sin(time * 70) * shake, 0.5 + backOut(out) * 0.9 + Math.cos(time * 63) * shake, 1.3);
    capsule.scale.setScalar(1 + reveal * 0.5);
    if (reveal < 0.4) this.tint.set(colors.steel);
    else if (reveal < 0.7) this.tint.set(colors.gold).multiplyScalar(1.6);
    else this.tint.set(RAINBOW[Math.floor(time * 12) % RAINBOW.length]!).multiplyScalar(2);
    // Grey, it is a thing like any other. Cracked, it is lit from inside and burns the same from every side.
    const lit = reveal >= 0.4;
    this.shell?.color.copy(this.tint).multiplyScalar(lit ? 0.2 : 1);
    this.shell?.emissive.copy(this.tint).multiplyScalar(lit ? 0.8 : 0);
  }

  /** Where the capsule bursts, for the particles. */
  get capsulePosition(): { x: number; y: number; z: number } {
    return { x: this.group.position.x, y: 1.4, z: this.group.position.z + 1.3 };
  }

  /** Puts the machine together the first time a gacha plays: the stage is made while the models are still loading. */
  private build(): Object3D {
    const model = props();
    const body = model.part('gacha');
    // The glass is see-through, and the far wall of the globe behind the capsules is pale, so they show.
    const glass = model.own(body, 'glass');
    if (glass) Object.assign(glass, { transparent: true, opacity: 0.32, depthWrite: false });
    this.lever.add(model.part('gacha_lever'));
    this.lever.position.set(0.9, 0.7, 0);
    this.machine.add(body, this.lever);
    const capsule = model.part('gacha_capsule');
    this.shell = model.own(capsule, 'steel');
    this.capsule = capsule;
    this.group.add(capsule);
    return capsule;
  }
}

// ── Pop-up words ─────────────────────────────────────────────────────────────

type Popup = { word: Word3D; left: number; rise: number; leaving: number };

/** Big 3D words that slam in, hang for a moment, and squish out. They always face the camera. */
export class Words {
  readonly group = new Group();
  private readonly popups: Popup[] = [];

  pop(text: string, x: number, y: number, z: number, options: { size: number; color: string; seconds?: number; rise?: number }): void {
    const word = new Word3D(text, { size: options.size, color: options.color });
    word.group.position.set(x, y, z);
    word.slam();
    this.group.add(word.group);
    this.popups.push({ word, left: options.seconds ?? 1.1, rise: options.rise ?? 0, leaving: 0 });
  }

  update(dt: number, camera: Camera): void {
    for (let index = this.popups.length - 1; index >= 0; index--) {
      const popup = this.popups[index]!;
      popup.word.update(dt);
      popup.word.group.quaternion.copy(camera.quaternion);
      popup.word.group.position.y += popup.rise * dt;
      popup.left -= dt;
      if (popup.left > 0) continue;
      popup.leaving += dt / 0.16;
      const t = popup.leaving;
      popup.word.group.scale.setScalar(t < 0.3 ? 1 + 0.08 * (t / 0.3) : Math.max(0, 1.08 * (1 - (t - 0.3) / 0.7)));
      if (t >= 1) {
        popup.word.group.removeFromParent();
        this.popups.splice(index, 1);
      }
    }
  }

  clear(): void {
    this.popups.forEach(popup => popup.word.group.removeFromParent());
    this.popups.length = 0;
  }
}

// ── Podium ───────────────────────────────────────────────────────────────────

const STEP_HEIGHTS = [1.5, 1.0, 0.6];
const STEP_X = [0, -1.9, 1.9];
/** How much bigger than the others the winner stands. */
const WINNER_SCALE = 1.35;
/** The lamp towers at the corners of the stage, and how high their lamps sit on them. */
const TOWER = { corner: 6.6, lamp: 4.05 };
/** Where the two cannons stand. The stage fires the winner's confetti from just inside each. */
const CANNON = { x: 4.6, z: 1.6 };
/** The footlights round the rug. */
const BULBS = { count: 16, radius: 4.34 };
/** A lamp's light: a cone from its lens, over-bright so the glow picks it up. It opens when the lamp comes on; it does not fade in. */
const BEAM_LENGTH = 11;
const lampBeam = new CylinderGeometry(1.05, 0.14, BEAM_LENGTH, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, BEAM_LENGTH / 2 + 0.45);
const lampLight = new MeshBasicMaterial({ color: new Color(maps.finale.lamp).multiplyScalar(1.5), transparent: true, opacity: 0.07, depthWrite: false, side: DoubleSide });

export type PodiumEntry = { seat: number; model: PetId; place: number };

type Spot = { pet: PetInstance; holder: Group; step: Object3D; paint: MeshToonMaterial | null; seat: number; place: number; height: number; x: number; shownAt: number | null; crown: Object3D | null };

/** Where those who missed the podium stand, in the order they are placed: behind the cannons, in front of the balloons. */
const CROWD_SPOTS = [
  { x: -3.8, z: -1.7 },
  { x: 3.8, z: -1.7 },
  { x: -5.5, z: -2.6 },
  { x: 5.5, z: -2.6 },
  { x: -2.4, z: -3.2 },
  { x: 2.4, z: -3.2 },
] as const;

/**
 * The end of a match, on a stage of its own (tools/blender/maps/finale.py). The steps are there from the
 * start but empty: each place is revealed when the simulation says so, third place first. The lamps at the
 * corners search the stage while the drums roll. The winner gets a crown and a spotlight and stands bigger
 * than the rest; everyone who did not reach the podium watches from the sides.
 */
export class Podium {
  readonly group = new Group();
  private readonly model = new Model('finale');
  private readonly spots: Spot[] = [];
  private readonly crowd: { pet: PetInstance; holder: Group }[] = [];
  private readonly beam: Mesh;
  private readonly lamps: { head: Object3D; beam: Mesh; aim: Vector3 }[] = [];
  private readonly cannons: { root: Object3D; barrel: Object3D | undefined; side: number }[] = [];
  private readonly bulbs: Object3D[] = [];
  /** What stands on the stage from the start, in the order it is set out. */
  private readonly scenery: Object3D[];
  private readonly target = new Vector3();
  private celebrating: number | null = null;
  /** When the cannons went off, if they have. */
  private firedAt: number | null = null;
  private time = 0;

  /** `entries` are the final standings, best first. Seats sharing a place stand on steps of the same height. */
  constructor(entries: PodiumEntry[]) {
    this.scenery = [...this.model.scene.children];
    for (const piece of this.scenery) piece.scale.setScalar(0.001);
    this.group.add(this.model.scene);
    entries.forEach((entry, index) => {
      const pet = createPet(entry.model, seatColor(entry.seat));
      pet.model.scale.setScalar(0.72);
      const holder = new Group();
      holder.add(pet.model);
      holder.scale.setScalar(0.001);
      this.group.add(holder);
      if (index >= 3 || entry.place > 3) {
        // Off the podium: a place beside it and a little behind, where the camera in front of the stage sees it, turned toward the winner.
        const spot = CROWD_SPOTS[this.crowd.length % CROWD_SPOTS.length]!;
        holder.position.set(spot.x, 0, spot.z);
        holder.rotation.y = -Math.sign(spot.x) * 0.5;
        pet.actions.get('idle')?.play();
        this.crowd.push({ pet, holder });
        return;
      }
      const height = STEP_HEIGHTS[entry.place - 1]!;
      const x = STEP_X[index]!;
      // A step is plain until its place is revealed: its colour would give the name away.
      const step = this.model.part(`step_${entry.place}`);
      step.position.set(x, 0, 0);
      holder.position.set(x, height, 0);
      pet.actions.get('idle')?.play();
      this.spots.push({ pet, holder, step, paint: this.model.own(step, 'step'), seat: entry.seat, place: entry.place, height, x, shownAt: null, crown: null });
      this.group.add(step);
    });

    // A cone of light on the winner. It is over-bright so the glow picks it up, and it grows open; it does not fade in.
    this.beam = new Mesh(
      new CylinderGeometry(0.2, 1.7, 14, 24, 1, true),
      new MeshBasicMaterial({ color: new Color(colors.gold).multiplyScalar(1.6), transparent: true, opacity: 0.13, depthWrite: false, side: DoubleSide }),
    );
    this.beam.position.set(0, 7, 0);
    this.beam.scale.set(0.001, 1, 0.001);
    this.group.add(this.beam);

    // A lamp on each tower, with its light.
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const head = this.model.part('lamp');
      head.position.set(x * TOWER.corner, TOWER.lamp, z * TOWER.corner);
      const beam = new Mesh(lampBeam, lampLight);
      beam.scale.set(0.001, 0.001, 1);
      head.add(beam);
      this.lamps.push({ head, beam, aim: new Vector3(x * 2, 0.4, z * 2) });
      this.group.add(head);
    }
    // The cannons are built aiming to the left, so the one on the left is turned round: both aim over the podium.
    for (const side of [-1, 1]) {
      const root = this.model.part('cannon');
      root.position.set(side * CANNON.x, 0, CANNON.z);
      root.rotation.y = side < 0 ? Math.PI : 0;
      this.cannons.push({ root, barrel: root.getObjectByName('cannon_barrel'), side });
      this.group.add(root);
    }
    for (let index = 0; index < BULBS.count; index++) {
      const angle = ((index + 0.5) / BULBS.count) * Math.PI * 2;
      const bulb = this.model.part('bulb');
      bulb.position.set(Math.cos(angle) * BULBS.radius, 0, Math.sin(angle) * BULBS.radius);
      this.bulbs.push(bulb);
      this.group.add(bulb);
    }
  }

  /** Shows everyone at that place, and returns where they stand so the stage can mark the moment. */
  reveal(place: number): { x: number; y: number; z: number; seat: number }[] {
    const shown = this.spots.filter(spot => spot.place === place && spot.shownAt === null);
    for (const spot of shown) {
      spot.shownAt = this.time;
      spot.paint?.color.set(seatColor(spot.seat));
      // The winner dances; the others clap along.
      spot.pet.mixer.stopAllAction();
      spot.pet.actions.get(place === 1 ? 'dance' : 'gesture-positive')?.play();
      if (place === 1) {
        spot.crown = this.model.part('crown');
        spot.crown.position.y = 1.45;
        spot.crown.scale.setScalar(0.001);
        spot.holder.add(spot.crown);
      }
    }
    if (place === 1) {
      this.celebrating = this.time;
      // The cannons go off with the winner. Shown all at once, with no finale, nothing is fired.
      if (this.time > 0) this.firedAt = this.time;
      for (const { pet } of this.crowd) {
        pet.mixer.stopAllAction();
        pet.actions.get('gesture-positive')?.play();
      }
    }
    return shown.map(spot => ({ x: spot.x, y: spot.height, z: 0, seat: spot.seat }));
  }

  /** Shows every place at once: for a match end that had no finale. */
  revealAll(): void {
    for (const place of [3, 2, 1]) this.reveal(place);
  }

  update(dt: number): void {
    this.time += dt;
    // The stage is set as the drums start: the rug rolls out from the middle, then each piece pops up, one after another.
    const arrive = (delay: number) => Math.max(0.001, backOut(clamp01((this.time - delay) / 0.3)));
    this.scenery.forEach((piece, index) => piece.scale.setScalar(arrive(index * 0.03)));
    for (const { pet, holder } of this.crowd) {
      // The crowd walks on while the drums roll.
      holder.scale.setScalar(backOut(clamp01(this.time / 0.3)));
      pet.mixer.update(dt);
    }
    this.spots.forEach((spot, index) => {
      const since = spot.shownAt === null ? -1 : this.time - spot.shownAt;
      const winner = spot.place === 1;
      const size = since < 0 ? 0.001 : backOut(clamp01(since / 0.3)) * (winner ? WINNER_SCALE : 1);
      spot.holder.scale.setScalar(Math.max(0.001, size));
      // The winner drops in from above; then keeps hopping.
      const drop = winner && since >= 0 ? Math.max(0, 1 - since / 0.25) * 5 : 0;
      spot.holder.position.y = spot.height + drop + (winner && since > 0.25 ? Math.abs(Math.sin((since - 0.25) * 6)) * 0.35 : 0);
      // The step takes the weight: a short squash as its pet lands on it.
      const squash = since < 0 ? 0 : Math.exp(-since * 9) * Math.sin(since * 26) * 0.07;
      const set = arrive(0.1 + index * 0.07);
      spot.step.scale.set((1 + squash * 0.5) * set, (1 - squash) * set, (1 + squash * 0.5) * set);
      if (spot.crown) {
        spot.crown.scale.setScalar(backOut(clamp01((since - 0.45) / 0.3)) || 0.001);
        spot.crown.rotation.y = this.time * 1.4;
      }
      spot.pet.mixer.update(dt);
    });
    const open = this.celebrating === null ? 0.001 : Math.max(0.001, backOut(clamp01((this.time - this.celebrating) / 0.35)));
    this.beam.scale.set(open, 1, open);

    // The lamps come on one after another and wander the stage, each its own way. Once there is a winner they
    // chase each other round the podium instead: four lights on the winner as well as the spotlight wash it out.
    this.lamps.forEach(({ head, beam, aim }, index) => {
      if (this.celebrating === null) this.target.set(Math.sin(this.time * 0.8 + index * 1.7) * 3.6, 0.4, Math.cos(this.time * 0.63 + index * 2.3) * 2.8);
      else this.target.set(Math.cos(this.time * 1.1 + index * (Math.PI / 2)) * 3.4, 0.3, Math.sin(this.time * 1.1 + index * (Math.PI / 2)) * 2.9 + 0.3);
      aim.lerp(this.target, 1 - Math.exp(-7 * dt));
      head.lookAt(aim);
      head.scale.setScalar(arrive(0.3 + index * 0.14));
      const lit = Math.max(0.001, backOut(clamp01((this.time - 0.6 - index * 0.14) / 0.35)));
      beam.scale.set(lit, lit, 1);
    });

    // A cannon that has fired kicks back and rings like a bell for a moment.
    const kick = this.firedAt === null ? 0 : Math.exp(-(this.time - this.firedAt) * 6) * Math.cos((this.time - this.firedAt) * 22);
    for (const { root, barrel, side } of this.cannons) {
      root.scale.setScalar(arrive(0.45));
      root.position.x = side * (CANNON.x + kick * 0.16);
      barrel?.scale.set(1 + kick * 0.2, 1 - kick * 0.32, 1 + kick * 0.2);
    }

    // The footlights take turns, slowly, while the drums roll; for the winner a wave of light runs round the rug.
    this.bulbs.forEach((bulb, index) => {
      const wave = this.celebrating === null ? Math.sin(this.time * Math.PI * 1.6 + index * Math.PI) : Math.sin(this.time * Math.PI * 2.4 - (index / BULBS.count) * Math.PI * 6);
      bulb.scale.setScalar(arrive(0.3 + index * 0.03) * (1 + Math.max(0, wave) * 0.45));
    });
    this.model.update(dt);
  }

  dispose(): void {
    this.group.removeFromParent();
    [...this.spots, ...this.crowd].forEach(({ pet }) => pet.dispose());
    this.beam.geometry.dispose();
    (this.beam.material as MeshBasicMaterial).dispose();
    this.model.dispose();
  }
}
