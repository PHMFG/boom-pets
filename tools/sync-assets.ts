// Copies the files the game ships from the unzipped Kenney packs into apps/web/public.
// Usage: node tools/sync-assets.ts   (run from anywhere; paths are relative to the repo root)
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = join(root, 'assets-raw');
const pub = join(root, 'apps/web/public');

function copyFiles(from: string, to: string, keep: (name: string) => boolean): number {
  if (!existsSync(from)) throw new Error(`Missing ${from}. Download and unzip the Kenney packs first (see assets-raw/README.md).`);
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from).filter(keep);
  for (const name of names) cpSync(join(from, name), join(to, name));
  return names.length;
}

const pets = join(raw, 'cube-pets/Models/GLB format');
const models = copyFiles(pets, join(pub, 'models/pets'), name => name.endsWith('.glb'));
// The GLBs reference this texture by relative path, so it must sit beside them.
const textures = copyFiles(join(pets, 'Textures'), join(pub, 'models/pets/Textures'), name => name.endsWith('.png'));
const skies = copyFiles(join(raw, 'skyboxes/Skyboxes'), join(pub, 'skyboxes'), name => /^skybox-(day|morning|night)\.png$/.test(name));

console.log(`Copied ${models} pet models, ${textures} texture, ${skies} skyboxes into apps/web/public`);
