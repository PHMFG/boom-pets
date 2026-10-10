// opentype.js ships no types. This declares only the part tools/font.ts uses.
declare module 'opentype.js' {
  export type Command =
    | { type: 'M' | 'L'; x: number; y: number }
    | { type: 'Q'; x: number; y: number; x1: number; y1: number }
    | { type: 'C'; x: number; y: number; x1: number; y1: number; x2: number; y2: number }
    | { type: 'Z' };

  export type Glyph = {
    advanceWidth: number;
    path: { commands: Command[] };
    getMetrics(): { xMin: number; xMax: number };
  };

  export type Font = {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    names: { fontFamily?: { en?: string } };
    tables: {
      head: { xMin: number; yMin: number; xMax: number; yMax: number };
      post: { underlinePosition: number; underlineThickness: number };
    };
    charToGlyphIndex(char: string): number;
    charToGlyph(char: string): Glyph;
  };

  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}
