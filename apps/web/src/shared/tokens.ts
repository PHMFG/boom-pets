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
  color: { orange: '#FFD2AD', lemon: '#FFF0A0', grape: '#DCCBFF', mint: '#BDEFD3', base: '#2B2145', speaker: '#3D315F', cone: '#CFCADD', coneDark: '#7F7896', trim: '#6A5AA0', truss: '#A9A3C2', bulb: '#FFE7A6', neon: '#5FE3F5', vinyl: '#1F1A33', vinylShine: '#4A3F6B', label: '#FF9F7A', mirror: '#F2F4FB', mirrorDark: '#AEB6D6', planet: '#3FA9B5', planetBand: '#2F8C9E', ring: '#F2A9C0', ringDark: '#D9809F', moon: '#D9C7F2', moonDark: '#B9A3DE', rocket: '#F6F3FB', fin: '#FF7B6B', flame: '#FFC46B' },
  grow: { cloth: '#FFFFFF', clothPale: '#FCE4E4', clothCross: '#F6C6C8', clothEdge: '#E8606A', table: '#C8935B', tableAlt: '#D2A06A', tableDark: '#AE7C49', plate: '#F4F6FA', enamel: '#4DBDB3', silver: '#DFE4EC', napkin: '#CDEBF2', glass: '#D4EEF7', apple: '#E8413C', stem: '#7A4B2B', leaf: '#4CB96A', icing: '#F59AC4', dough: '#E7B26E', rind: '#4FB96E', pith: '#E6F4C8', flesh: '#F2566B', wicker: '#D9A55C', wickerDark: '#B98242', bread: '#F6DFA8', crust: '#C98A45', cheese: '#FFCB4D', ham: '#F4A3A8', juice: '#FFA53A', jam: '#C43B5C', jelly: '#F0527A', sponge: '#F3CF8A', cookie: '#D9A05B' },
  lava: { stone: '#F1EBE1', stoneDark: '#E4DBCE', rock: '#6E5C78', rockSide: '#4A3A55', rim: '#3B2B40', cone: '#4E3A55', obsidian: '#4A4596', crust: '#5A3344', bone: '#EDE2C8', lava: '#FF6A1A', lavaHot: '#FFB23E', lavaDeep: '#FF4514' },
  race: { track: '#EAF8EF', trackDark: '#FFF7DA', post: '#8B8794', bar: '#FF5A1F', flag: '#FFC400', start: '#7BE06A', pylon: '#4FC3BC', indigo: '#5B62C9', basket: '#C8935B', cloudDeep: '#B3B8EC', cloudFar: '#EAD6EC', land: '#EFD3B4', landGreen: '#D2DDAA', landWheat: '#F3E3A6', landRiver: '#B7C6EE', grass: '#B9E08E', leaf: '#62B878', soil: '#C9A27E', mint: '#A8E6DA', lilac: '#C9C6F7' },
  potato: { pan: '#F0F3F8', panDark: '#E1E6EE', rim: '#3A3550', grip: '#6A5F80', stove: '#F1E6D6', burner: '#2B2638', flame: '#FF7A1A', flameHot: '#FFD25A', spoon: '#C8935B', bomb: '#2B2638', steel: '#CFCADD' },
  frita: { grass: '#F0F9E6', grassDark: '#E1F2D3', line: '#FFFFFF', lawn: '#A9DC8F', lawnDark: '#9AD181', hedge: '#5FAE6E', hedgeDark: '#4B9460', leaf: '#6FC46C', leafLight: '#93D77F', trunk: '#9A6B47', wood: '#C8935B', slide: '#FFB23E', metal: '#9AA3B8', sand: '#F3E3B5', sandDark: '#E2C98C', kerb: '#EDE7D8', coral: '#F58466', teal: '#3DB8B0', petal: '#FF9DB5', pollen: '#FFD45C' },
  paint: { paper: '#FFFFFF', paperDark: '#F1F3F7', tape: '#F2DFA0', desk: '#C99A66', deskDark: '#B3844F', mat: '#47A49C', matLine: '#8CCFC7', pencil: '#F4B63F', wood: '#E9C99A', lead: '#3A3550', eraser: '#F28FB0', bucket: '#9AA3B8', tin: '#CDD3DF', potPaint: '#FFFFFF', glass: '#D4EEF7', water: '#A7D5E6', bristle: '#5B4636', teal: '#2FB8AC', salmon: '#FF8E7A', sky: '#7CC8F2', tangerine: '#FFA24A', bulb: '#FFF0A8' },
  brawl: { cloudDeep: '#B1B6EE', cloudNight: '#7E83C6', cloudDeepNight: '#5C619F', dusk: '#3B4189', rock: '#9189B4', rockDark: '#6F6794', earth: '#C9A27E', grass: '#A9DC8F', leaf: '#6DBF7B', leafDark: '#57A96C', wood: '#B98A5E', roof: '#F0707F', balloonWarm: '#FF9D7E', balloonCool: '#5CC8C2', balloonSun: '#FFD166', flame: '#FFB23E', window: '#FFD25A', lantern: '#FFE2A0', cubeLight: '#FFE27A', chute: '#FF9D7E', meteor: '#4A3A5E', ember: '#FF6A1A', emberHot: '#FFC23E', glass: '#BFEFFF', glassBack: '#EAF8FF' },
  finale: { step: '#EFE6D2', trim: '#FFFFFF', plaque: '#FFF4DC', velvet: '#A9264B', velvetDark: '#8A1D3D', truss: '#3A3566', lamp: '#FFF1B8' },
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
  set('victory', `${motion.victory.ms}ms`);
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
