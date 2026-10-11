// The single source of colour, shape and type for the host HUD, the phone and the 3D world.
import { motion } from './motion';

export const colors = {
  ink: '#1B1035',
  cream: '#FFF4DC',
  creamDark: '#EBDDBF',
  white: '#FFFFFF',
  /** The platform's two tile colours: a clean, cool white, the plainest surface on screen, so every pet and seat colour stands out on it. */
  floor: '#FAFBFD',
  floorDark: '#E4E9F2',
  /** The clouds below the platform: tinted toward the sky, so the white floor's edge reads against them. */
  cloud: '#C9CDF6',
  /** Smoke and anything else that should read as neutral grey. */
  smoke: '#B9B2C6',
  steel: '#8B8794',
  danger: '#FF5A1F',
  /** "Go", "safe": the opposite of danger. On the phone when a game says run. */
  go: '#7BE06A',
  gold: '#FFC400',
  tierCommon: '#DCE6F5',
  tierRare: '#29C4FF',
  tierCursed: '#8B2BFF',
  tierCursedAccent: '#B6FF3B',
} as const;

/**
 * What each game's map is made of. Whatever pets walk on is pale, so they stay easy to find; the theme is
 * in what surrounds the floor. The brawl uses `floor`, `floorDark` and `cloud` above.
 */
export const maps = {
  color: { orange: '#FFD2AD', lemon: '#FFF0A0', grape: '#DCCBFF', mint: '#BDEFD3', base: '#2B2145', speaker: '#3D315F', cone: '#CFCADD' },
  grow: { cloth: '#FFFFFF', clothPale: '#FCE4E4', clothCross: '#F6C6C8', table: '#C8935B', plate: '#F4F6FA', apple: '#E8413C', stem: '#7A4B2B', leaf: '#4CB96A', icing: '#F59AC4', dough: '#E7B26E', rind: '#4FB96E', flesh: '#F2566B' },
  lava: { stone: '#F1EBE1', stoneDark: '#E4DBCE', rock: '#6E5C78', rim: '#3B2B40', cone: '#4E3A55', lava: '#FF6A1A', lavaHot: '#FFB23E' },
  race: { track: '#EAF8EF', trackDark: '#FFF7DA', post: '#8B8794', bar: '#FF5A1F', flag: '#FFC400', start: '#7BE06A' },
  potato: { pan: '#F0F3F8', panDark: '#E1E6EE', rim: '#3A3550', grip: '#6A5F80', stove: '#F1E6D6', burner: '#2B2638', flame: '#FF7A1A', flameHot: '#FFD25A', spoon: '#C8935B', bomb: '#2B2638', steel: '#CFCADD' },
  frita: { grass: '#F0F9E6', grassDark: '#E1F2D3', line: '#FFFFFF', lawn: '#A9DC8F', hedge: '#5FAE6E', hedgeDark: '#4B9460', wood: '#C8935B', slide: '#FFB23E', metal: '#9AA3B8', sand: '#F3E3B5' },
  paint: { paper: '#FFFFFF', paperDark: '#F1F3F7', tape: '#F2DFA0', desk: '#C99A66', pencil: '#F4B63F', wood: '#E9C99A', lead: '#3A3550', eraser: '#F28FB0', bucket: '#9AA3B8' },
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
  set('pop-in-ms', `${motion.popIn.ms}ms`);
  set('ease-pop', motion.popIn.css);
  set('squish-out', `${motion.squishOut.ms}ms ${motion.squishOut.css}`);
  set('move', `${motion.move.ms}ms ${motion.move.css}`);
  set('punch', `${motion.punch.ms}ms`);
  set('count', `${motion.count.ms}ms`);
  set('stagger', `${motion.staggerMs}ms`);
  set('breathe', `${motion.breathe.ms}ms`);
  set('nudge', `${motion.nudge.ms}ms`);
  set('prompt', `${motion.prompt.ms}ms`);
  set('alarm', `${motion.alarm.ms}ms`);
  set('wobble', `${motion.wobble.ms}ms`);
  set('buzz', `${motion.buzz.ms}ms`);
  set('feed', `${motion.feed.ms}ms`);
  set('ease-spin', motion.spin.css);
  set('landing', `${motion.landing.ms}ms`);
  set('iris', `${motion.iris.ms}ms ${motion.iris.css}`);
  set('round-results-delay', `${motion.roundResults.delayMs}ms`);
  set('round-results-stagger', `${motion.roundResults.staggerMs}ms`);
  set('swell', `${motion.swell.ms}ms`);
  set('tick', `${motion.tick.ms}ms`);
  set('title-drop', `${motion.title.dropMs}ms`);
  set('title-drop-stagger', `${motion.title.dropStaggerMs}ms`);
  set('title-hop', `${motion.title.hopMs}ms`);
  set('title-hop-delay', `${motion.title.hopDelayMs}ms`);
  set('title-hop-stagger', `${motion.title.hopStaggerMs}ms`);
  set('title-tag-delay', `${motion.title.tagDelayMs}ms`);
  set('title-prompt-delay', `${motion.title.promptDelayMs}ms`);
  set('title-fly', `${motion.title.flyMs}ms`);
  set('results-delay', `${motion.results.delayMs}ms`);
  set('results-stagger', `${motion.results.staggerMs}ms`);
}
