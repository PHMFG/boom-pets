// How each power and tier is shown: one picture and one colour, the same on the TV and on phones.
import type { AwardId, Cause, PowerId, Tier } from '@boom/game';
import { colors } from './tokens';

export const POWER_ICON: Record<PowerId, string> = {
  rocket: '🚀', megaDash: '⚡', jelly: '🍮', giant: '💪', decoys: '👯',
  reversed: '🔄', pebble: '🪨', honk: '📯', kaiju: '🦖', meteorShower: '☄️', pinata: '🪅',
};

export const TIER_COLOR: Record<Tier, string> = {
  common: colors.tierCommon,
  rare: colors.tierRare,
  cursed: colors.tierCursed,
  super: colors.gold,
  superCurse: colors.tierCursedAccent,
};

export const AWARD_ICON: Record<AwardId, string> = {
  selfDestruct: '💥', accident: '🍀', thrower: '🤾', unlucky: '🥶', meteor: '☄️', chain: '⛓️', faller: '🪂', honker: '📯',
};

/** How a knockout happened, for the event feed. */
export const CAUSE_ICON: Record<Cause, string> = { dash: '💥', barrel: '🛢️', throw: '🤾', meteor: '☄️', overcharge: '💣', power: '✨', fall: '🕳️' };

/** The main menu's buttons. */
export const MENU_ICON = { play: '🎮', how: '❓', pets: '🐾' } as const;

/** "Como jogar": each control as the phone draws it. `kind` picks the look of the button, `text` the line in `strings.menu`. */
export const HOW_ROWS = [
  { kind: 'stick', glyph: '🕹️', text: 'howStick' },
  { kind: 'a', glyph: 'A', text: 'howA' },
  { kind: 'b', glyph: 'B', text: 'howB' },
  { kind: 'power', glyph: '⚡', text: 'howPower' },
  { kind: 'ghost', glyph: '👻', text: 'howGhost' },
] as const;

/** The four emotes a player can send from the phone. */
export const EMOTES = ['😂', '😱', '😡', '👋'] as const;
