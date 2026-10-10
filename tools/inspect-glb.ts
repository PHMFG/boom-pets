// Lists what each GLB in a folder contains: node tree, skins, animation clips, materials, textures, size.
// Usage: node tools/inspect-glb.ts <folder> [--json]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

type Gltf = {
  asset?: { generator?: string };
  scenes?: { nodes?: number[] }[];
  scene?: number;
  nodes?: { name?: string; children?: number[]; mesh?: number; skin?: number }[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; material?: number }[] }[];
  skins?: { joints: number[] }[];
  materials?: { name?: string }[];
  images?: { uri?: string; bufferView?: number }[];
  accessors?: { count: number; min?: number[]; max?: number[] }[];
  animations?: {
    name?: string;
    channels: { sampler: number; target: { node?: number; path: string } }[];
    samplers: { input: number; output: number }[];
  }[];
};

export type GlbReport = {
  file: string;
  generator: string;
  tree: string[];
  meshes: number;
  triangles: number;
  skins: number;
  joints: number;
  materials: string[];
  images: string[];
  size: [number, number, number];
  clips: { name: string; seconds: number; channels: number; paths: string[]; nodes: string[] }[];
};

function readGltfJson(path: string): Gltf {
  const bytes = readFileSync(path);
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB file`);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf;
}

function inspect(path: string, file: string): GlbReport {
  const gltf = readGltfJson(path);
  const nodes = gltf.nodes ?? [];
  const accessors = gltf.accessors ?? [];

  const tree: string[] = [];
  const walk = (index: number, depth: number) => {
    const node = nodes[index];
    if (!node) return;
    const tags = [node.mesh !== undefined ? 'mesh' : '', node.skin !== undefined ? 'skin' : ''].filter(Boolean).join(',');
    tree.push(`${'  '.repeat(depth)}${node.name ?? `#${index}`}${tags ? ` [${tags}]` : ''}`);
    node.children?.forEach(child => walk(child, depth + 1));
  };
  (gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? []).forEach(root => walk(root, 0));

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const position = accessors[primitive.attributes.POSITION ?? -1];
      if (!position) continue;
      triangles += position.count / 3;
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, position.min?.[axis] ?? Infinity);
        max[axis] = Math.max(max[axis]!, position.max?.[axis] ?? -Infinity);
      }
    }
  }

  const clips = (gltf.animations ?? []).map((animation, index) => {
    const seconds = Math.max(0, ...animation.samplers.map(sampler => accessors[sampler.input]?.max?.[0] ?? 0));
    const paths = [...new Set(animation.channels.map(channel => channel.target.path))].sort();
    const targets = [...new Set(animation.channels.map(channel => nodes[channel.target.node ?? -1]?.name ?? '?'))];
    return { name: animation.name ?? `clip-${index}`, seconds: Number(seconds.toFixed(3)), channels: animation.channels.length, paths, nodes: targets };
  });

  return {
    file,
    generator: gltf.asset?.generator ?? 'unknown',
    tree,
    meshes: gltf.meshes?.length ?? 0,
    triangles: Math.round(triangles),
    skins: gltf.skins?.length ?? 0,
    joints: (gltf.skins ?? []).reduce((sum, skin) => sum + skin.joints.length, 0),
    materials: (gltf.materials ?? []).map(material => material.name ?? '?'),
    images: (gltf.images ?? []).map(image => image.uri ?? '(embedded)'),
    size: [0, 1, 2].map(axis => Number((max[axis]! - min[axis]!).toFixed(3))) as [number, number, number],
    clips,
  };
}

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: node tools/inspect-glb.ts <folder> [--json]');
  process.exit(1);
}
const reports = readdirSync(folder).filter(name => name.endsWith('.glb')).sort().map(name => inspect(join(folder, name), name));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const report of reports) {
    console.log(`\n${report.file}  meshes=${report.meshes} tris~${report.triangles} skins=${report.skins} joints=${report.joints} size=${report.size.join('x')}`);
    console.log(`  materials: ${report.materials.join(', ') || '-'}   images: ${report.images.join(', ') || '-'}`);
    console.log(`  clips: ${report.clips.map(clip => `${clip.name} (${clip.seconds}s, ${clip.channels}ch, ${clip.paths.join('/')})`).join('; ') || 'NONE'}`);
  }
  const clipSets = new Map<string, string[]>();
  for (const report of reports) {
    const key = report.clips.map(clip => clip.name).sort().join(', ') || 'NONE';
    clipSets.set(key, [...(clipSets.get(key) ?? []), report.file]);
  }
  console.log(`\n${reports.length} files. Distinct clip sets: ${clipSets.size}`);
  for (const [key, files] of clipSets) console.log(`  [${files.length} files] ${key}`);
  const first = reports[0];
  if (first) console.log(`\nNode tree of ${first.file} (${first.generator}):\n${first.tree.join('\n')}`);
}
