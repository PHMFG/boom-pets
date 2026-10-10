// One pet on screen. The model plays its shipped clips; everything else (squash, lean, charge shake,
// dash stretch, hit spin, teeter, flail) is code-driven on wrapper groups above the model, so the
// two never fight:  root > yaw > lean > squash > jitter > model.
import type { Pet } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, Group, Mesh, MeshBasicMaterial, RingGeometry, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { PetClip, PetId } from '../../shared/pets';
import { colors } from '../../shared/tokens';
import { createPet, INK_LINE, isPetId, OUTLINE, type PetInstance } from '../render/assets';
import { bubbleTexture } from '../render/emoji';

/** Model units to metres. A pet is drawn a little wider than the body the simulation pushes around, so it reads from across a room. */
const MODEL_SCALE = 0.72;
/** How far above its feet a pet's head ends, for a pet of normal size. */
const HEAD = 2.38;
const STAND = tuning.pet.radius + tuning.pet.halfHeight;
const CROSSFADE = 0.12;
const ring = new RingGeometry(0.66, 0.94, 40).rotateX(-Math.PI / 2);
/** The ink edge of the ring: a wider ring lying just under it. */
const ringEdge = new RingGeometry(0.59, 1.01, 40).rotateX(-Math.PI / 2);
const ringInk = new MeshBasicMaterial({ color: colors.ink, toneMapped: false });
/** The gauge is an arc around the ring, drawn from the side nearest the camera. How much of it shows is set on its geometry, so each pet has its own. */
const GAUGE_SEGMENTS = 48;
const gaugeArc = (inner: number, outer: number) => new RingGeometry(inner, outer, GAUGE_SEGMENTS, 1, -Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2);

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const turn = (from: number, to: number, amount: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

/** A damped spring: it overshoots, which a plain ease never does. That overshoot is what reads as "squashy". */
class Spring {
  value: number;
  speed = 0;
  private readonly stiffness: number;
  private readonly damping: number;

  constructor(value: number, stiffness: number, damping: number) {
    this.value = value;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  step(target: number, dt: number): number {
    // Two half steps keep it stable at low frame rates.
    for (let half = 0; half < 2; half++) {
      this.speed += ((target - this.value) * this.stiffness - this.speed * this.damping) * (dt / 2);
      this.value += this.speed * (dt / 2);
    }
    return this.value;
  }
}

export type PetContext = {
  dt: number;
  time: number;
  /** How far between the last two physics steps this frame falls, 0 to 1. */
  alpha: number;
  isFloor(x: number, z: number): boolean;
  /** Dancing because it won the round. */
  winner: boolean;
  /** Its phone dropped: it sleeps where it stands. */
  asleep: boolean;
  dust(x: number, z: number, count: number): void;
  steam(x: number, y: number, z: number): void;
  poof(x: number, y: number, z: number): void;
};

export class PetView {
  readonly root = new Group();
  readonly petId: number;
  readonly seat: number;
  /** Where the pet's feet are in the world, updated every frame. */
  readonly feet = new Vector3();
  model: PetId;
  height = 1;
  /** A tint the stage sets each frame for the active power. */
  readonly aura = new Color(0, 0, 0);

  private asset: PetInstance;
  private readonly seatColor: string;
  private readonly yaw = new Group();
  private readonly lean = new Group();
  private readonly squash = new Group();
  private readonly jitter = new Group();
  private readonly ringMaterial: MeshBasicMaterial;
  private readonly ring = new Group();
  private readonly gauge = new Group();
  private readonly gaugeFill = gaugeArc(1.07, 1.23);
  private readonly gaugeEdge = gaugeArc(1.02, 1.28);
  private readonly gaugeMaterial = new MeshBasicMaterial({ color: colors.white, toneMapped: false });
  private readonly gaugeSize = new Spring(0, 260, 18);
  private readonly bubble: Sprite;
  private clip: PetClip | null = null;
  private readonly size = new Spring(0, 170, 13);
  private readonly squat = new Spring(1, 300, 13);
  private readonly stretch = new Spring(1, 320, 18);
  private readonly bubbleSize = new Spring(0, 260, 16);
  private facing = 0;
  private leanForward = 0;
  private leanSide = 0;
  private spin = 0;
  private tumble = 0;
  private flash = 0;
  private freeze = 0;
  private shake = 0;
  private hop = 0;
  private hopSpeed = 0;
  private bubbleLeft = 0;
  private bubbleSticky = false;
  private fidgetIn = 2 + Math.random() * 4;
  private glance = 0;
  private wasGrounded = false;
  private wasTeeter = false;
  private catchUp = 0;
  private readonly target = new Vector3();
  private wasMoving = false;
  private dustIn = 0;
  private readonly warm = new Color();

  constructor(pet: Pet, seatColor: string) {
    this.petId = pet.id;
    this.seat = pet.seat;
    this.seatColor = seatColor;
    this.model = isPetId(pet.pet) ? pet.pet : 'fox';
    this.asset = createPet(this.model, seatColor);
    this.facing = pet.facing;

    // Unlit: the ring is exactly the colour of the player's phone screen.
    this.ringMaterial = new MeshBasicMaterial({ color: seatColor, toneMapped: false });
    const edge = new Mesh(ringEdge, ringInk);
    edge.position.y = -0.012;
    const gaugeEdge = new Mesh(this.gaugeEdge, ringInk);
    gaugeEdge.position.y = -0.012;
    this.gauge.add(gaugeEdge, new Mesh(this.gaugeFill, this.gaugeMaterial));
    this.ring.add(edge, new Mesh(ring, this.ringMaterial), this.gauge);
    this.bubble = new Sprite(new SpriteMaterial({ depthTest: false, transparent: true }));
    this.bubble.renderOrder = 5;
    this.bubble.visible = false;

    this.asset.model.scale.setScalar(MODEL_SCALE);
    this.jitter.add(this.asset.model);
    this.squash.add(this.jitter);
    this.lean.add(this.squash);
    this.yaw.add(this.lean);
    this.root.add(this.ring, this.yaw, this.bubble);
  }

  /** A hit: white flash, a squash, and a spin that unwinds. `strength` is 0 to 1. */
  hit(strength: number): void {
    this.flash = 1;
    this.squat.speed -= 5 + strength * 7;
    this.spin = Math.PI * 2 * Math.round(1 + strength * 2);
    this.tumble = strength * 1.2;
  }

  /** Holds the pose for a moment so a big hit registers. Position catches up afterwards. */
  hitStop(seconds: number): void {
    this.freeze = Math.max(this.freeze, seconds);
  }

  /** A little jump on the spot: a cheer, a honk, a fidget. */
  bounce(strength = 1): void {
    if (this.hop === 0) this.hopSpeed = 4.2 * strength;
    this.squat.speed += 3 * strength;
  }

  /** Shows an emoji in a speech bubble. With `sticky` it stays until `clearEmote`. */
  emote(emoji: string, seconds = 1.4, sticky = false): void {
    const material = this.bubble.material;
    if (material.map !== bubbleTexture(emoji)) {
      material.map = bubbleTexture(emoji);
      material.needsUpdate = true;
    }
    this.bubble.visible = true;
    this.bubbleLeft = seconds;
    this.bubbleSticky = sticky;
  }

  clearEmote(): void {
    this.bubbleSticky = false;
    this.bubbleLeft = Math.min(this.bubbleLeft, 0);
  }

  update(pet: Pet, context: PetContext): void {
    const { dt, time } = context;

    if (pet.pet !== this.model && isPetId(pet.pet)) this.swapModel(pet.pet, context);

    // Hit-stop holds the whole pose, including where the pet is drawn.
    const wasFrozen = this.freeze > 0;
    this.freeze = Math.max(0, this.freeze - dt);
    const frozen = this.freeze > 0;
    if (wasFrozen && !frozen) this.catchUp = 0.12;
    this.catchUp = Math.max(0, this.catchUp - dt);
    if (!frozen) {
      this.target.set(lerp(pet.px, pet.x, context.alpha), lerp(pet.py, pet.y, context.alpha) - STAND * pet.scale, lerp(pet.pz, pet.z, context.alpha));
      // Just out of a hit-stop the pet glides to where it really is instead of snapping there.
      if (this.catchUp > 0) this.feet.lerp(this.target, damp(40, dt));
      else this.feet.copy(this.target);
    }
    const speed = Math.hypot(pet.vx, pet.vz);
    const charging = pet.chargeTime > 0;
    const charge = Math.min(1, pet.chargeTime / tuning.dash.chargeTime);
    const warning = pet.chargeTime >= tuning.dash.warnAt;
    const dashing = pet.dashTime > 0;
    const carried = pet.carriedBy !== null;
    const airborne = !pet.grounded && !carried;
    const knocked = pet.authority < 0.45 && !dashing;

    this.playClip(this.chooseClip(pet, speed, context), this.clipSpeed(pet, speed, context));
    if (!frozen) this.asset.mixer.update(dt);

    // Facing, plus the spin from a hit unwinding on top.
    this.facing = turn(this.facing, pet.facing, damp(18, dt));
    this.spin = Math.max(0, this.spin - dt * 17);
    this.glance *= Math.exp(-3 * dt);
    this.yaw.rotation.y = this.facing + this.spin + this.glance;

    // Lean into the run and the dash; lean back while winding up a charge.
    const wantForward = dashing ? 0.5 : charging ? -0.14 * charge : Math.min(1, speed / tuning.pet.speed) * 0.17;
    this.leanForward += (wantForward - this.leanForward) * damp(12, dt);
    let wantSide = 0;
    if (pet.teeter) wantSide = Math.sin(time * 13) * 0.24;
    else if (carried) wantSide = Math.sin(time * 21) * 0.3;
    else if (pet.reachTime > 0) wantSide = Math.sin(time * 30) * 0.08;
    this.leanSide += (wantSide - this.leanSide) * damp(16, dt);
    // Knocked through the air or falling: tumble end over end.
    if ((knocked && airborne) || pet.falling) this.tumble += dt * (pet.falling ? 9 : 6);
    else this.tumble *= Math.exp(-9 * dt);
    this.lean.rotation.set(this.leanForward + this.tumble, 0, this.leanSide);

    // Squash and stretch, keeping volume: shorter means wider.
    if (pet.grounded && !this.wasGrounded) this.squat.speed -= Math.min(9, 2 + Math.abs(pet.vy) * 0.5);
    let wantSquat = 1;
    if (context.asleep) wantSquat = 0.84 + Math.sin(time * 1.6) * 0.03;
    else if (charging) wantSquat = 1 - 0.2 * charge;
    else if (airborne) wantSquat = 1 + Math.max(-0.16, Math.min(0.24, pet.vy * 0.03));
    else if (pet.power === 'jelly') wantSquat = 1 + Math.sin(time * 9) * 0.14;
    const tall = Math.max(0.45, this.squat.step(wantSquat, dt));
    const long = Math.max(0.5, this.stretch.step(dashing ? 1.6 : 1, dt));
    const wide = 1 / Math.sqrt(tall * long);
    this.squash.scale.set(wide, tall, wide * long);

    // A visual hop for cheers and fidgets, on top of where physics puts the pet.
    if (this.hop > 0 || this.hopSpeed > 0) {
      this.hopSpeed -= 20 * dt;
      this.hop = Math.max(0, this.hop + this.hopSpeed * dt);
      if (this.hop === 0) this.hopSpeed = 0;
    }

    // Charging: swell, and shake faster and faster. Past the warning it throbs instead.
    this.shake += dt * Math.PI * 2 * lerp(8, 30, charge);
    const tremble = charging ? 0.012 + 0.03 * charge : 0;
    this.jitter.position.set(Math.sin(this.shake) * tremble, this.hop, Math.cos(this.shake * 1.3) * tremble);
    const throb = warning ? 1 + Math.sin(time * Math.PI * 2 * 2.8) * 0.09 : 1;
    const fall = pet.falling ? Math.max(0.15, 1 + (pet.y + 1) / 9) : 1;
    const overall = Math.max(0, this.size.step(pet.scale, dt)) * (1 + 0.25 * charge) * throb * fall;
    this.yaw.scale.setScalar(overall);

    // White flash on a hit; a warm glow that builds with the charge; danger colour past the warning.
    this.flash *= Math.exp(-16 * dt);
    this.warm.set(warning ? colors.danger : colors.gold).multiplyScalar(charging ? 0.25 + 0.5 * charge : 0);
    this.asset.body.emissive.setScalar(this.flash * 1.6).add(this.warm).add(this.aura);
    (this.asset.outline.uniforms.color!.value as Color).set(warning ? colors.danger : this.seatColor);
    // The outline is part of the model, so it would grow with a giant into a slab. It is kept nearer the width everyone else's has.
    const thin = 1 / Math.sqrt(Math.max(1, overall));
    this.asset.outline.uniforms.thickness!.value = OUTLINE * thin;
    this.asset.ink.uniforms.thickness!.value = (OUTLINE + INK_LINE) * thin;

    this.root.position.copy(this.feet);
    this.height = HEAD * pet.scale * (1 + 0.25 * charge) + this.hop;

    // The seat ring stays flat on the floor under the pet, and hides when there is no floor there.
    const onFloor = context.isFloor(this.feet.x, this.feet.z) && this.feet.y > -0.4;
    this.ring.visible = onFloor && !carried;
    this.ring.position.y = 0.045 - this.feet.y;
    // The ring is how a player finds their pet, so it never changes colour or size. What A is doing is told by the
    // gauge around it: a white arc that fills while A is held (danger colour and throbbing past the warning), and a
    // grey arc that drains while A rests after a dash, like the one on the phone's A. No arc means A is ready.
    // White, because gold is one player's colour.
    const resting = pet.dashCooldownTotal > 0 ? pet.dashCooldown / pet.dashCooldownTotal : 0;
    this.ring.scale.setScalar(Math.max(0.001, this.size.value));
    const fill = charging ? charge : resting;
    const shown = Math.max(0, this.gaugeSize.step(fill > 0 ? 1 : 0, dt));
    this.gauge.visible = shown > 0.02;
    this.gauge.scale.setScalar(shown * throb);
    if (fill > 0) {
      this.gaugeMaterial.color.set(warning ? colors.danger : charging ? colors.white : colors.steel);
      const drawn = Math.max(1, Math.ceil(GAUGE_SEGMENTS * Math.min(1, fill))) * 6;
      this.gaugeFill.setDrawRange(0, drawn);
      this.gaugeEdge.setDrawRange(0, drawn);
    }

    this.updateBubble(pet, dt);
    this.footDust(pet, speed, context);
    if (charging && Math.random() < dt * (4 + charge * 16)) context.steam(this.feet.x, this.feet.y + this.height * 0.8, this.feet.z);
    this.fidget(pet, speed, charging, context);
    if (pet.teeter && !this.wasTeeter) this.emote('💦', 0.9);
    this.wasTeeter = pet.teeter;
    this.wasGrounded = pet.grounded;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.asset.dispose();
    this.ringMaterial.dispose();
    this.gaugeMaterial.dispose();
    this.gaugeFill.dispose();
    this.gaugeEdge.dispose();
    this.bubble.material.dispose();
  }

  private chooseClip(pet: Pet, speed: number, context: PetContext): PetClip {
    if (context.asleep) return 'static';
    if (pet.carriedBy !== null) return 'gesture-negative';
    if (pet.falling || (!pet.grounded && pet.authority < 0.6)) return 'run';
    if (pet.reachTime > 0) return 'eat';
    if (pet.dashTime > 0) return 'run';
    if (pet.chargeTime > 0) return 'idle';
    if (pet.teeter) return 'gesture-negative';
    if (speed > 3.2) return 'run';
    if (speed > 0.5) return 'walk';
    if (context.winner) return 'dance';
    return 'idle';
  }

  private clipSpeed(pet: Pet, speed: number, context: PetContext): number {
    if (context.asleep) return 0.3;
    if (pet.carriedBy !== null || pet.falling || pet.dashTime > 0) return 2.4;
    if (pet.chargeTime > 0) return 1 + 2.5 * Math.min(1, pet.chargeTime / tuning.dash.chargeTime);
    if (speed > 3.2) return 0.6 + speed / tuning.pet.speed;
    if (speed > 0.5) return 0.8 + speed / 3;
    return 1;
  }

  private playClip(clip: PetClip, rate: number): void {
    const next = this.asset.actions.get(clip);
    if (!next) return;
    next.timeScale = rate;
    if (clip === this.clip) return;
    const previous = this.clip ? this.asset.actions.get(this.clip) : undefined;
    next.reset().fadeIn(CROSSFADE).play();
    previous?.fadeOut(CROSSFADE);
    this.clip = clip;
  }

  private swapModel(model: PetId, context: PetContext): void {
    this.asset.dispose();
    this.asset = createPet(model, this.seatColor);
    this.asset.model.scale.setScalar(MODEL_SCALE);
    this.jitter.add(this.asset.model);
    this.model = model;
    this.clip = null;
    // Changing pet is a magic trick: a puff of smoke and the new one pops out of it.
    this.size.value = 0.2;
    context.poof(this.feet.x, this.feet.y + 0.6, this.feet.z);
  }

  private updateBubble(pet: Pet, dt: number): void {
    if (!this.bubbleSticky) this.bubbleLeft -= dt;
    const showing = this.bubbleSticky || this.bubbleLeft > 0;
    const size = Math.max(0, this.bubbleSize.step(showing ? 1 : 0, dt));
    this.bubble.visible = size > 0.02;
    this.bubble.scale.setScalar(size * 1.15);
    this.bubble.position.set(0.55 * pet.scale, this.height + 0.55, 0);
  }

  private footDust(pet: Pet, speed: number, context: PetContext): void {
    const moving = speed > 2.5 && pet.grounded;
    // A puff when setting off, when skidding to a stop, and a trickle while running flat out.
    if (moving !== this.wasMoving && pet.grounded) context.dust(this.feet.x, this.feet.z, 3);
    this.wasMoving = moving;
    this.dustIn -= context.dt;
    if (moving && speed > 5 && this.dustIn <= 0) {
      this.dustIn = 0.12;
      context.dust(this.feet.x, this.feet.z, 1);
    }
  }

  /** Standing still for a few seconds, a pet looks around or hops, so the platform never goes dead. */
  private fidget(pet: Pet, speed: number, busy: boolean, context: PetContext): void {
    if (speed > 0.3 || busy || !pet.grounded || pet.carriedBy !== null || context.asleep) {
      this.fidgetIn = 2.5 + Math.random() * 3.5;
      return;
    }
    this.fidgetIn -= context.dt;
    if (this.fidgetIn > 0) return;
    this.fidgetIn = 3 + Math.random() * 3;
    if (Math.random() < 0.5) this.bounce(0.7);
    else this.glance = (Math.random() < 0.5 ? -1 : 1) * 0.9;
  }
}
