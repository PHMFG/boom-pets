// Loads each pet model once and hands out independent, toon-shaded, outlined, animated copies.
import { AnimationMixer, Color, Mesh, type AnimationAction, type AnimationClip, type MeshToonMaterial, type Object3D, type ShaderMaterial, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { PET_CLIPS, PET_IDS, petModelUrl, type PetClip, type PetId } from '../../shared/pets';
import { colors } from '../../shared/tokens';
import { outlineMaterial, prepareOutline, toonMaterial } from './materials';

/** Outline thickness in model units: a band in the seat colour, and an ink line around that, like a sticker's edge. */
export const OUTLINE = 0.1;
export const INK_LINE = 0.055;

const loader = new GLTFLoader();
const sources = new Map<PetId, GLTF>();
const palettes = new Map<PetId, Color[]>();
let loading: Promise<void> | null = null;
/** Every pet uses the same small colour texture. */
let colormap: Texture | null = null;
let pixels: { data: Uint8ClampedArray; width: number; height: number } | null = null;

export const isPetId = (value: string): value is PetId => (PET_IDS as readonly string[]).includes(value);

/** Loads every pet model. Pets can be created synchronously once this resolves. `onProgress` hears the share loaded, 0 to 1. */
export function loadPets(onProgress?: (done: number) => void): Promise<void> {
  let loaded = 0;
  return (loading ??= Promise.all(
    PET_IDS.map(async id => {
      const gltf = await loader.loadAsync(petModelUrl(id));
      onProgress?.(++loaded / PET_IDS.length);
      sources.set(id, gltf);
      gltf.scene.traverse(node => {
        if (!(node instanceof Mesh)) return;
        prepareOutline(node.geometry);
        colormap ??= (node.material as { map?: Texture | null }).map ?? null;
      });
    }),
  ).then(() => undefined));
}

function colormapPixels() {
  if (pixels || !colormap?.image) return pixels;
  const image = colormap.image as HTMLImageElement | ImageBitmap;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  pixels = { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  return pixels;
}

/** The colours a pet is made of, most used first, for the cubes it shatters into. */
export function petPalette(id: PetId): Color[] {
  const known = palettes.get(id);
  if (known) return known;
  const counts = new Map<string, number>();
  const image = colormapPixels();
  sources.get(id)?.scene.traverse(node => {
    if (!(node instanceof Mesh) || !image) return;
    const uv = node.geometry.getAttribute('uv');
    for (let index = 0; uv && index < uv.count; index++) {
      const x = Math.min(image.width - 1, Math.max(0, Math.floor(uv.getX(index) * image.width)));
      const y = Math.min(image.height - 1, Math.max(0, Math.floor(uv.getY(index) * image.height)));
      const at = (y * image.width + x) * 4;
      const key = `${image.data[at]},${image.data[at + 1]},${image.data[at + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });
  const palette = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key]) => new Color(`rgb(${key})`));
  if (palette.length === 0) palette.push(new Color(1, 1, 1));
  palettes.set(id, palette);
  return palette;
}

export type PetInstance = {
  id: PetId;
  /** The model root. The mixer owns everything at or below it; code-driven motion goes on wrappers above. */
  model: Object3D;
  mixer: AnimationMixer;
  actions: Map<PetClip, AnimationAction>;
  body: MeshToonMaterial;
  /** The band in the seat colour, and the ink line around it. */
  outline: ShaderMaterial;
  ink: ShaderMaterial;
  dispose(): void;
};

/** A new copy of a pet. `loadPets` must have finished. */
export function createPet(id: PetId, outlineColor: string): PetInstance {
  const gltf = sources.get(id);
  if (!gltf) throw new Error(`Pet "${id}" is not loaded. Await loadPets() first.`);
  // The pets have no skeleton (rigid animated parts), so a plain deep clone keeps every clip working.
  const model = gltf.scene.clone(true);
  const body = toonMaterial({ map: colormap });
  const outline = outlineMaterial(outlineColor, OUTLINE);
  // The ink line is what separates a pet from whatever is behind it, whatever colour either is.
  const ink = outlineMaterial(colors.ink, OUTLINE + INK_LINE);
  const meshes: Mesh[] = [];
  model.traverse(node => {
    if (node instanceof Mesh) meshes.push(node);
  });
  for (const mesh of meshes) {
    mesh.material = body;
    mesh.castShadow = true;
    // The outline is a child sharing the geometry, so it follows every animated part by itself.
    for (const material of [outline, ink]) {
      const shell = new Mesh(mesh.geometry, material);
      shell.name = 'outline';
      mesh.add(shell);
    }
  }

  const mixer = new AnimationMixer(model);
  const byName = new Map<string, AnimationClip>(gltf.animations.map(clip => [clip.name, clip]));
  const actions = new Map<PetClip, AnimationAction>();
  for (const name of PET_CLIPS) {
    const clip = byName.get(name);
    if (!clip) throw new Error(`Pet "${id}" has no "${name}" clip. Run pnpm inspect:pets to see what the model ships.`);
    actions.set(name, mixer.clipAction(clip));
  }

  return {
    id,
    model,
    mixer,
    actions,
    body,
    outline,
    ink,
    // Geometry and the colour texture belong to the shared source; only this copy's materials and animation state are released.
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      model.removeFromParent();
      body.dispose();
      outline.dispose();
      ink.dispose();
    },
  };
}
