// The toy look: flat toon shading in three steps, and thick outlines drawn as an inflated back-facing copy.
import { colors } from '../../shared/tokens';
import {
  BackSide,
  BufferAttribute,
  Color,
  DataTexture,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  ShaderMaterial,
  type BufferGeometry,
  type Texture,
} from 'three';

let ramp: DataTexture | null = null;

/** Three brightness steps instead of a smooth gradient. */
export function toonRamp(): DataTexture {
  if (!ramp) {
    ramp = new DataTexture(new Uint8Array([120, 200, 255]), 3, 1, RedFormat);
    ramp.minFilter = ramp.magFilter = NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}

export function toonMaterial(options: { color?: string; map?: Texture | null } = {}): MeshToonMaterial {
  return new MeshToonMaterial({ color: options.color ?? colors.white, map: options.map ?? null, gradientMap: toonRamp() });
}

const prepared = new WeakSet<BufferGeometry>();

/**
 * Adds an `outlineNormal` attribute: the average normal of every vertex at the same position.
 * Cube-like models have a separate normal per face, so pushing along the real normals would
 * split the outline apart at every edge. The averaged ones keep it in one piece.
 */
export function prepareOutline(geometry: BufferGeometry): void {
  if (prepared.has(geometry)) return;
  prepared.add(geometry);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return;
  const sums = new Map<string, [number, number, number]>();
  const keyOf = (index: number) => `${position.getX(index).toFixed(3)},${position.getY(index).toFixed(3)},${position.getZ(index).toFixed(3)}`;
  for (let index = 0; index < position.count; index++) {
    const sum = sums.get(keyOf(index)) ?? [0, 0, 0];
    sum[0] += normal.getX(index);
    sum[1] += normal.getY(index);
    sum[2] += normal.getZ(index);
    sums.set(keyOf(index), sum);
  }
  const smooth = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const [x, y, z] = sums.get(keyOf(index))!;
    const length = Math.hypot(x, y, z) || 1;
    smooth.set([x / length, y / length, z / length], index * 3);
  }
  geometry.setAttribute('outlineNormal', new BufferAttribute(smooth, 3));
}

/** Draws only back faces, pushed outward, in one flat colour: the object's outline. */
export function outlineMaterial(color: string, thickness: number): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    uniforms: { color: { value: new Color(color) }, thickness: { value: thickness } },
    vertexShader: `
      attribute vec3 outlineNormal;
      uniform float thickness;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + outlineNormal * thickness, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
