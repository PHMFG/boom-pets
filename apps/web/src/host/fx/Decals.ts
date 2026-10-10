// Flat shapes on the floor, all in one draw call: shock rings that race outward, and the
// warnings that mark where something is about to land. A danger is always drawn on the floor first.
import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial } from 'three';

const CAPACITY = 96;
const HEIGHT = 0.03;

type Decal =
  | { kind: 'shock'; x: number; z: number; radius: number; color: Color; age: number; life: number }
  /** A striped disc that fills its outline as the timer runs down. */
  | { kind: 'warning'; x: number; z: number; radius: number; color: Color; age: number; life: number };

export class Decals {
  readonly mesh: InstancedMesh;
  private readonly colors = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  /** Per instance: inner radius, outer radius (both 0 to 1 of the quad), stripes on or off, unused. */
  private readonly shapes = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  private readonly items: Decal[] = [];
  private readonly matrix = new Matrix4();

  constructor() {
    const geometry = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.colors.setUsage(DynamicDrawUsage);
    this.shapes.setUsage(DynamicDrawUsage);
    geometry.setAttribute('decalColor', this.colors);
    geometry.setAttribute('decalShape', this.shapes);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      vertexShader: `
        attribute vec3 decalColor;
        attribute vec4 decalShape;
        varying vec2 vUv;
        varying vec3 vColor;
        varying vec4 vShape;
        void main() {
          vUv = uv;
          vColor = decalColor;
          vShape = decalShape;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        varying vec4 vShape;
        void main() {
          float distance = length(vUv - 0.5) * 2.0;
          float soft = fwidth(distance);
          float inside = smoothstep(vShape.x - soft, vShape.x + soft, distance) * (1.0 - smoothstep(vShape.y - soft, vShape.y + soft, distance));
          if (inside < 0.01) discard;
          // Hazard stripes: alternate bands of the colour and a darker version of it.
          float band = step(0.5, fract((vUv.x + vUv.y) * 7.0));
          vec3 color = mix(vColor, vColor * 0.45, band * vShape.z);
          gl_FragColor = vec4(color, inside);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new InstancedMesh(geometry, material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
  }

  /** A ring that expands to `radius` and thins away. */
  shock(x: number, z: number, radius: number, color: Color, seconds = 0.45): void {
    this.add({ kind: 'shock', x, z, radius, color, age: 0, life: seconds });
  }

  /** Marks where a blast of `radius` will land in `seconds`. */
  warning(x: number, z: number, radius: number, seconds: number, color: Color): void {
    this.add({ kind: 'warning', x, z, radius, color, age: 0, life: seconds });
  }

  update(dt: number): void {
    let count = 0;
    const write = (decal: Decal, inner: number, outer: number, stripes: number) => {
      if (count >= CAPACITY) return;
      this.matrix.makeScale(decal.radius, 1, decal.radius).setPosition(decal.x, HEIGHT + count * 0.0005, decal.z);
      this.mesh.setMatrixAt(count, this.matrix);
      this.colors.setXYZ(count, decal.color.r, decal.color.g, decal.color.b);
      this.shapes.setXYZW(count, inner, outer, stripes, 0);
      count++;
    };
    for (let index = this.items.length - 1; index >= 0; index--) {
      const decal = this.items[index]!;
      decal.age += dt;
      if (decal.age >= decal.life) {
        this.items.splice(index, 1);
        continue;
      }
      const t = decal.age / decal.life;
      if (decal.kind === 'shock') {
        const outer = 1 - (1 - t) ** 3;
        write(decal, Math.max(0, outer - 0.22 * (1 - t)), outer, 0);
      } else {
        // The outline shows the full reach at once; the striped fill grows until it meets it at impact.
        write(decal, 0.93, 1, 0);
        write(decal, 0, Math.max(0.05, t * 0.93), 1);
      }
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.shapes.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }

  private add(decal: Decal): void {
    if (this.items.length >= CAPACITY / 2) this.items.shift();
    this.items.push(decal);
  }
}
