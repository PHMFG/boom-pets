// Points, standings and end-of-match awards. Pure functions.
import type { Rank } from './odds';
import { match } from './tuning';
import type { AwardId, Standing } from './types';

/**
 * Points for finishing places. `groups` lists seats by place, best first; seats in one group tied
 * (survivors at the time cap) and split the points of the places they occupy.
 */
export function placementPoints(groups: number[][], factor: number): Map<number, number> {
  const points = new Map<number, number>();
  let place = 0;
  for (const group of groups) {
    if (group.length === 0) continue;
    let pool = 0;
    for (let index = 0; index < group.length; index++) pool += match.placePoints[place + index] ?? 0;
    for (const seat of group) points.set(seat, Math.floor(pool / group.length) * factor);
    place += group.length;
  }
  return points;
}

/** Whether a seat is leading, last, or neither. With every score equal, nobody is either. */
export function rankOf(scores: ReadonlyMap<number, number>, seat: number): Rank {
  const values = [...scores.values()];
  const best = Math.max(...values);
  const worst = Math.min(...values);
  const mine = scores.get(seat) ?? 0;
  if (best === worst) return 'middle';
  return mine === best ? 'leader' : mine === worst ? 'last' : 'middle';
}

export type SeatStats = Record<AwardId, number>;

export const emptyStats = (): SeatStats => ({ selfDestruct: 0, accident: 0, thrower: 0, unlucky: 0, meteor: 0, chain: 0, faller: 0, honker: 0 });

/** When nobody stands out, awards are handed out in this order: the ones that read fine with a zero come first. */
const FALLBACK_ORDER: readonly AwardId[] = ['accident', 'unlucky', 'faller', 'honker', 'thrower', 'meteor', 'chain', 'selfDestruct'];

/** One award per seat, never the same award twice: each goes to whoever stands out most for it. */
export function assignAwards(stats: ReadonlyMap<number, SeatStats>): Map<number, AwardId> {
  const awards = new Map<number, AwardId>();
  const freeSeats = new Set(stats.keys());
  const freeAwards = new Set(FALLBACK_ORDER);
  while (freeSeats.size > 0 && freeAwards.size > 0) {
    let best: { seat: number; award: AwardId; share: number } | null = null;
    for (const award of FALLBACK_ORDER) {
      if (!freeAwards.has(award)) continue;
      // Compared as a share of the highest value anyone has, so awards counted in different units can compete.
      const top = Math.max(1, ...[...stats.values()].map(seat => seat[award]));
      for (const seat of [...freeSeats].sort((a, b) => a - b)) {
        const share = (stats.get(seat)?.[award] ?? 0) / top;
        if (!best || share > best.share) best = { seat, award, share };
      }
    }
    if (!best) break;
    awards.set(best.seat, best.award);
    freeSeats.delete(best.seat);
    freeAwards.delete(best.award);
  }
  return awards;
}

/** Final table, best first. Equal scores share a place. */
export function standings(scores: ReadonlyMap<number, number>, awards: ReadonlyMap<number, AwardId>): Standing[] {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return sorted.map(([seat, score]) => ({
    seat,
    score,
    place: 1 + sorted.filter(([, other]) => other > score).length,
    award: awards.get(seat) ?? null,
  }));
}
