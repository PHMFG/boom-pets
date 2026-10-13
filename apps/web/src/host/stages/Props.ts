// Everything on the platform that is not a pet: barrels, the Mystery Cube, meteors, ghosts,
// slot reels, the capsule machine, pop-up words and the podium. The props are modelled in Blender
// (tools/blender/maps/brawl.py and finale.py); light, and what carries a picture, is made here.
import type { Barrel, Cube, GachaView, Ghost, Meteor, PowerId, Tier } from '@boom/game';
import { tuning } from '@boom/game';
import {
  BackSide,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type Camera,
  type PerspectiveCamera,
  Quaternion,
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
import { Crowd, type Spot as Seat } from './maps/crowd';

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
/** Colours a second the open capsule glides through. Under the fastest anything may pulse (`motion.alarm`). */
const RAINBOW_PACE = 2.4;

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
  private readonly next = new Color();

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
    else {
      // Through the player colours, each melting into the next: it glides, since a hard change this bright would be a blink faster than anything may blink.
      const turn = time * RAINBOW_PACE;
      this.tint.set(RAINBOW[Math.floor(turn) % RAINBOW.length]!).lerp(this.next.set(RAINBOW[(Math.floor(turn) + 1) % RAINBOW.length]!), turn % 1).multiplyScalar(2);
    }
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

type Popup = { word: Word3D; left: number; rise: number; leaving: number; pinned: { size: number; lift: number } | null };

/**
 * A word pinned to the picture hangs this share of the way from the camera to the floor it is looking at: in
 * front of everything that stands on the floor, and never through it.
 */
const PIN_DEPTH = 0.8;

/** Big 3D words that slam in, hang for a moment, and squish out. They always face the camera. */
export class Words {
  readonly group = new Group();
  private readonly popups: Popup[] = [];
  private readonly ahead = new Vector3();
  private readonly up = new Vector3();

  pop(text: string, x: number, y: number, z: number, options: { size: number; color: string; seconds?: number; rise?: number }): void {
    const word = new Word3D(text, { size: options.size, color: options.color });
    word.group.position.set(x, y, z);
    word.slam();
    this.group.add(word.group);
    this.popups.push({ word, left: options.seconds ?? 1.1, rise: options.rise ?? 0, leaving: 0, pinned: null });
  }

  /**
   * A word pinned to the picture and not to a place in the world: the count before a round. It stands in the
   * middle of what the camera is looking at, the same size on every map and however the camera is moving, so it
   * is never out of the picture or cut by its edge. `size` is its height as a share of the picture's, and
   * `lift` how far over the middle its foot is, as the same share. Call `pin` after the camera has moved, each frame.
   */
  pinned(text: string, options: { size: number; lift: number; color: string; seconds: number }): void {
    const word = new Word3D(text, { size: 1, color: options.color });
    word.slam();
    // Out of sight until `pin` has placed it.
    word.group.scale.setScalar(0);
    this.group.add(word.group);
    this.popups.push({ word, left: options.seconds, rise: 0, leaving: 0, pinned: { size: options.size, lift: options.lift } });
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
      if (popup.leaving >= 1) {
        popup.word.group.removeFromParent();
        this.popups.splice(index, 1);
      } else if (!popup.pinned) popup.word.group.scale.setScalar(this.leaving(popup));
    }
  }

  /** Stands the pinned words in front of the camera as it is now. */
  pin(camera: PerspectiveCamera): void {
    for (const popup of this.popups) {
      if (!popup.pinned) continue;
      camera.getWorldDirection(this.ahead);
      // How far along the middle of the picture the floor is, and how tall the picture is where the word hangs.
      const depth = (camera.position.y / Math.max(0.2, -this.ahead.y)) * PIN_DEPTH;
      const high = 2 * depth * Math.tan(MathUtils.degToRad(camera.fov / 2));
      this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      popup.word.group.quaternion.copy(camera.quaternion);
      popup.word.group.position.copy(camera.position).addScaledVector(this.ahead, depth).addScaledVector(this.up, popup.pinned.lift * high);
      popup.word.group.scale.setScalar(popup.pinned.size * high * this.leaving(popup));
    }
  }

  /** A word on its way out: a small swell, then nothing. 1 until it starts to leave. */
  private leaving(popup: Popup): number {
    const t = popup.leaving;
    return t <= 0 ? 1 : t < 0.3 ? 1 + 0.08 * (t / 0.3) : Math.max(0, 1.08 * (1 - (t - 0.3) / 0.7));
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
/** Where the four stage lamps sit: one on each tower at the ends of the backdrop, and one on each curtain rod beside its arch. */
const LAMPS = [
  { x: -6.9, y: 4.35, z: -5 },
  { x: -3.85, y: 3.98, z: -5.28 },
  { x: 3.85, y: 3.98, z: -5.28 },
  { x: 6.9, y: 4.35, z: -5 },
] as const;
/**
 * Where the two cannons stand: beside the rug and wide of everyone, each turned a little (radians) toward the
 * audience. That puts each muzzle beside where the stage bursts the winner's confetti, and the whole cannon
 * above the players' cards at the bottom of the picture.
 */
const CANNON = { x: 5.3, z: 0.9, turn: 0.4 };
/** How far over the winner's feet the crown floats: just clear of the tallest ears. */
const CROWN = 1.4;
/**
 * How a place arrives on its step. The winner falls from high over it, faster all the way down; the others pop in
 * a hop above theirs. `from` is how high, `seconds` how long until it lands, `squash` how flat the landing makes
 * it for an instant (it rings back to its shape), `give` how far the step sinks under it, and `jolt` how high
 * everyone already on the stage is thrown by it. `turn` is how far (radians) and for how long those already shown
 * turn to look at whoever has just been.
 */
const LANDING = {
  winner: { from: 6.5, seconds: 0.3, squash: 0.34, give: 0.14, jolt: 0.42 },
  other: { from: 0.6, seconds: 0.2, squash: 0.2, give: 0.07, jolt: 0.12 },
  turn: { most: 0.7, seconds: 1.8 },
} as const;
/** The footlights round the rug. Their cups are the model's; the bulbs are stood in them here. */
const BULBS = { count: 16, radius: 4.34 };
/**
 * The arch's bulbs are three strings, lit one after another: how many times a second the light goes round
 * before there is a winner and after, and how much faster for a moment as each place is shown. The three
 * together stay under the fastest anything may pulse.
 */
const ARCH_PACE = { drums: 0.6, winner: 1.1, reveal: 1.2 };
/**
 * The audience: two tiers of seats under each curtain, in front of it. `across` is where the seats of the
 * right-hand tiers are (the left mirrors them), and `rows` how high and how far back each tier stands.
 */
const AUDIENCE = { across: [4.42, 5.18, 5.94], rows: [{ y: 0.7, z: -4 }, { y: 1.35, z: -4.8 }] } as const;
/** Seconds between one wave of cheering for the winner and the next, and how many waves before the audience settles to clapping. */
const CHEERS = { every: 2.6, waves: 4, settled: 4.2 };
/** Where the cup stands and how big, how fast it turns by itself (radians a second), and how far it lifts off its stand for the winner. */
const TROPHY = { x: 6.7, z: -2.9, size: 0.85, spin: 0.7, lift: 0.5 };
/**
 * The balloons let go for the winner. `tied` are the three of the bunch at the left, where they float; they go
 * first. Then the audience lets go a flight of its own from behind its back row, at each side and never
 * through the arch: `from` and `to` are how far out from the middle, `back` how far behind the podium, and
 * the rest how many go at once, how often one follows after, where they start and where they are gone
 * (above the picture), and how fast they climb.
 */
const BALLOONS = {
  bunch: 'balloons',
  tied: [{ x: -7.2, y: 1.9, z: -2.9 }, { x: -6.4, y: 2.3, z: -2.9 }, { x: -6.75, y: 2.75, z: -3.1 }],
  from: 4,
  to: 6.3,
  back: -5,
  flight: 10,
  every: 0.9,
  low: 1.5,
  high: 9.5,
  climb: 1.1,
} as const;
const BALLOON_KINDS = ['balloon_gold', 'balloon_cream', 'balloon_velvet'] as const;
/**
 * A lamp's light: a cone from its lens, over-bright so the glow picks it up. It opens when the lamp comes on; it does not fade in.
 * Only the far wall of a cone is drawn. The camera stands in front of the stage, so whoever is in the light is
 * seen in front of it, in their own colours, and not through a veil of it.
 */
const BEAM_LENGTH = 15;
const lampBeam = new CylinderGeometry(1.4, 0.14, BEAM_LENGTH, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, BEAM_LENGTH / 2 + 0.45);
const lampLight = new MeshBasicMaterial({ color: new Color(maps.finale.lamp).multiplyScalar(1.5), transparent: true, opacity: 0.1, depthWrite: false, side: BackSide });

export type PodiumEntry = { seat: number; model: PetId; place: number };

type Spot = { pet: PetInstance; holder: Group; step: Object3D; paint: MeshToonMaterial | null; seat: number; place: number; height: number; x: number; shownAt: number | null; crown: Object3D | null };
/** A place that has landed on its step: who, and where each of them stands. */
export type Landing = { place: number; spots: { x: number; y: number; z: number; seat: number }[] };

/** Where those who missed the podium stand, in the order they are placed: beside it and a little behind, in front of the backdrop. */
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
 * start but empty: each place is revealed when the simulation says so, third place first. The lamps on the
 * backdrop search the stage while the drums roll. The winner gets a crown and a spotlight and stands bigger
 * than the rest; everyone who did not reach the podium watches from the sides.
 * The stage answers each place as it is shown: the audience on its tiers claps and then goes wild, the lamps
 * swing to whoever it is, a ripple runs round the footlights and the arch, the cup spins up, and for the
 * winner the balloons are let go.
 * The camera stands in front of it all, low, and never goes behind.
 */
export class Podium {
  readonly group = new Group();
  /** Called as a place lands on its step, which is a moment after it is shown: the dust, the shake and the cannons belong here. */
  onLand: ((landing: Landing) => void) | null = null;
  private readonly model = new Model('finale');
  private readonly spots: Spot[] = [];
  private readonly crowd: { pet: PetInstance; holder: Group; turn: number }[] = [];
  private readonly beam: Mesh;
  private readonly lamps: { head: Object3D; beam: Mesh; aim: Vector3 }[] = [];
  private readonly cannons: { root: Object3D; barrel: Object3D | undefined; side: number }[] = [];
  /** The bulbs of the footlights: one mesh, a copy for each cup. */
  private readonly bulbs: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly upright = new Quaternion();
  private readonly spot = new Vector3();
  private readonly size = new Vector3();
  /** The three strings of bulbs on the arch: each one's own light, to turn up and down. */
  private readonly strings: { light: { color: Color }; lit: Color }[] = [];
  private readonly target = new Vector3();
  /** The pets that came to watch, on the tiers under the curtains. */
  private readonly audience: Crowd;
  private readonly cup: Object3D;
  private readonly stand: Object3D;
  /** The tied bunch, and the balloons let go: each climbs from where it was let go, and is used again once it is gone. */
  private readonly bunch: Object3D | undefined;
  private readonly balloons: { view: Object3D; x: number; z: number; from: number; born: number; climb: number; sway: number }[] = [];
  private toRelease = 0;
  private releaseIn = 0;
  /** Who was shown last, where, and when: for a moment every lamp and every eye is on them. */
  private shown: { x: number; y: number; at: number; place: number } | null = null;
  /** Those shown and still in the air, and when they come down. */
  private falling: (Landing & { at: number }) | null = null;
  /** The last landing: when, and how hard it threw everyone else. The stage answers this, not the showing. */
  private struck: { at: number; jolt: number } | null = null;
  /** Seconds until the audience's next wave, and how many it has had. */
  private cheerIn = 0;
  private waves = 0;
  /** How far round the arch its light has run. */
  private archTurn = 0;
  /** How hard the cup was last spun, dying away. */
  private cupSpin = 0;
  private celebrating: number | null = null;
  /** When the cannons went off, if they have. */
  private firedAt: number | null = null;
  private time = 0;

  /** `entries` are the final standings, best first. Seats sharing a place stand on steps of the same height. */
  constructor(entries: PodiumEntry[]) {
    this.group.add(this.model.scene);
    for (const name of ['arch_bulbs_0', 'arch_bulbs_1', 'arch_bulbs_2']) {
      const string = this.model.node(name);
      const light = string ? this.model.own(string, 'lamp') : null;
      if (light) this.strings.push({ light, lit: light.color.clone() });
    }
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
        this.crowd.push({ pet, holder, turn: holder.rotation.y });
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
      new MeshBasicMaterial({ color: new Color(colors.gold).multiplyScalar(1.6), transparent: true, opacity: 0.2, depthWrite: false, side: BackSide }),
    );
    this.beam.position.set(0, 7, 0);
    this.beam.scale.set(0.001, 1, 0.001);
    this.group.add(this.beam);

    // The stage lamps, each with its light.
    for (const { x, y, z } of LAMPS) {
      const head = this.model.part('lamp');
      head.position.set(x, y, z);
      const beam = new Mesh(lampBeam, lampLight);
      beam.scale.set(0.001, 0.001, 1);
      head.add(beam);
      this.lamps.push({ head, beam, aim: new Vector3(x * 0.3, 0.4, 2) });
      this.group.add(head);
    }
    // The cannons are built aiming to the left, so the one on the left is turned round: both aim up over the podium.
    for (const side of [-1, 1]) {
      const root = this.model.part('cannon');
      root.position.set(side * CANNON.x, 0, CANNON.z);
      root.rotation.y = side < 0 ? Math.PI - CANNON.turn : CANNON.turn;
      this.cannons.push({ root, barrel: root.getObjectByName('cannon_barrel'), side });
      this.group.add(root);
    }
    const bulb = this.model.part('bulb') as Mesh;
    this.bulbs = new InstancedMesh(bulb.geometry, bulb.material, BULBS.count);
    this.bulbs.instanceMatrix.setUsage(DynamicDrawUsage);
    this.bulbs.frustumCulled = false;
    this.group.add(this.bulbs);

    this.stand = this.model.part('trophy_stand');
    this.cup = this.model.part('trophy_cup');
    this.stand.position.set(TROPHY.x, 0, TROPHY.z);
    this.cup.position.set(TROPHY.x, 0, TROPHY.z);
    this.stand.rotation.y = this.cup.rotation.y = 0.5;
    this.group.add(this.stand, this.cup);
    this.bunch = this.model.node(BALLOONS.bunch);

    // The audience: nobody of a kind that is on the podium, so no face in the crowd is taken for a player's.
    const seats: Seat[] = [];
    for (const side of [-1, 1]) for (const row of AUDIENCE.rows) for (const x of AUDIENCE.across) seats.push({ x: side * x, y: row.y, z: row.z });
    this.audience = new Crowd(seats, { seed: 7, leave: entries.map(entry => entry.model) });
    // They sit at the back, where their shadows would fall behind them, unseen.
    this.audience.group.traverse(node => {
      if (node instanceof Mesh) node.castShadow = false;
    });
    this.group.add(this.audience.group);
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
        spot.crown.position.y = CROWN;
        spot.crown.scale.setScalar(0.001);
        spot.holder.add(spot.crown);
      }
    }
    if (place === 1) {
      this.celebrating = this.time;
      for (const { pet } of this.crowd) {
        pet.mixer.stopAllAction();
        pet.actions.get('gesture-positive')?.play();
      }
    }
    const spots = shown.map(spot => ({ x: spot.x, y: spot.height, z: 0, seat: spot.seat }));
    if (shown.length > 0) {
      // Every lamp and every eye goes to the step at once; the rest waits for whoever it is to land on it.
      this.shown = { x: shown.reduce((sum, spot) => sum + spot.x, 0) / shown.length, y: shown[0]!.height, at: this.time, place };
      // Shown all at once, with no finale, everyone is simply there: nothing falls, and nothing is fired.
      if (this.time > 0) this.falling = { place, spots, at: this.time + (place === 1 ? LANDING.winner : LANDING.other).seconds };
      else {
        for (const spot of shown) spot.shownAt = -10;
        this.answer(place, false);
      }
    }
    return spots;
  }

  /** Shows every place at once: for a match end that had no finale. */
  revealAll(): void {
    for (const place of [3, 2, 1]) this.reveal(place);
  }

  update(dt: number): void {
    this.time += dt;
    // The model sets its own scenery out from the middle; what is stood on it here pops up after, one piece after another.
    const arrive = (delay: number) => Math.max(0.001, backOut(clamp01((this.time - delay) / 0.3)));
    // Whoever was shown comes down on their step: this is the moment the stage answers.
    if (this.falling && this.time >= this.falling.at) {
      const landing = this.falling;
      this.falling = null;
      this.answer(landing.place, true);
      this.onLand?.(landing);
    }
    // A landing throws everyone already on the stage into the air for a moment, those nearest first.
    const thrown = (x: number) => {
      if (!this.struck) return 0;
      const t = (this.time - this.struck.at - Math.abs(x) * 0.03) / 0.3;
      return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI) * this.struck.jolt;
    };
    // And they turn to look at whoever has just been shown, for a moment.
    const looking = this.shown !== null && this.time - this.shown.at < LANDING.turn.seconds ? this.shown : null;
    const ease = 1 - Math.exp(-6 * dt);
    for (const member of this.crowd) {
      const { pet, holder } = member;
      // The crowd walks on while the drums roll.
      holder.scale.setScalar(backOut(clamp01(this.time / 0.3)));
      holder.position.y = thrown(holder.position.x);
      const wanted = this.shown ? Math.atan2(this.shown.x - holder.position.x, -holder.position.z) : -Math.sign(holder.position.x) * 0.5;
      member.turn += (wanted - member.turn) * ease;
      holder.rotation.y = member.turn;
      pet.mixer.update(dt);
    }
    this.spots.forEach((spot, index) => {
      const since = spot.shownAt === null ? -1 : this.time - spot.shownAt;
      const winner = spot.place === 1;
      const how = winner ? LANDING.winner : LANDING.other;
      // How far through its fall it is, and how long it has been down (negative while it is in the air).
      const fall = since < 0 ? 0 : clamp01(since / how.seconds);
      const down = since - how.seconds;
      const size = since < 0 ? 0.001 : Math.max(0.001, backOut(clamp01(since / 0.15))) * (winner ? WINNER_SCALE : 1);
      // Stretched by its speed on the way down, flattened as it lands, and ringing back to its shape.
      const squash = since < 0 ? 0 : down < 0 ? -0.14 * fall : Math.exp(-down * 9) * Math.cos(down * 22) * how.squash;
      spot.holder.scale.set(size * (1 + squash * 0.6), size * (1 - squash), size * (1 + squash * 0.6));
      // The winner keeps hopping once it is down. Anyone already up is thrown by a later landing.
      const dance = winner && down > 0.3 ? Math.abs(Math.sin((down - 0.3) * 6)) * 0.35 : 0;
      spot.holder.position.y = spot.height + how.from * (1 - fall * fall) + dance + (down > 0.35 ? thrown(spot.x) : 0);
      const wanted = looking && looking.place !== spot.place && since >= 0 ? Math.max(-LANDING.turn.most, Math.min(LANDING.turn.most, (looking.x - spot.x) * 0.4)) : 0;
      spot.holder.rotation.y += (wanted - spot.holder.rotation.y) * ease;
      // The step takes the weight: it sinks as its pet lands on it, and springs back.
      const give = down < 0 ? 0 : Math.exp(-down * 9) * Math.cos(down * 22) * how.give;
      const set = arrive(0.1 + index * 0.07);
      spot.step.scale.set((1 + give * 0.5) * set, (1 - give) * set, (1 + give * 0.5) * set);
      if (spot.crown) {
        spot.crown.scale.setScalar(backOut(clamp01((down - 0.2) / 0.3)) || 0.001);
        spot.crown.rotation.y = this.time * 1.4;
      }
      spot.pet.mixer.update(dt);
    });
    const open = this.celebrating === null ? 0.001 : Math.max(0.001, backOut(clamp01((this.time - this.celebrating) / 0.35)));
    this.beam.scale.set(open, 1, open);

    // The lamps come on one after another and wander the stage, each its own way. When a place is shown they
    // all swing to it for a moment. Once there is a winner they chase each other round the podium instead:
    // the winner has the spotlight.
    const since = this.shown ? this.time - this.shown.at : Infinity;
    const aimed = this.shown !== null && since < (this.shown.place === 1 ? 0.7 : 1.1);
    this.lamps.forEach(({ head, beam, aim }, index) => {
      if (aimed) this.target.set(this.shown!.x, this.shown!.y + 0.6, 0);
      else if (this.celebrating === null) this.target.set(Math.sin(this.time * 0.8 + index * 1.7) * 3.6, 0.4, Math.cos(this.time * 0.63 + index * 2.3) * 2.8);
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

    // The light runs round the arch, string after string: each swells and sinks, and none goes out. It runs
    // faster for a second as each place is shown.
    const landed = this.struck ? this.time - this.struck.at : Infinity;
    const hurry = Math.exp(-landed * 2.5);
    this.archTurn += dt * Math.PI * 2 * ((this.celebrating === null ? ARCH_PACE.drums : ARCH_PACE.winner) + ARCH_PACE.reveal * hurry);
    this.strings.forEach(({ light, lit }, index) => {
      const swell = Math.max(0, Math.sin(this.archTurn - (index / this.strings.length) * Math.PI * 2));
      light.color.copy(lit).multiplyScalar(0.5 + 0.5 * swell);
    });

    // The footlights take turns, slowly, while the drums roll; for the winner a wave of light runs round the rug.
    // As a place is shown one ripple runs round them from the step it stands on, each bulb swelling once as it passes.
    const from = this.shown ? Math.atan2(0.4, this.shown.x) : 0;
    for (let index = 0; index < BULBS.count; index++) {
      const angle = ((index + 0.5) / BULBS.count) * Math.PI * 2;
      const wave = this.celebrating === null ? Math.sin(this.time * Math.PI * 1.6 + index * Math.PI) : Math.sin(this.time * Math.PI * 2.4 - (index / BULBS.count) * Math.PI * 6);
      const round = Math.abs(Math.atan2(Math.sin(angle - from), Math.cos(angle - from)));
      const ripple = Math.max(0, 1 - Math.abs(landed * 5 - round * 1.3 - 0.5));
      this.spot.set(Math.cos(angle) * BULBS.radius, 0.02, Math.sin(angle) * BULBS.radius);
      this.bulbs.setMatrixAt(index, this.matrix.compose(this.spot, this.upright, this.size.setScalar(arrive(0.3 + index * 0.03) * (1 + Math.max(0, wave) * 0.45 + ripple * 0.7))));
    }
    this.bulbs.instanceMatrix.needsUpdate = true;

    // The cup turns on its stand, spins up as each place is shown, and for the winner lifts off and hangs there.
    this.cupSpin *= Math.exp(-1.6 * dt);
    this.cup.rotation.y += dt * (TROPHY.spin + this.cupSpin);
    const lifted = this.celebrating === null ? 0 : backOut(clamp01((this.time - this.celebrating - 0.3) / 0.5)) * TROPHY.lift + Math.sin(this.time * 2.2) * 0.06;
    const hop = landed < 0.4 ? Math.sin((landed / 0.4) * Math.PI) * 0.22 : 0;
    this.cup.position.y = lifted + hop;
    this.cup.scale.setScalar(arrive(0.5) * TROPHY.size);
    this.stand.scale.setScalar(arrive(0.45) * TROPHY.size);

    this.flyBalloons(dt);
    this.attend(dt);
    this.model.update(dt);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.audience.dispose();
    [...this.spots, ...this.crowd].forEach(({ pet }) => pet.dispose());
    this.beam.geometry.dispose();
    (this.beam.material as MeshBasicMaterial).dispose();
    this.bulbs.dispose();
    this.model.dispose();
  }

  /** The stage's answer to a place landing on its step. `live` is false when everyone is shown at once, with no finale: then nothing is thrown, fired or let go. */
  private answer(place: number, live: boolean): void {
    this.cupSpin = place === 1 ? 14 : 6;
    if (live) this.struck = { at: this.time, jolt: (place === 1 ? LANDING.winner : LANDING.other).jolt };
    if (place !== 1) return this.audience.clap();
    this.audience.cheer(CHEERS.every);
    this.cheerIn = CHEERS.every;
    this.waves = 1;
    if (!live) return;
    // The cannons go off as the winner lands, and the balloons are let go.
    this.firedAt = this.time;
    this.toRelease = BALLOONS.flight;
    this.releaseIn = 0.25;
  }

  /** The audience: where it looks, and when it cheers again. */
  private attend(dt: number): void {
    // Eyes on whoever was shown last. Before anyone is, they follow one of the lamps about the stage.
    if (this.shown) this.audience.watch({ x: this.shown.x, z: 0 });
    else this.audience.watch({ x: Math.sin(this.time * 0.8) * 3.6, z: Math.cos(this.time * 0.63) * 2.8 });
    if (this.celebrating !== null) {
      // Wave after wave for the winner, and then they settle to clapping, so the table is read in some peace.
      this.cheerIn -= dt;
      if (this.cheerIn <= 0) {
        const wild = this.waves < CHEERS.waves;
        this.cheerIn = wild ? CHEERS.every : CHEERS.settled;
        this.waves++;
        if (wild || this.waves % 3 === 0) this.audience.cheer(CHEERS.every);
        else this.audience.clap();
      }
    }
    this.audience.update(dt);
  }

  /** Lets the tied bunch go, and keeps balloons climbing from the audience's tiers from then on. */
  private flyBalloons(dt: number): void {
    if (this.bunch) {
      // The weight and its strings swell and are gone, the way everything leaves, as the three balloons they held go up.
      const leave = this.toRelease > 0 || this.balloons.length > 0 ? clamp01((this.time - (this.celebrating ?? this.time) - 0.25) / 0.16) : 0;
      this.bunch.scale.setScalar(Math.max(0.001, leave < 0.3 ? 1 + 0.08 * (leave / 0.3) : 1.08 * (1 - (leave - 0.3) / 0.7)));
      this.bunch.visible = leave < 1;
    }
    const flying = this.toRelease > 0 || this.balloons.length > 0;
    if (flying) {
      this.releaseIn -= dt;
      if (this.releaseIn <= 0) {
        // The first flight goes up almost together; after it one follows another for as long as the podium stands.
        this.releaseIn = this.toRelease > 1 ? 0.14 : BALLOONS.every;
        this.toRelease = Math.max(0, this.toRelease - 1);
        const side = this.balloons.length % 2 === 0 ? -1 : 1;
        const spare = this.balloons.find(balloon => this.time - balloon.born > (BALLOONS.high - balloon.from) / balloon.climb);
        const balloon = spare ?? { view: this.model.part(BALLOON_KINDS[this.balloons.length % BALLOON_KINDS.length]!), x: 0, z: 0, from: 0, born: 0, climb: 1, sway: 0 };
        if (!spare) {
          this.balloons.push(balloon);
          this.group.add(balloon.view);
        }
        const tied = spare ? undefined : BALLOONS.tied[this.balloons.length - 1];
        Object.assign(balloon, {
          x: tied?.x ?? side * (BALLOONS.from + Math.random() * (BALLOONS.to - BALLOONS.from)),
          z: tied?.z ?? BALLOONS.back - Math.random() * 0.2,
          from: tied?.y ?? BALLOONS.low + Math.random() * 0.4,
          born: this.time,
          climb: BALLOONS.climb * (0.8 + Math.random() * 0.5),
          sway: Math.random() * 6,
        });
      }
    }
    for (const balloon of this.balloons) {
      const age = this.time - balloon.born;
      const y = balloon.from + age * balloon.climb;
      // Each grows as it is let go and shrinks to nothing at the top of its climb.
      const size = backOut(clamp01(age / 0.3)) * clamp01((BALLOONS.high - y) / 2.5);
      balloon.view.visible = size > 0.001;
      balloon.view.position.set(balloon.x + Math.sin(age * 0.9 + balloon.sway) * 0.3, y, balloon.z);
      balloon.view.rotation.z = Math.sin(age * 1.3 + balloon.sway) * 0.16;
      balloon.view.scale.setScalar(Math.max(0.001, size));
    }
  }
}
