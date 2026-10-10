// The game camera: tilted 52 degrees down through a narrow lens. It stays as close as it can while keeping
// every point of interest in frame, so it moves in and out with the fight. It shakes with impacts, punches
// in on big moments and can be pointed at one spot for a beat.
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
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

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
  private size = { width: 1, height: 1 };
  private insets: Insets = { left: 0, bottom: 0, top: 0 };
  private hold: { x: number; z: number; distance: number; left: number; spin: number } | null = null;
  private time = 0;

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

  /** Looks at one spot for a while (a gacha, a round winner), optionally circling it. */
  focus(x: number, z: number, distance: number, seconds: number, spin = 0): void {
    this.hold = { x, z, distance, left: seconds, spin };
  }

  release(): void {
    this.hold = null;
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

    if (this.hold) {
      this.hold.left -= dt;
      this.goal.set(this.hold.x, 0.6, this.hold.z);
      this.goalDistance = this.hold.distance;
      this.yaw += this.hold.spin * dt;
      if (this.hold.left <= 0) this.hold = null;
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
      this.yaw += Math.atan2(Math.sin(-this.yaw), Math.cos(-this.yaw)) * damp(3, dt);
    }

    this.center.lerp(this.goal, damp(FOLLOW, dt));
    this.distance += (this.goalDistance - this.distance) * damp(this.goalDistance > this.distance ? ZOOM_OUT : ZOOM_IN, dt);
    this.punchSpeed += (-this.punch * 90 - this.punchSpeed * 11) * dt;
    this.punch += this.punchSpeed * dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);

    const distance = this.distance * (1 + this.punch);
    const flat = Math.cos(PITCH) * distance;
    this.camera.position.set(this.center.x + Math.sin(this.yaw) * flat, this.center.y + Math.sin(PITCH) * distance, this.center.z + Math.cos(this.yaw) * flat);
    this.camera.lookAt(this.center);
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
