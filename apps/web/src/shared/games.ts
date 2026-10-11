// The games a round can be: their picture, and what each control does in them. Names and lines are in the strings.
import type { GameMode } from '@boom/game';
import type { strings } from './strings.pt-BR';
import { maps } from './tokens';

export const GAME_ICON: Record<GameMode, string> = {
  brawl: '💥', lava: '🌋', grow: '🍩', race: '🏁', color: '🪩', potato: '💣', paint: '🎨', frita: '🍟',
};

type Control = { kind: 'stick' | 'a' | 'b' | 'power'; glyph: string; text: keyof typeof strings.controls };
const STICK: Control = { kind: 'stick', glyph: '🕹️', text: 'move' };

/** The controls a game uses, as the rows of its card: the button as the phone draws it, and what it does in that game. */
export const GAME_CONTROLS: Record<GameMode, readonly Control[]> = {
  brawl: [STICK, { kind: 'a', glyph: 'A', text: 'dash' }, { kind: 'b', glyph: 'B', text: 'grab' }, { kind: 'power', glyph: '⚡', text: 'power' }],
  lava: [STICK, { kind: 'a', glyph: 'A', text: 'shove' }],
  grow: [STICK, { kind: 'a', glyph: 'A', text: 'bite' }],
  race: [STICK, { kind: 'a', glyph: 'A', text: 'jump' }],
  color: [STICK],
  potato: [STICK],
  paint: [STICK],
  frita: [STICK],
};

/** What A is on the phone in each game: its picture and the word under it. Null where the game does not use A. */
export const GAME_A: Record<GameMode, { icon: string; text: keyof typeof strings.controls } | null> = {
  brawl: { icon: 'A', text: 'dash' },
  lava: { icon: '👊', text: 'shove' },
  grow: { icon: '😋', text: 'bite' },
  race: { icon: '⤴️', text: 'jump' },
  color: null,
  potato: null,
  paint: null,
  frita: null,
};

/** Cor Certa's four colours. Each is a flavour, with a fruit as well as a colour, so it never depends on hue alone. */
export const FLAVORS = [
  { icon: '🍊', color: maps.color.orange, line: 'flavor0' },
  { icon: '🍋', color: maps.color.lemon, line: 'flavor1' },
  { icon: '🍇', color: maps.color.grape, line: 'flavor2' },
  { icon: '🌿', color: maps.color.mint, line: 'flavor3' },
] as const;

/** Pictures for the card that says what is happening right now: who has the bomb, and what the cat is doing. */
export const CALL_ICON = { bomb: '💣', sing: '🎵', watch: '👀' } as const;

/** The announcer's line for each game's name. */
export const GAME_LINE: Record<GameMode, keyof typeof strings.announcer> = {
  brawl: 'gameBrawl', lava: 'gameLava', grow: 'gameGrow', race: 'gameRace', color: 'gameColor', potato: 'gamePotato', paint: 'gamePaint', frita: 'gameFrita',
};
