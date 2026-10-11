// The simple games, by name. A game is added here, and to `PLAYABLE_MODES`, when it can be played from start to finish.
import type { MiniMode } from '../types';
import type { MiniRules } from './field';
import { ColorRules } from './color';
import { FritaRules } from './frita';
import { GrowRules } from './grow';
import { LavaRules } from './lava';
import { PaintRules } from './paint';
import { PotatoRules } from './potato';
import { RaceRules } from './race';

export type AnyRules = PaintRules | LavaRules | GrowRules | RaceRules | ColorRules | PotatoRules | FritaRules;

const MAKERS: Partial<Record<MiniMode, () => AnyRules>> = {
  paint: () => new PaintRules(),
  lava: () => new LavaRules(),
  grow: () => new GrowRules(),
  race: () => new RaceRules(),
  color: () => new ColorRules(),
  potato: () => new PotatoRules(),
  frita: () => new FritaRules(),
};

/** A fresh set of rules for one round of a game. */
export function makeRules(mode: MiniMode): AnyRules {
  const make = MAKERS[mode];
  if (!make) throw new Error(`The game "${mode}" cannot be played yet.`);
  return make();
}

export type { MiniRules };
