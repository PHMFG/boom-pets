// The simple games, by name. A game is added here, and to `PLAYABLE_MODES`, when it can be played from start to finish.
import type { MiniMode } from '../types';
import type { MiniRules } from './field';
import { LavaRules } from './lava';
import { PaintRules } from './paint';

export type AnyRules = PaintRules | LavaRules;

const MAKERS: Partial<Record<MiniMode, () => AnyRules>> = {
  paint: () => new PaintRules(),
  lava: () => new LavaRules(),
};

/** A fresh set of rules for one round of a game. */
export function makeRules(mode: MiniMode): AnyRules {
  const make = MAKERS[mode];
  if (!make) throw new Error(`The game "${mode}" cannot be played yet.`);
  return make();
}

export type { MiniRules };
