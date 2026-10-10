// The game camera: tilted 52 degrees down through a narrow lens. It keeps every point of interest
// in frame, shakes with impacts, punches in on big moments and can be pointed at one spot for a beat.
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

const PITCH = MathUtils.degToRad(52);
const MIN_DISTANCE = 17;
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export type Insets = { left: number; bottom: number };

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
  private insets: Insets = { left: 0, bottom: 0 };
  private hold: { x: number; z: number; distance: number; left: number; spin: number } | null = null;
  private time = 0;

  setViewport(width: number, height: number, insets: Insets): void {
    this.size = { width, height };
    this.insets = insets;
    this.camera.aspect = width / height;
    // Shift the picture into the area the HUD leaves free.
    const freeWidth = Math.max(width - insets.left, 240);
    const freeHeight = Math.max(height - insets.bottom, 240);
    this.camera.setViewOffset(width, height, -(width - freeWidth) / 2, (height - freeHeight) / 2, width, height);
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
      // Pulled a little toward the middle of the platform so the edges stay in view.
      this.goal.set(((minX + maxX) / 2) * 0.85, 0.6, ((minZ + maxZ) / 2) * 0.85);
      const halfWidth = (maxX - minX) / 2 + 2.2;
      const halfDepth = (maxZ - minZ) / 2 + 1.8;
      const slope = Math.tan(MathUtils.degToRad(this.camera.fov / 2));
      const freeWidth = Math.max(this.size.width - this.insets.left, 240);
      const freeHeight = Math.max(this.size.height - this.insets.bottom, 240);
      const forWidth = halfWidth / (slope * (freeWidth / this.size.height));
      const forHeight = (halfDepth * Math.sin(PITCH) + 1) / (slope * (freeHeight / this.size.height));
      this.goalDistance = Math.max(MIN_DISTANCE, Math.max(forWidth, forHeight) + halfDepth * Math.cos(PITCH));
      // Unwind any circling by the shortest way round.
      this.yaw += Math.atan2(Math.sin(-this.yaw), Math.cos(-this.yaw)) * damp(3, dt);
    }

    this.center.lerp(this.goal, damp(2.6, dt));
    this.distance += (this.goalDistance - this.distance) * damp(2.2, dt);
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
