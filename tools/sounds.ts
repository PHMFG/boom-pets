// Converts the impact sounds the game uses from the Kenney pack (Ogg) to AAC, which every browser plays.
// Usage: node tools/sounds.ts   (needs ffmpeg and the unzipped pack in assets-raw/impact-sounds)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'assets-raw/impact-sounds/Audio');
const target = join(root, 'apps/web/public/sounds');

/** Name in the game: file in the pack. Several takes of one sound are picked at random when played. */
const SOUNDS: Record<string, string> = {
  hit1: 'impactPunch_heavy_000', hit2: 'impactPunch_heavy_001', hit3: 'impactPunch_heavy_002',
  bump1: 'impactPunch_medium_000', bump2: 'impactPunch_medium_001',
  land1: 'impactSoft_heavy_000', land2: 'impactSoft_heavy_001',
  wood1: 'impactWood_heavy_000', wood2: 'impactWood_heavy_001',
  crack1: 'impactMining_000', crack2: 'impactMining_001',
  clang: 'impactPlate_heavy_000', lever: 'impactMetal_heavy_000', glass: 'impactGlass_heavy_000',
  ding: 'impactBell_heavy_000', tick: 'impactTin_medium_000',
};

if (!existsSync(source)) {
  console.error(`Missing ${source}. Download and unzip the Impact Sounds pack first (see assets-raw/README.md).`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
for (const [name, file] of Object.entries(SOUNDS)) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(source, `${file}.ogg`), '-c:a', 'aac', '-b:a', '96k', join(target, `${name}.m4a`)]);
}
console.log(`Converted ${Object.keys(SOUNDS).length} sounds into apps/web/public/sounds`);
