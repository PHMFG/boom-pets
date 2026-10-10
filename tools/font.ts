// Converts Lilita One into the typeface JSON that Three.js extrudes into 3D words.
// Only the characters the game shows are kept, and a missing glyph fails the build:
// Three.js would otherwise draw "?" in its place without any warning.
// Usage: node tools/font.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype, { type Command } from 'opentype.js';
import { strings } from '../apps/web/src/shared/strings.pt-BR.ts';

const here = dirname(fileURLToPath(import.meta.url));
const source = createRequire(import.meta.url).resolve('@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff');
const target = join(here, '../apps/web/src/host/render/fonts/lilita-one.typeface.json');

const bytes = readFileSync(source);
const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

// Score pop-ups and timers use digits and a few signs beyond the fixed words; the room code can be any letter.
const always = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-×!?.,:% ';
const wanted = new Set([...always, ...Object.values(strings.words3d).join('')]);

const missing = [...wanted].filter(char => char !== ' ' && font.charToGlyphIndex(char) === 0);
if (missing.length > 0) {
  console.error(`Lilita One has no glyph for: ${missing.join(' ')}. Change the wording in strings.pt-BR.ts or pick another font.`);
  process.exit(1);
}

const round = (value: number) => Math.round(value);
// Three.js expects "q endX endY controlX controlY" and "b endX endY c1X c1Y c2X c2Y" (see FontLoader.createPath).
function outline(commands: Command[]): string {
  const parts: (string | number)[] = [];
  for (const command of commands) {
    if (command.type === 'M') parts.push('m', round(command.x), round(command.y));
    else if (command.type === 'L') parts.push('l', round(command.x), round(command.y));
    else if (command.type === 'Q') parts.push('q', round(command.x), round(command.y), round(command.x1), round(command.y1));
    else if (command.type === 'C') parts.push('b', round(command.x), round(command.y), round(command.x1), round(command.y1), round(command.x2), round(command.y2));
  }
  return parts.join(' ');
}

const glyphs: Record<string, { ha: number; x_min: number; x_max: number; o: string }> = {};
for (const char of [...wanted].sort()) {
  const glyph = font.charToGlyph(char);
  const metrics = glyph.getMetrics();
  glyphs[char] = { ha: round(glyph.advanceWidth), x_min: round(metrics.xMin), x_max: round(metrics.xMax), o: outline(glyph.path.commands) };
}

const typeface = {
  glyphs,
  familyName: font.names.fontFamily?.en ?? 'Lilita One',
  ascender: font.ascender,
  descender: font.descender,
  underlinePosition: font.tables.post.underlinePosition,
  underlineThickness: font.tables.post.underlineThickness,
  boundingBox: { xMin: font.tables.head.xMin, yMin: font.tables.head.yMin, xMax: font.tables.head.xMax, yMax: font.tables.head.yMax },
  resolution: font.unitsPerEm,
};

writeFileSync(target, JSON.stringify(typeface));
console.log(`Wrote ${Object.keys(glyphs).length} glyphs (${[...wanted].sort().join('')}) to ${target}`);
