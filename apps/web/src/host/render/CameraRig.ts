// The game camera: tilted 52 degrees down through a narrow lens. It stays as close as it can while keeping
// every point of interest in frame, so it moves in and out with the fight. It shakes with impacts, punches
// in on big moments, and for a beat it can leave the fight and look at one thing from lower down, the way
// a hero is shown: a round's winner, the podium.
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

const PITCH = MathUtils.degToRad(52);
/** The closest it comes. Any closer and a fight in the middle would have no edge of the platform in the picture, and the edge is what the fight is about. */
const MIN_DISTANCE = 16;
/**
 * What is kept in view around the outermost points: metres of floor to each side and toward the camera,
 * and, at the far side (the top of the picture), the height of a pet with its name tag over it.
 */
const MARGIN = { side: 1.7, near: 1.9, head: 4 };
/** It pulls back at once when someone is about to leave the picture and closes in gently, so it never pumps. */
const ZOOM_OUT = 5;
const ZOOM_IN = 1.4;
const FOLLOW = 3.2;
/** How fast it tips down to a hero's eye level and back up. */
const TIP = 2.6;
/** A hit's jolt: how hard the picture is thrown the way the hit went (metres a second for a jolt of 1), and the spring that brings it back. */
const JOLT = { throw: 14, stiffness: 150, damping: 14, most: 0.8 };
/** Seconds the camera takes to gather speed as a shot of one thing begins, and as it leaves one for the fight: it does not start at full tilt. */
const GATHER = 0.45;
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** A shot of one thing. `at` is asked every frame, so the thing may move. */
export type Shot = {
  at(): { x: number; y?: number; z: number };
  distance: number;
  seconds: number;
  /** Degrees down from level. The game's own angle (52) when left out; lower shows faces instead of heads. */
  pitch?: number;
  /** Radians a second to circle it, or */
  spin?: number;
  /** how far (radians) to swing from side to side in front of it, which keeps its face in view. */
  sway?: number;
};

export type Insets = { left: number; bottom: number; top: number };

export class CameraRig {
  readonly camera = new PerspectiveCamera(32, 1, 0.5, 400);
  /** 1 is full shake; "Menos tremor e brilho" lowers it. */
  shakeScale = 1;
  private readonly center = new Vector3();
  private readonly goal = new Vector3();
  private distance = 34;
  private goalDistance = 34;
  private yaw = 0;
  private trauma = 0;
  private punch = 0;
  private punchSpeed = 0;
  /** How far a hit has thrown the picture along the floor, and how fast it is moving. */
  private readonly lurch = { x: 0, z: 0, vx: 0, vz: 0 };
  private size = { width: 1, height: 1 };
  private insets: Insets = { left: 0, bottom: 0, top: 0 };
  private hold: (Shot & { left: number }) | null = null;
  private pitch = PITCH;
  private time = 0;
  /** How far the camera has gathered speed since a shot began or ended, 0 to 1. */
  private gathered = 1;

  setViewport(width: number, height: number, insets: Insets): void {
    this.size = { width, height };
    this.insets = insets;
    this.camera.aspect = width / height;
    // Shift the picture into the area the HUD leaves free: what the camera looks at lands in the middle of it.
    this.camera.setViewOffset(width, height, -insets.left / 2, (insets.bottom - insets.top) / 2, width, height);
  }

  /** Adds shake. 0.2 is a bump, 0.5 a barrel, 1 the biggest blast. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** A quick push toward the action that springs back. */
  punchIn(amount: number): void {
    this.punchSpeed -= amount * 9;
  }

  /**
   * A shove along the floor that springs back: the whole picture lurches the way a hit went, which a shake, going
   * every way at once, cannot say. `(dx, dz)` is the direction; `amount` is 0 to 1, a full-charge hit.
   */
  jolt(dx: number, dz: number, amount: number): void {
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return;
    this.lurch.vx += (dx / length) * amount * JOLT.throw;
    this.lurch.vz += (dz / length) * amount * JOLT.throw;
  }

  /** Looks at one spot for a while (a gacha, the podium), optionally circling it. */
  focus(x: number, z: number, distance: number, seconds: number, spin = 0): void {
    this.hold = { at: () => ({ x, z }), distance, seconds, left: seconds, spin };
  }

  /** Looks at one thing for a while, following it if it moves. The move there starts gently and gathers speed. */
  look(shot: Shot): void {
    this.hold = { ...shot, left: shot.seconds };
    this.gathered = 0;
  }

  /**
   * Starts a shot already in place, with no move from wherever the camera was: for when the picture is
   * hidden (behind the curtain between worlds) and a move would only be seen as its tail end.
   * `yaw` is the side it starts from, in radians round its subject. `back` starts it that many metres
   * farther off than the shot asks, so the one move left to see is a slow push in toward the subject;
   * with "less shake" on it starts where it will stay.
   */
  cut(shot: Shot, yaw = 0, back = 0): void {
    this.look(shot);
    const at = shot.at();
    this.center.set(at.x, at.y ?? 0.6, at.z);
    this.distance = shot.distance + (this.shakeScale < 1 ? 0 : back);
    this.pitch = MathUtils.degToRad(shot.pitch ?? MathUtils.radToDeg(PITCH));
    this.yaw = yaw;
    this.gathered = 1;
  }

