// The single source of colour, shape and type for the host HUD, the phone and the 3D world.
import { motion } from './motion';

export const colors = {
  ink: '#1B1035',
  cream: '#FFF4DC',
  creamDark: '#EBDDBF',
  white: '#FFFFFF',
  /** Smoke and anything else that should read as neutral grey. */
  smoke: '#B9B2C6',
  steel: '#8B8794',
  danger: '#FF5A1F',
  gold: '#FFC400',
  tierCommon: '#DCE6F5',
  tierRare: '#29C4FF',
  tierCursed: '#8B2BFF',
  tierCursedAccent: '#B6FF3B',
} as const;

export type SeatShape = 'circle' | 'triangle' | 'square' | 'star' | 'diamond' | 'cross';

/** Seat identity is always colour plus shape, so it never depends on hue alone. */
export const seats = [
  { color: '#F2364A', shape: 'circle' },
  { color: '#2F8CFF', shape: 'triangle' },
  { color: '#FFC928', shape: 'square' },
  { color: '#2BD576', shape: 'star' },
  { color: '#A463FF', shape: 'diamond' },
  { color: '#FF7AD9', shape: 'cross' },
] as const satisfies readonly { color: string; shape: SeatShape }[];

export const fonts = {
  display: "'Lilita One', system-ui, sans-serif",
  text: "'Nunito', system-ui, sans-serif",
} as const;

export const shape = {
  outlinePx: 5,
  radiusPx: 20,
  shadowPx: 8,
} as const;

const kebab = (name: string) => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

/** Publishes the tokens as CSS variables so stylesheets never repeat a raw value. */
export function applyTokens(root: HTMLElement): void {
  const set = (name: string, value: string) => root.style.setProperty(`--${name}`, value);
  for (const [name, value] of Object.entries(colors)) set(kebab(name), value);
  seats.forEach((seat, index) => set(`seat-${index + 1}`, seat.color));
  set('font-display', fonts.display);
  set('font-text', fonts.text);
  set('outline', `${shape.outlinePx}px`);
  set('radius', `${shape.radiusPx}px`);
  set('shadow', `${shape.shadowPx}px`);
  set('pop-in', `${motion.popIn.ms}ms ${motion.popIn.css}`);
  set('ease-pop', motion.popIn.css);
  set('squish-out', `${motion.squishOut.ms}ms ${motion.squishOut.css}`);
  set('move', `${motion.move.ms}ms ${motion.move.css}`);
  set('punch', `${motion.punch.ms}ms`);
  set('stagger', `${motion.staggerMs}ms`);
  set('breathe', `${motion.breathe.ms}ms`);
}
