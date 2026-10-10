// Big extruded words, one mesh per letter so they can slam in letter by letter.
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type BufferGeometry, type Material } from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { motion } from '../../shared/motion';
import { colors } from '../../shared/tokens';
import typeface from './fonts/lilita-one.typeface.json';

type Typeface = { glyphs: Record<string, { ha: number } | undefined>; resolution: number };

const data = typeface as unknown as Typeface;
const font = new Font(typeface as unknown as ConstructorParameters<typeof Font>[0]);
const DEPTH = 0.28;
const glyphs = new Map<string, BufferGeometry>();

function glyphGeometry(char: string): BufferGeometry {
  let geometry = glyphs.get(char);
  if (!geometry) {
    geometry = new TextGeometry(char, { font, size: 1, depth: DEPTH, curveSegments: 6, bevelEnabled: false });
    glyphs.set(char, geometry);
  }
  return geometry;
}

const sideMaterial = new MeshBasicMaterial({ color: colors.ink });
const faceMaterials = new Map<string, Material>();
function faceMaterial(color: string): Material {
  let material = faceMaterials.get(color);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness: 0.7 });
    faceMaterials.set(color, material);
  }
  return material;
}

const backOut = (t: number, strength: number) => 1 + (strength + 1) * (t - 1) ** 3 + strength * (t - 1) ** 2;

export class Word3D {
  readonly group = new Group();
  private readonly letters: Mesh[] = [];
  private age = Infinity;

  constructor(text: string, options: { size: number; color: string }) {
    const advance = (char: string) => {
      const glyph = data.glyphs[char];
      if (!glyph) throw new Error(`3D font has no "${char}". Add the word to strings.pt-BR.ts words3d and run pnpm font.`);
      return (glyph.ha / data.resolution) * options.size;
    };
    const chars = Array.from(text);
    const width = chars.reduce((sum, char) => sum + advance(char), 0);
    let x = -width / 2;
    for (const char of chars) {
      if (char !== ' ') {
        // Extrusions have two material groups: caps (0) and sides (1). Ink sides give the sticker look in 3D.
        const letter = new Mesh(glyphGeometry(char), [faceMaterial(options.color), sideMaterial]);
        letter.position.x = x;
        letter.scale.setScalar(options.size);
        letter.userData.size = options.size;
        this.group.add(letter);
        this.letters.push(letter);
      }
      x += advance(char);
    }
  }

  /** Restarts the entrance: each letter drops in from oversized, one stagger apart. */
  slam(): void {
    this.age = 0;
    for (const letter of this.letters) letter.visible = false;
  }

  update(dt: number): void {
    if (this.age === Infinity) return;
    this.age += dt;
    const duration = motion.popIn.ms / 1000;
    let settled = true;
    this.letters.forEach((letter, index) => {
      const t = (this.age - (index * motion.staggerMs) / 1000) / duration;
      const size = letter.userData.size as number;
      if (t <= 0) {
        settled = false;
        return;
      }
      letter.visible = true;
      if (t >= 1) {
        letter.scale.setScalar(size);
        return;
      }
      settled = false;
      // Starts at 2.6x and overshoots slightly below 1 before settling: a slam, not a fade.
      letter.scale.setScalar(size * (2.6 - 1.6 * backOut(t, 2.2)));
    });
    if (settled) this.age = Infinity;
  }
}
