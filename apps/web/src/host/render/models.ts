// The game's own models, made in Blender (tools/blender, `pnpm models`): one file per map, holding its
// scenery and the templates its code places itself. A model carries no colour: every piece names a key of
// its map's palette in tokens.ts and is painted from there, toon shaded and outlined like everything else.
import { AnimationMixer, Color, Group, Mesh, MeshBasicMaterial, type Material, type MeshToonMaterial, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { colors, maps } from '../../shared/tokens';
import { outlineMaterial, prepareOutline, toonMaterial } from './materials';

/** The files in public/models/maps. Each is painted from the block of `maps` with the same name. */
export const MODEL_IDS = [
  'potato',
  'grow',
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

/** Outline thickness in metres for a piece that does not say (`tag(obj, outline=..)` in its script). */
const OUTLINE = 0.04;

const loader = new GLTFLoader();
const sources = new Map<ModelId, GLTF>();
let loading: Promise<void> | null = null;

/** Loads every model. They can be created synchronously once this resolves. `onProgress` hears the share loaded, 0 to 1. */
export function loadModels(onProgress?: (done: number) => void): Promise<void> {
  let loaded = 0;
  return (loading ??= Promise.all(
    MODEL_IDS.map(async id => {
      const gltf = await loader.loadAsync(`/models/maps/${id}.glb`);
      sources.set(id, gltf);
      gltf.scene.traverse(node => {
        if (node instanceof Mesh) prepareOutline(node.geometry);
      });
      onProgress?.(++loaded / MODEL_IDS.length);
    }),
  ).then(() => undefined));
}

export const modelsLoaded = (): boolean => sources.size === MODEL_IDS.length;

/** What a piece's script said about how to draw it. A piece joined from several colours keeps this on its parent. */
function setting(node: Object3D, key: 'outline' | 'glow' | 'shadow'): unknown {
  for (let at: Object3D | null = node; at; at = at.parent) {
    if (at.userData[key] !== undefined) return at.userData[key];
  }
  return undefined;
}

export class Model {
  /** Everything that is drawn where its script put it. */
  readonly scene: Group;
  private readonly parts = new Map<string, Object3D>();
  private readonly mixer: AnimationMixer;
  private readonly materials: Material[] = [];
  private readonly painted = new Map<string, Material>();
  private readonly outlines = new Map<number, Material>();
  private readonly palette: Record<string, string>;

  constructor(id: ModelId) {
    const source = sources.get(id);
    if (!source) throw new Error(`Model "${id}" is not loaded. Await loadModels() first.`);
    this.palette = { ...colors, ...(maps as Record<string, Record<string, string>>)[id] };
    this.scene = source.scene.clone(true) as Group;

    const meshes: Mesh[] = [];
    this.scene.traverse(node => {
      if (node instanceof Mesh) meshes.push(node);
    });
    for (const mesh of meshes) this.dress(mesh);

    // Templates leave the scene: the map's code asks for copies and places them itself.
    const templates: Object3D[] = [];
    this.scene.traverse(node => {
      if (node.userData.part) templates.push(node);
    });
    for (const template of templates) {
      template.removeFromParent();
      template.position.set(0, 0, 0);
      this.parts.set(template.name.replace(/^part_/, ''), template);
    }

    // Whatever was animated in Blender plays for ever, each clip at its own pace.
    this.mixer = new AnimationMixer(this.scene);
    for (const clip of source.animations) this.mixer.clipAction(clip).play();
  }

  /** A fresh copy of a template (an object passed to `part()` in the map's script), at the origin. */
  part(name: string): Object3D {
    const template = this.parts.get(name);
    if (!template) throw new Error(`The model has no part "${name}". It has: ${[...this.parts.keys()].join(', ')}`);
    return template.clone(true);
  }

  /** One of the things standing in the scene, by the name its script gave it. */
  node(name: string): Object3D | undefined {
    return this.scene.getObjectByName(name);
  }

  /**
   * Gives one copy a material of its own for one of its colours, so it can change (a bomb going red)
   * without every other piece of that colour changing with it.
   */
  own(root: Object3D, color: string): MeshToonMaterial | null {
    let found: MeshToonMaterial | null = null;
    root.traverse(node => {
      if (found || !(node instanceof Mesh) || node.userData.color !== color) return;
      found = (node.material as MeshToonMaterial).clone();
      node.material = found;
      this.materials.push(found);
    });
    return found;
  }

  /** Once a frame. */
  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** Frees this copy's materials. The shapes belong to the loaded file and stay. */
  dispose(): void {
    this.mixer.stopAllAction();
    for (const material of this.materials) material.dispose();
    this.scene.removeFromParent();
  }

  /** Paints one mesh from the palette and gives it its outline. */
  private dress(mesh: Mesh): void {
    const name = (mesh.material as Material).name;
    const glow = Number(setting(mesh, 'glow') ?? 0);
    mesh.userData.color = name;
    mesh.material = this.paint(name, glow);
    mesh.castShadow = glow === 0 && setting(mesh, 'shadow') !== false;
    mesh.receiveShadow = glow === 0;
    // A glowing thing has no outline unless its script asks for one: fire has no edge.
    const thickness = Number(setting(mesh, 'outline') ?? (glow > 0 ? 0 : OUTLINE));
    if (thickness <= 0) return;
    let outline = this.outlines.get(thickness);
    if (!outline) {
      outline = outlineMaterial(colors.ink, thickness);
      this.outlines.set(thickness, outline);
      this.materials.push(outline);
    }
    const shell = new Mesh(mesh.geometry, outline);
    shell.name = 'outline';
    mesh.add(shell);
  }

  private paint(name: string, glow: number): Material {
    const key = `${name}|${glow}`;
    let material = this.painted.get(key);
    if (!material) {
      const color = this.palette[name];
      if (!color) throw new Error(`A model names the colour "${name}", which is not in its palette in tokens.ts.`);
      // Brighter than white, so the glow picks it up.
      material = glow > 0 ? new MeshBasicMaterial({ color: new Color(color).multiplyScalar(glow) }) : toonMaterial({ color });
      this.painted.set(key, material);
      this.materials.push(material);
    }
    return material;
  }
}
