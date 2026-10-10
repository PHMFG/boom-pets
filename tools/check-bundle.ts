// Fails if the phone controller page downloads too much code, or picked up Three.js by accident.
// Usage: node tools/check-bundle.ts   (after pnpm build)
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET_BYTES = 150 * 1024;
const dist = join(dirname(fileURLToPath(import.meta.url)), '../apps/web/dist');
const manifestPath = join(dist, '.vite/manifest.json');
if (!existsSync(manifestPath)) {
  console.error('No build found. Run pnpm build first.');
  process.exit(1);
}

type Chunk = { file: string; imports?: string[]; css?: string[] };
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, Chunk>;
const entry = manifest['c/index.html'];
if (!entry) {
  console.error('The build has no controller page (c/index.html). Check build.rolldownOptions.input in vite.config.ts.');
  process.exit(1);
}

// Everything the page loads up front: its script, the chunks that script imports, and their stylesheets.
const files = new Set<string>();
const visit = (chunk: Chunk) => {
  if (files.has(chunk.file)) return;
  files.add(chunk.file);
  chunk.css?.forEach(file => files.add(file));
  chunk.imports?.forEach(key => manifest[key] && visit(manifest[key]));
};
visit(entry);

let total = 0;
let leaked = false;
for (const file of files) {
  const path = join(dist, file);
  const size = statSync(path).size;
  total += size;
  const hasThree = file.endsWith('.js') && readFileSync(path, 'utf8').includes('WebGLRenderer');
  leaked ||= hasThree;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${file}${hasThree ? '   <-- contains Three.js' : ''}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  controller total (budget ${BUDGET_BYTES / 1024} KB, before compression)`);

if (leaked) {
  console.error('The controller bundle contains Three.js. Something under src/controller or src/shared imports host code.');
  process.exit(1);
}
if (total > BUDGET_BYTES) {
  console.error('The controller bundle is over budget.');
  process.exit(1);
}
