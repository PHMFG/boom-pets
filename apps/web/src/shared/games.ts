// The games a round can be: their picture, and what each control does in them. Names and lines are in the strings.
import type { GameMode } from '@boom/game';
import type { strings } from './strings.pt-BR';

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

/** The announcer's line for each game's name. */
export const GAME_LINE: Record<GameMode, keyof typeof strings.announcer> = {
  brawl: 'gameBrawl', lava: 'gameLava', grow: 'gameGrow', race: 'gameRace', color: 'gameColor', potato: 'gamePotato', paint: 'gamePaint', frita: 'gameFrita',
};
