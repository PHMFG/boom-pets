// Inline SVG drawn in the game's sticker style. Strings, so vanilla DOM and React can both use them.
import { colors, type SeatShape } from './tokens';

const SHAPE_PATHS: Record<SeatShape, string> = {
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  triangle: '<path d="M12 3.5 21 19.5H3Z"/>',
  square: '<rect x="4" y="4" width="16" height="16" rx="2.5"/>',
  star: '<path d="M12 2.5l2.8 6.1 6.7.7-5 4.5 1.4 6.6L12 17l-5.9 3.4 1.4-6.6-5-4.5 6.7-.7z"/>',
  diamond: '<path d="M12 2.5 21.5 12 12 21.5 2.5 12Z"/>',
  cross: '<path d="M9 3.5h6V9h5.5v6H15v5.5H9V15H3.5V9H9z"/>',
};

export function seatShapeSvg(shape: SeatShape, fill: string, stroke: string = colors.ink): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${fill}" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round">${SHAPE_PATHS[shape]}</svg>`;
}