  /** Back to framing the fight. `gently` is for leaving a shot of one thing between rounds: the way back up starts slowly, like the way down did. */
  release(gently = false): void {
    this.hold = null;
    if (gently) this.gathered = 0;
  }

  /** Frames the given points on the floor. Call once per frame. */
  frame(points: readonly { x: number; z: number }[], dt: number): void {
    this.time += dt;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    if (points.length === 0) minX = maxX = minZ = maxZ = 0;

    this.gathered = Math.min(1, this.gathered + dt / GATHER);
    // Slow away, then up to its usual pace.
    const pace = this.gathered * this.gathered * (3 - 2 * this.gathered);
    let pitch = PITCH;
    if (this.hold) {
      const hold = this.hold;
      hold.left -= dt;
      const at = hold.at();
      this.goal.set(at.x, at.y ?? 0.6, at.z);
      this.goalDistance = hold.distance;
      if (hold.pitch !== undefined) pitch = MathUtils.degToRad(hold.pitch);
      // Swinging keeps to the front of the thing; circling goes all the way round it. With "less shake" on, it does neither.
      if (this.shakeScale < 1) this.yaw += Math.atan2(Math.sin(-this.yaw), Math.cos(-this.yaw)) * damp(3 * pace, dt);
      else if (hold.sway) this.yaw += (Math.sin(this.time * 0.6) * hold.sway - this.yaw) * damp(2 * pace, dt);
      else this.yaw += (hold.spin ?? 0) * dt;
      if (hold.left <= 0) this.hold = null;
    } else {
      // The closest distance at which everything fits, worked out exactly. A point `z` metres nearer than what the
      // camera looks at and `y` metres up is `distance - y sin - z cos` from the lens, and must project inside the
      // free area. The far edge is fitted at head height and the near edge on the floor; where the camera looks
      // between them is chosen so both fit at the same distance.
      const sin = Math.sin(PITCH);
      const cos = Math.cos(PITCH);
      const slope = Math.tan(MathUtils.degToRad(this.camera.fov / 2));
      const freeWidth = Math.max(this.size.width - this.insets.left, 240);
      const freeHeight = Math.max(this.size.height - this.insets.bottom - this.insets.top, 240);
      const perHeight = this.size.height / (slope * freeHeight);
      const perWidth = this.size.height / (slope * freeWidth);
      const near = maxZ + MARGIN.near;
      const farTop = perHeight * (MARGIN.head * cos - minZ * sin) + MARGIN.head * sin + minZ * cos;
      const lookZ = (near * (perHeight * sin + cos) - farTop) / (2 * perHeight * sin);
      const halfWidth = (maxX - minX) / 2 + MARGIN.side;
      const forHeight = (near - lookZ) * (perHeight * sin + cos);
      const forWidth = halfWidth * perWidth + (near - lookZ) * cos;
      this.goal.set((minX + maxX) / 2, 0, lookZ);
      this.goalDistance = Math.max(MIN_DISTANCE, forHeight, forWidth);
      // Unwind any circling by the shortest way round.
      this.yaw += Math.atan2(Math.sin(-this.yaw), Math.cos(-this.yaw)) * damp(3 * pace, dt);
    }

    this.center.lerp(this.goal, damp(FOLLOW * pace, dt));
    this.distance += (this.goalDistance - this.distance) * damp((this.goalDistance > this.distance ? ZOOM_OUT : ZOOM_IN) * pace, dt);
    this.punchSpeed += (-this.punch * 90 - this.punchSpeed * 11) * dt;
    this.punch += this.punchSpeed * dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    // The jolt is a spring too, in two half steps so that a slow frame cannot fling it.
    const lurch = this.lurch;
    for (let half = 0; half < 2; half++) {
      lurch.vx += (-lurch.x * JOLT.stiffness - lurch.vx * JOLT.damping) * (dt / 2);
      lurch.vz += (-lurch.z * JOLT.stiffness - lurch.vz * JOLT.damping) * (dt / 2);
      lurch.x += lurch.vx * (dt / 2);
      lurch.z += lurch.vz * (dt / 2);
    }
    const thrown = Math.hypot(lurch.x, lurch.z);
    const held = (thrown > JOLT.most ? JOLT.most / thrown : 1) * this.shakeScale;

    this.pitch += (pitch - this.pitch) * damp(TIP * pace, dt);

    const distance = this.distance * (1 + this.punch);
    const flat = Math.cos(this.pitch) * distance;
    this.camera.position.set(this.center.x + Math.sin(this.yaw) * flat, this.center.y + Math.sin(this.pitch) * distance, this.center.z + Math.cos(this.yaw) * flat);
    this.camera.lookAt(this.center);
    // Moved after it has taken aim, so the picture slides and does not turn.
    this.camera.position.x += lurch.x * held;
    this.camera.position.z += lurch.z * held;
    // Shake grows with the square of trauma: small hits barely move the picture, big ones throw it.
    const shake = this.trauma * this.trauma * this.shakeScale;
    if (shake > 0.0005) {
      const wave = (speed: number, phase: number) => Math.sin(this.time * speed + phase);
      this.camera.position.x += wave(53, 0) * shake * 0.5;
      this.camera.position.y += wave(47, 1.7) * shake * 0.4;
      this.camera.rotation.z += wave(41, 3.1) * shake * 0.025;
    }
    this.camera.updateProjectionMatrix();
  }
}
