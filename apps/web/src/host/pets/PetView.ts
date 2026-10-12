// One pet on screen. The model plays its shipped clips; everything else (squash, lean, charge shake,
// dash stretch, hit spin, teeter, flail) is code-driven on wrapper groups above the model, so the
// two never fight:  root > yaw > lean > squash > jitter > model. Inside the model one more group is slipped in,
// between the legs and the body, so that a pet can turn its head (which is its body) to look at something.
import type { Pet } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, Group, Mesh, MeshBasicMaterial, RingGeometry, Sprite, SpriteMaterial, Vector3 } from 'three';
import { motion } from '../../shared/motion';
import type { PetClip, PetId } from '../../shared/pets';
import { colors } from '../../shared/tokens';
import { createPet, INK_LINE, isPetId, OUTLINE, type PetInstance } from '../render/assets';
import { bubbleTexture } from '../render/emoji';

/** Model units to metres. A pet is drawn a little wider than the body the simulation pushes around, so it reads from across a room. */
const MODEL_SCALE = 0.72;
/** A step up onto something is drawn as a rise when it is between these heights, in metres; and how fast it rises (a second). Lower is a tile's own bump, higher is a pet set down from the sky. */
const CLIMB = { least: 0.35, most: 1.2, rate: 20 };
/** How far above its feet a pet's head ends, for a pet of normal size. */
const HEAD = 2.38;
const STAND = tuning.pet.radius + tuning.pet.halfHeight;
const CROSSFADE = 0.12;
/**
 * Looking at something: how far the head turns to either side while standing and while running (radians), how far
 * it tips back to look up at something in the sky, how fast it turns (a second), and the angle past which a thing
 * is behind the pet and it does not try.
 */
