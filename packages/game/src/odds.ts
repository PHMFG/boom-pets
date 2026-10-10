// Mystery Cube odds. Pure functions, so the numbers can be tested without running a match.
import type { Rng } from './rng';
import { cube } from './tuning';
import { POWERS, type PowerId, type Tier } from './types';

export type RollTier = Exclude<Tier, 'superCurse'>;
export type Rank = 'leader' | 'last' | 'middle';

const TIERS: readonly RollTier[] = ['common', 'rare', 'cursed', 'super'];

/** Chances out of 100 for common, rare, cursed and SUPER. Last place gets "Sorte de Azarão". */
export const TIER_WEIGHTS: Record<Rank, readonly number[]> = {
  middle: [55, 25, 15, 5],
  last: [40, 30, 10, 20],
  leader: [50, 20, 25, 5],
};

export const SUPER_CURSE: PowerId = 'pinata';

const byTier = (tier: Tier) => (Object.keys(POWERS) as PowerId[]).filter(id => POWERS[id].tier === tier);

/**
 * Decides the tier of one roll.
 * `pity` counts this seat's rolls since its last SUPER. Only one SUPER may run at a time, so a SUPER
 * rolled while another is active becomes a rare, and the pity count is kept for next time.
 */
export function rollTier(rng: Rng, rank: Rank, pity: number, superBusy: boolean): { tier: RollTier; pity: number } {
  const rolled = pity >= cube.pity ? 'super' : (TIERS[rng.weighted(TIER_WEIGHTS[rank])] as RollTier);
  if (rolled !== 'super') return { tier: rolled, pity: pity + 1 };
  if (superBusy) return { tier: 'rare', pity };
  return { tier: 'super', pity: 0 };
}

export function pickPower(rng: Rng, tier: Tier): PowerId {
  return rng.pick(byTier(tier));
}
