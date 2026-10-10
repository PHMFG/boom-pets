// Everything on the platform that is not a pet: barrels, the Mystery Cube, meteors, ghosts,
// slot reels, the capsule machine, pop-up words and the podium. All built from simple shapes.
import type { Barrel, Cube, GachaView, Ghost, Meteor, PowerId, Tier } from '@boom/game';
import { tuning } from '@boom/game';
import {
  BackSide,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  type Camera,
  type MeshToonMaterial,
} from 'three';
import type { PetId } from '../../shared/pets';
import { POWER_ICON, TIER_COLOR } from '../../shared/powers';
import { colors, seats as seatTokens } from '../../shared/tokens';
import { createPet, type PetInstance } from '../render/assets';
import { labelTexture, tileTexture } from '../render/emoji';
import { toonMaterial } from '../render/materials';
import { Word3D } from '../render/Text3D';

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const backOut = (t: number, strength = 2.2) => 1 + (strength + 1) * (t - 1) ** 3 + strength * (t - 1) ** 2;
const ink = new MeshBasicMaterial({ color: colors.ink });
const inkShell = new MeshBasicMaterial({ color: colors.ink, side: BackSide });
export const seatColor = (seat: number): string => seatTokens[seat % seatTokens.length]!.color;

// ── Barrel ───────────────────────────────────────────────────────────────────

const barrelBody = new CylinderGeometry(tuning.barrel.radius, tuning.barrel.radius, tuning.barrel.halfHeight * 2, 18);
const barrelBand = new CylinderGeometry(tuning.barrel.radius + 0.03, tuning.barrel.radius + 0.03, 0.09, 18);

export class BarrelView {
  readonly group = new Group();
  private readonly body: MeshToonMaterial = toonMaterial({ color: colors.danger });
  private readonly bobOffset = Math.random() * 6;
  private age = 0;

