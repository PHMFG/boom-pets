// All particles in two draw calls: cubes (debris, confetti, sparks) and round puffs (dust, smoke).
// Nothing fades: a particle pops in, lives, and shrinks to nothing.
import { Color, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, BoxGeometry, Euler, type BufferGeometry, type Material } from 'three';
import { toonMaterial } from '../render/materials';

export type Emit = {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Seconds. */
  life: number;
  size: number;
  /** Size at the end of life, before the final shrink. Defaults to `size`. */
  sizeEnd?: number;
  gravity?: number;
  /** Share of speed lost per second. */
  drag?: number;
  spin?: number;
  /** Bounces on the platform instead of falling through it. */
  bounce?: boolean;
  color: Color;
};

const FIELDS = 15;
const [X, Y, Z, VX, VY, VZ, AGE, LIFE, SIZE, SIZE_END, GRAVITY, DRAG, SPIN, ANGLE, BOUNCE] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

class Pool {
  readonly mesh: InstancedMesh;
  private readonly data: Float32Array;
  private readonly capacity: number;
  private count = 0;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler();

  constructor(geometry: BufferGeometry, material: Material, capacity: number) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * FIELDS);
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // Allocates the per-instance colour buffer up front.
    this.mesh.setColorAt(0, new Color(1, 1, 1));
  }

  emit(particle: Emit): void {
    // Full: the newest particle replaces the oldest slot rather than being dropped.
    const index = this.count < this.capacity ? this.count++ : Math.floor(Math.random() * this.capacity);
    this.data.set(
      [
        particle.x, particle.y, particle.z, particle.vx ?? 0, particle.vy ?? 0, particle.vz ?? 0, 0, particle.life,
        particle.size, particle.sizeEnd ?? particle.size, particle.gravity ?? 0, particle.drag ?? 0, particle.spin ?? 0,
        Math.random() * 6.28, particle.bounce ? 1 : 0,
      ],
      index * FIELDS,
    );
    this.mesh.setColorAt(index, particle.color);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    const data = this.data;
    for (let index = 0; index < this.count; index++) {
      const at = index * FIELDS;
      data[at + AGE]! += dt;
      if (data[at + AGE]! >= data[at + LIFE]!) {
        // Remove by moving the last particle into this slot.
        this.count--;
        data.copyWithin(at, this.count * FIELDS, (this.count + 1) * FIELDS);
        const moved = new Color();
        this.mesh.getColorAt(this.count, moved);
        this.mesh.setColorAt(index, moved);
        this.mesh.instanceColor!.needsUpdate = true;
        index--;
        continue;
      }
      const drag = Math.exp(-data[at + DRAG]! * dt);
      data[at + VX]! *= drag;
      data[at + VZ]! *= drag;
      data[at + VY] = data[at + VY]! * drag - data[at + GRAVITY]! * dt;
      data[at + X]! += data[at + VX]! * dt;
      data[at + Y]! += data[at + VY]! * dt;
      data[at + Z]! += data[at + VZ]! * dt;
      data[at + ANGLE]! += data[at + SPIN]! * dt;
      const size = data[at + SIZE]!;
      if (data[at + BOUNCE] === 1 && data[at + Y]! < size / 2 && data[at + VY]! < 0 && Math.abs(data[at + X]!) < 8 && Math.abs(data[at + Z]!) < 8) {
        data[at + Y] = size / 2;
        data[at + VY]! *= -0.45;
        data[at + VX]! *= 0.7;
        data[at + VZ]! *= 0.7;
        data[at + SPIN]! *= 0.6;
      }
      const t = data[at + AGE]! / data[at + LIFE]!;
      // Pop in over the first tenth, shrink away over the last third.
      const envelope = Math.min(1, t / 0.1) * (t > 0.67 ? (1 - t) / 0.33 : 1);
      const now = (size + (data[at + SIZE_END]! - size) * t) * envelope;
      const angle = data[at + ANGLE]!;
      this.euler.set(angle, angle * 0.7, angle * 0.4);
      this.matrix.compose(this.position.set(data[at + X]!, data[at + Y]!, data[at + Z]!), this.rotation.setFromEuler(this.euler), this.scale.setScalar(Math.max(now, 0.0001)));
      this.mesh.setMatrixAt(index, this.matrix);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as Material).dispose();
  }
}

export class Particles {
  readonly group = new Group();
  private readonly cubes = new Pool(new BoxGeometry(1, 1, 1), toonMaterial(), 2400);
  /** Unlit, so a colour brighter than white glows through the bloom. */
  private readonly sparks = new Pool(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 900);
  private readonly puffs = new Pool(new IcosahedronGeometry(0.5, 1), toonMaterial(), 500);
  /** Round and unlit: the bright heart of an explosion. */
  private readonly glows = new Pool(new IcosahedronGeometry(0.5, 2), new MeshBasicMaterial(), 64);

  constructor() {
    this.cubes.mesh.castShadow = true;
    this.group.add(this.cubes.mesh, this.sparks.mesh, this.puffs.mesh, this.glows.mesh);
  }

  cube(particle: Emit): void {
    this.cubes.emit(particle);
  }

  spark(particle: Emit): void {
    this.sparks.emit(particle);
  }

  puff(particle: Emit): void {
    this.puffs.emit(particle);
  }

  glow(particle: Emit): void {
    this.glows.emit(particle);
  }

  update(dt: number): void {
    this.cubes.update(dt);
    this.sparks.update(dt);
    this.puffs.update(dt);
    this.glows.update(dt);
  }

  dispose(): void {
    this.cubes.dispose();
    this.sparks.dispose();
    this.puffs.dispose();
    this.glows.dispose();
  }
}