const LOOK = { standing: 0.9, running: 0.35, up: 0.34, rate: 10, behind: 2.6, hold: motion.feel.lookHoldMs / 1000 };
/** Dizzy: how far it sways (radians), how fast the sway goes round (radians a second), and the seconds over which it wears off. */
const DAZE = { sway: 0.2, turn: 8, ease: 0.4 };
/** Fed up: how low it sinks and how far its head hangs (radians). */
const SLUMP = { squat: 0.86, nod: 0.3 };
/** How far a pet shudders from side to side while a hit holds its pose (metres), and how fast (radians a second). */
const RATTLE = { reach: 0.07, rate: 95 };
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
  /** How high the floor stands at a spot: a pet's ring lies on it. */
  floorY(x: number, z: number): number;
  /** Dancing because it won the round. */
  winner: boolean;
  /** Shaking its head because someone else did. */
  loser: boolean;
  /** Its phone dropped: it sleeps where it stands. */
  asleep: boolean;
  /** "Menos tremor e brilho" is on: nothing shudders. */
  gentle: boolean;
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
  /** Leaning into a run. A spring, so a pet that stops rocks back on its heels before it settles. */
  private readonly forward = new Spring(0, 190, 15);
  /** Between the legs and the body: turning it turns the head, and the feet stay where the pet is really facing. */
  private readonly neck = new Group();
  /** What it is looking at, for how much longer, and for how long nothing else may take its eye (something has just happened there). */
  private readonly gaze = { x: 0, z: 0, up: 0, left: 0, held: 0 };
  private headTurn = 0;
  private headTip = 0;
  /** Seconds of seeing stars still to come, and how dizzy it is drawn right now, 0 to 1. */
  private dizzy = 0;
  private swaying = 0;
  private mood: 'cheer' | 'slump' | null = null;
  private moodLeft = 0;
  /** Hops still to come after the one in the air. */
  private hops = 0;
  /** On its feet and in charge of itself: the only state in which it reacts to anything. */
  private steady = false;
  private wasDashing = false;
  private readonly bubbleSize = new Spring(0, 260, 16);
  private facing = 0;
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

    this.neck.rotation.order = 'YXZ';
    this.adopt();
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

  /**
   * Something to look at, in the world: the pet turns its head to it, and tips it back when it is `up` metres
   * over the floor. Called every frame for as long as the thing matters; the pet looks away soon after it stops.
   */
  watch(x: number, z: number, up = 0): void {
    if (this.gaze.held <= 0) Object.assign(this.gaze, { x, z, up, left: LOOK.hold });
  }

  /** Something has just happened over there: it looks that way for `seconds`, whatever else it was watching. */
  glanceAt(x: number, z: number, seconds: number): void {
    Object.assign(this.gaze, { x, z, up: 0, left: seconds, held: seconds });
  }

  /** A fright: it jumps on the spot, drawn up tall, and rears back. `strength` is 0 to 1. */
  startle(strength = 1): void {
    if (!this.steady) return;
    if (this.hop === 0) this.hopSpeed = 3.6 * strength;
    this.squat.speed += 5 * strength;
    this.forward.speed -= 4 * strength;
  }

  /** Sent flying: once it is back on its feet it sways and sees stars for that long. */
  daze(seconds: number): void {
    this.dizzy = Math.max(this.dizzy, seconds);
  }

  /** How dizzy it is right now, 0 to 1: the stage draws the stars going round its head. */
  get dazed(): number {
    return this.swaying;
  }

  /** Pleased with itself: two hops, and it nods along while it stands still. */
  cheer(seconds: number = motion.feel.cheerMs / 1000): void {
    this.mood = 'cheer';
    this.moodLeft = seconds;
    if (!this.steady) return;
    this.bounce(1);
    this.hops = 1;
  }

  /** Fed up: it sinks, hangs its head and shakes it, for as long as it stands still. */
  slump(seconds: number = motion.feel.slumpMs / 1000): void {
    this.mood = 'slump';
    this.moodLeft = seconds;
    if (this.steady) this.squat.speed -= 3;
  }

  /** Taking off: it stretches up off the floor. */
  leap(): void {
    this.squat.speed += 6;
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
      const rise = this.target.y - this.feet.y;
      if (this.catchUp > 0) this.feet.lerp(this.target, damp(40, dt));
      else if (pet.grounded && rise > CLIMB.least && rise < CLIMB.most) {
        // Up onto something taller than a tile (a sofa, in the lava game): a quick hop up, not a cut.
        this.feet.set(this.target.x, this.feet.y + rise * damp(CLIMB.rate, dt), this.target.z);
      } else this.feet.copy(this.target);
    }
    const speed = Math.hypot(pet.vx, pet.vz);
    const charging = pet.chargeTime > 0;
    const charge = Math.min(1, pet.chargeTime / tuning.dash.chargeTime);
    const warning = pet.chargeTime >= tuning.dash.warnAt;
    const dashing = pet.dashTime > 0;
    const carried = pet.carriedBy !== null;
    const airborne = !pet.grounded && !carried;
    const knocked = pet.authority < 0.45 && !dashing;
    this.steady = pet.grounded && !carried && !dashing && !knocked && !pet.falling && !context.asleep;
    const standing = this.steady && speed < 0.5 && !charging;
    // A mood waits for the pet to be on the floor: one dropped back in sulks once it has landed.
    if (pet.grounded) this.moodLeft = Math.max(0, this.moodLeft - dt);
    const mood = this.moodLeft > 0 ? this.mood : null;
    // The stars are for after the flight: being dizzy only wears off once it is back on its feet.
    if (this.steady && !frozen) this.dizzy = Math.max(0, this.dizzy - dt);
    this.swaying += ((this.steady ? Math.min(1, this.dizzy / DAZE.ease) : 0) - this.swaying) * damp(10, dt);

    this.playClip(this.chooseClip(pet, speed, context, mood), this.clipSpeed(pet, speed, context));
    if (!frozen) this.asset.mixer.update(dt);

    // Facing, plus the spin from a hit unwinding on top.
    this.facing = turn(this.facing, pet.facing, damp(18, dt));
    this.spin = Math.max(0, this.spin - dt * 17);
    this.glance *= Math.exp(-3 * dt);
    this.yaw.rotation.y = this.facing + this.spin + this.glance;
    this.look(speed, charging, mood === 'slump' && standing, dt);

    // Lean into the run and the dash; lean back while winding up a charge. Coming out of a dash it digs its heels in.
    const wantForward = dashing ? 0.5 : charging ? -0.14 * charge : Math.min(1, speed / tuning.pet.speed) * 0.17;
    if (this.wasDashing && !dashing && pet.grounded) {
      this.forward.speed -= 5;
      this.squat.speed -= 2.5;
      context.dust(this.feet.x + Math.sin(pet.facing) * 0.5, this.feet.z + Math.cos(pet.facing) * 0.5, 3);
    }
    this.wasDashing = dashing;
    const leanForward = this.forward.step(wantForward, dt);
    let wantSide = 0;
    if (pet.teeter) wantSide = Math.sin(time * 13) * 0.24;
    else if (carried) wantSide = Math.sin(time * 21) * 0.3;
    else if (pet.reachTime > 0) wantSide = Math.sin(time * 30) * 0.08;
    this.leanSide += (wantSide - this.leanSide) * damp(16, dt);
    // Knocked through the air or falling: tumble end over end.
    if ((knocked && airborne) || pet.falling) this.tumble += dt * (pet.falling ? 9 : 6);
    else this.tumble *= Math.exp(-9 * dt);
    // Dizzy: the whole pet sways round in a circle.
    const sway = this.swaying * DAZE.sway;
    this.lean.rotation.set(leanForward + this.tumble + Math.sin(time * DAZE.turn) * sway, 0, this.leanSide + Math.cos(time * DAZE.turn) * sway);

    // Squash and stretch, keeping volume: shorter means wider.
    if (pet.grounded && !this.wasGrounded) this.squat.speed -= Math.min(9, 2 + Math.abs(pet.vy) * 0.5);
    let wantSquat = 1;
    if (context.asleep) wantSquat = 0.84 + Math.sin(time * 1.6) * 0.03;
    else if (charging) wantSquat = 1 - 0.2 * charge;
    // Through the air it is drawn out along its way, up and down alike, so that the landing has something to squash.
    else if (airborne) wantSquat = 1 + Math.min(0.24, Math.abs(pet.vy) * 0.03);
    else if (pet.power === 'jelly') wantSquat = 1 + Math.sin(time * 9) * 0.14;
    else if (mood === 'slump' && standing) wantSquat = SLUMP.squat;
    const tall = Math.max(0.45, this.squat.step(wantSquat, dt));
    const long = Math.max(0.5, this.stretch.step(dashing ? 1.6 : 1, dt));
    const wide = 1 / Math.sqrt(tall * long);
    this.squash.scale.set(wide, tall, wide * long);

    // A visual hop for cheers and fidgets, on top of where physics puts the pet.
    if (this.hop > 0 || this.hopSpeed > 0) {
      this.hopSpeed -= 20 * dt;
      this.hop = Math.max(0, this.hop + this.hopSpeed * dt);
      if (this.hop === 0) {
        this.hopSpeed = 0;
        // A cheer is more than one hop: it lands, squashes and goes up again.
        if (this.hops > 0 && this.steady) {
          this.hops--;
          this.hopSpeed = 3.6;
          this.squat.speed += 3;
        } else this.hops = 0;
      }
    }

    // Charging: swell, and shake faster and faster. Past the warning it throbs instead.
    this.shake += dt * Math.PI * 2 * lerp(8, 30, charge);
    const tremble = charging ? 0.012 + 0.03 * charge : 0;
    // A hit that holds the pose makes it shudder on the spot: the pause is felt, not mistaken for a stall.
    const rattle = frozen && !context.gentle ? Math.sin(time * RATTLE.rate) * RATTLE.reach : 0;
    this.jitter.position.set(Math.sin(this.shake) * tremble + rattle, this.hop, Math.cos(this.shake * 1.3) * tremble);
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
    const ground = context.floorY(this.feet.x, this.feet.z);
    const onFloor = context.isFloor(this.feet.x, this.feet.z) && this.feet.y > ground - 0.4;
    this.ring.visible = onFloor && !carried;
    this.ring.position.y = ground + 0.045 - this.feet.y;
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

  /**
   * Turns the head toward whatever the stage said to watch, as far as a neck goes, and lets it hang when the
   * pet is fed up. Only a pet on its feet with nothing better to do looks around: one winding up a dash, flying
   * or carried faces where it is going.
   */
  private look(speed: number, charging: boolean, hangs: boolean, dt: number): void {
    this.gaze.left = Math.max(0, this.gaze.left - dt);
    this.gaze.held = Math.max(0, this.gaze.held - dt);
    let turnTo = 0;
    let tipTo = hangs ? SLUMP.nod : 0;
    if (this.gaze.left > 0 && this.steady && !charging && this.spin < 0.1) {
      const dx = this.gaze.x - this.feet.x;
      const dz = this.gaze.z - this.feet.z;
      const far = Math.hypot(dx, dz);
      const aside = Math.atan2(dx, dz) - this.facing - this.glance;
      const off = Math.atan2(Math.sin(aside), Math.cos(aside));
      const inSight = far > 0.3 && Math.abs(off) < LOOK.behind;
      if (inSight) turnTo = Math.max(-LOOK.standing, Math.min(LOOK.standing, off)) * (speed > 2.5 ? LOOK.running / LOOK.standing : 1);
      // Up at something in the sky: tipped back, and further the nearer overhead it is.
      if (this.gaze.up > 0 && inSight) tipTo = -LOOK.up * Math.min(1, Math.atan2(this.gaze.up, far + 0.5) / 1.2);
    }
    this.headTurn += (turnTo - this.headTurn) * damp(LOOK.rate, dt);
    this.headTip += (tipTo - this.headTip) * damp(LOOK.rate, dt);
    this.neck.rotation.set(this.headTip, this.headTurn, 0);
  }

  /** Takes the model in: sizes it, and slips the neck in between its legs and its body. */
  private adopt(): void {
    this.asset.model.scale.setScalar(MODEL_SCALE);
    this.jitter.add(this.asset.model);
    // The clips are bound to the body itself, so they go on playing wherever it hangs in the tree.
    const body = this.asset.model.getObjectByName('body');
    // The body of the model it was before goes with that model.
    this.neck.clear();
    if (!body?.parent) return;
    body.parent.add(this.neck);
    this.neck.add(body);
  }

  private chooseClip(pet: Pet, speed: number, context: PetContext, mood: 'cheer' | 'slump' | null): PetClip {
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
    if (context.loser) return 'gesture-negative';
    if (mood === 'cheer') return 'gesture-positive';
    if (mood === 'slump' || this.swaying > 0.3) return 'gesture-negative';
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
    this.adopt();
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