  constructor() {
    const body = new Mesh(barrelBody, this.body);
    body.castShadow = true;
    const shell = new Mesh(barrelBody, inkShell);
    shell.scale.set(1.12, 1.06, 1.12);
    this.group.add(body, shell);
    for (const height of [-0.26, 0.26]) {
      const band = new Mesh(barrelBand, ink);
      band.position.y = height;
      this.group.add(band);
    }
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
const cubeBox = new BoxGeometry(0.85, 0.85, 0.85);
const cubeChute = new ConeGeometry(0.9, 0.7, 10, 1, true);
const cubeBeam = new CylinderGeometry(0.28, 0.28, 14, 10, 1, true);
const chuteMaterial = toonMaterial({ color: colors.cream });
const beamMaterial = new MeshBasicMaterial({ color: new Color(colors.gold).multiplyScalar(1.5), transparent: true, opacity: 0.22, depthWrite: false });

export class CubeView {
  readonly group = new Group();
  private readonly box = new Group();
  private readonly chute: Mesh;
  private readonly face = new MeshBasicMaterial({ map: labelTexture('?', colors.gold, colors.ink) });
  private age = 0;

  constructor() {
    const box = new Mesh(cubeBox, this.face);
    const shell = new Mesh(cubeBox, inkShell);
    shell.scale.setScalar(1.12);
    this.box.add(box, shell);
    this.chute = new Mesh(cubeChute, chuteMaterial);
    this.chute.position.y = 1.5;
    // A column of light so the cube can be found from across the room.
    const beam = new Mesh(cubeBeam, beamMaterial);
    beam.position.y = 7;
    this.group.add(this.box, this.chute, beam);
  }

  update(cube: Cube, dt: number, time: number): void {
    this.age += dt;
    this.group.position.set(cube.x, cube.y + (cube.landed ? Math.sin(time * 3) * 0.12 : 0), cube.z);
    this.box.rotation.set(0, time * 1.8, cube.landed ? 0 : Math.sin(time * 5) * 0.2);
    // The question mark pulses, slowly.
    this.box.scale.setScalar((this.age < 0.3 ? backOut(this.age / 0.3) : 1) * (1 + Math.sin(time * 4) * 0.06));
    this.chute.visible = !cube.landed;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.face.dispose();
  }
}

// ── Meteor ───────────────────────────────────────────────────────────────────

const rock = new IcosahedronGeometry(0.75, 0);
/** Brighter than white, so the bloom makes it burn. */
const rockMaterial = new MeshBasicMaterial({ color: new Color(colors.danger).multiplyScalar(2.6) });

export class MeteorView {
  readonly group = new Group();

  constructor() {
    this.group.add(new Mesh(rock, rockMaterial));
  }

  /** Falls along a slant and speeds up, arriving exactly as the timer hits zero. */
  update(meteor: Meteor, time: number): void {
    const t = 1 - clamp01(meteor.left / meteor.total);
    const fall = t * t;
    this.group.position.set(meteor.x + (1 - fall) * 7, (1 - fall) * 30, meteor.z - (1 - fall) * 5);
    this.group.rotation.set(time * 7, time * 5, 0);
    this.group.scale.setScalar(meteor.radius * 0.5);
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
    // The ring is small while the meteor recharges and full size, turning, when it is ready.
    const ready = ghost.cooldown === 0;
    const charge = ghost.cooldownTotal > 0 ? 1 - ghost.cooldown / ghost.cooldownTotal : 1;
    this.group.children[1]!.scale.setScalar(ready ? 1 + Math.sin(time * 6) * 0.06 : 0.35 + 0.65 * charge);
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
    for (let index = 0; index < 3; index++) {
      const material = new MeshBasicMaterial({ map: tileTexture(ALL_ICONS[index]!, colors.cream) });
      const mesh = new Mesh(reelBox, material);
      mesh.position.x = (index - 1) * 0.52;
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
  private readonly capsule: Mesh;
  private readonly capsuleMaterial = new MeshBasicMaterial({ color: colors.steel });
  private landed = false;
  private readonly tint = new Color();

  constructor() {
    const base = new Mesh(new BoxGeometry(1.5, 1.1, 1.3), toonMaterial({ color: colors.danger }));
    base.position.y = 0.55;
    const baseShell = new Mesh(base.geometry, inkShell);
    baseShell.position.copy(base.position);
    baseShell.scale.setScalar(1.07);
    const globe = new Mesh(new SphereGeometry(0.85, 20, 14), new MeshBasicMaterial({ color: colors.tierRare, transparent: true, opacity: 0.4, depthWrite: false }));
    globe.position.y = 1.75;
    const globeShell = new Mesh(globe.geometry, inkShell);
    globeShell.position.copy(globe.position);
    globeShell.scale.setScalar(1.06);
    const cap = new Mesh(new CylinderGeometry(0.4, 0.5, 0.25, 14), toonMaterial({ color: colors.gold }));
    cap.position.y = 2.65;
    this.machine.add(baseShell, base, globeShell, globe, cap);
    // Capsules waiting inside the globe.
    RAINBOW.forEach((color, index) => {
      const ball = new Mesh(new SphereGeometry(0.2, 10, 8), toonMaterial({ color }));
      const angle = (index / RAINBOW.length) * Math.PI * 2;
      ball.position.set(Math.sin(angle) * 0.42, 1.45 + (index % 2) * 0.3, Math.cos(angle) * 0.42);
      this.machine.add(ball);
    });
    const chute = new Mesh(new BoxGeometry(0.5, 0.4, 0.2), ink);
    chute.position.set(0, 0.35, 0.68);
    const handle = new Mesh(new BoxGeometry(0.12, 0.9, 0.12), ink);
    handle.position.y = 0.45;
    const knob = new Mesh(new SphereGeometry(0.2, 12, 10), toonMaterial({ color: colors.gold }));
    knob.position.y = 0.95;
    this.lever.add(handle, knob);
    this.lever.position.set(0.9, 0.7, 0);
    this.machine.add(chute, this.lever);

    this.capsule = new Mesh(new SphereGeometry(0.42, 16, 12), this.capsuleMaterial);
    const capsuleBand = new Mesh(new TorusGeometry(0.42, 0.05, 6, 20), ink);
    capsuleBand.rotation.x = Math.PI / 2;
    this.capsule.add(capsuleBand);
    this.group.add(this.machine, this.capsule);
    this.group.visible = false;
  }

  update(gacha: GachaView | null, x: number, z: number, time: number): void {
    if (!gacha || gacha.time < tuning.gacha.machineAt) {
      this.group.visible = false;
      this.landed = false;
      return;
    }
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
    this.capsule.visible = gacha.time >= leverUntil && gacha.time < revealAt;
    const shake = reveal * 0.12;
    this.capsule.position.set(Math.sin(time * 70) * shake, 0.5 + backOut(out) * 0.9 + Math.cos(time * 63) * shake, 1.3);
    this.capsule.scale.setScalar(1 + reveal * 0.5);
    if (reveal < 0.4) this.tint.set(colors.steel);
    else if (reveal < 0.7) this.tint.set(colors.gold).multiplyScalar(1.6);
    else this.tint.set(RAINBOW[Math.floor(time * 12) % RAINBOW.length]!).multiplyScalar(2);
    this.capsuleMaterial.color.copy(this.tint);
  }

  /** Where the capsule bursts, for the particles. */
  get capsulePosition(): { x: number; y: number; z: number } {
    return { x: this.group.position.x, y: 1.4, z: this.group.position.z + 1.3 };
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

/** The end of a match: three steps rise from the floor and the top three pets celebrate on them. */
export class Podium {
  readonly group = new Group();
  private readonly pets: { pet: PetInstance; holder: Group; place: number }[] = [];
  private readonly steps: Mesh[] = [];
  private time = 0;

  constructor(top: { seat: number; model: PetId }[]) {
    top.slice(0, 3).forEach((entry, place) => {
      const height = STEP_HEIGHTS[place]!;
      const step = new Mesh(new BoxGeometry(1.7, height, 1.7), toonMaterial({ color: seatColor(entry.seat) }));
      step.position.set(STEP_X[place]!, height / 2, 0);
      step.castShadow = true;
      const shell = new Mesh(step.geometry, inkShell);
      shell.scale.set(1.05, 1.03, 1.05);
      step.add(shell);
      this.steps.push(step);

      const pet = createPet(entry.model, seatColor(entry.seat));
      pet.model.scale.setScalar(0.62);
      // First place dances; the others clap along.
      pet.actions.get(place === 0 ? 'dance' : 'gesture-positive')?.play();
      const holder = new Group();
      holder.position.set(STEP_X[place]!, height, 0);
      holder.add(pet.model);
      this.pets.push({ pet, holder, place });
      this.group.add(step, holder);
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.steps.forEach((step, place) => {
      // Third place rises first, the winner last.
      const t = clamp01((this.time - (2 - place) * 0.25) / 0.35);
      step.scale.y = Math.max(0.001, backOut(t, 1.4));
      step.position.y = (STEP_HEIGHTS[place]! * step.scale.y) / 2;
    });
    for (const { pet, holder, place } of this.pets) {
      const t = clamp01((this.time - (2 - place) * 0.25 - 0.2) / 0.3);
      holder.scale.setScalar(backOut(t));
      holder.position.y = STEP_HEIGHTS[place]! * this.steps[place]!.scale.y + (place === 0 ? Math.abs(Math.sin(this.time * 6)) * 0.35 : 0);
      pet.mixer.update(dt);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.pets.forEach(({ pet }) => pet.dispose());
    this.steps.forEach(step => {
      step.geometry.dispose();
      (step.material as MeshToonMaterial).dispose();
    });
  }
}
