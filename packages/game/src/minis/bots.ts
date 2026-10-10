// How bots play the simple games. Like the brawl's bots they are stand-ins, not opponents: each decision is
// a guess a person could make, and everything is worked out from the round as it stands, because a bot may
// take over a seat in the middle of one.
import type { Rng } from '../rng';
import type { AnyRound } from '../rounds';
import type { Pet } from '../types';

export type MiniPlan = { x: number; z: number; tapA?: boolean };

const STILL: MiniPlan = { x: 0, z: 0 };

const toward = (me: Pet, x: number, z: number, speed = 1): MiniPlan => {
  const distance = Math.hypot(x - me.x, z - me.z);
  return distance < 0.05 ? STILL : { x: ((x - me.x) / distance) * speed, z: ((z - me.z) / distance) * speed };
};

export function miniPlan(round: AnyRound, seat: number, rng: Rng): MiniPlan {
  if (round.gameMode === 'brawl') return STILL;
  const me = round.petOfSeat(seat);
  if (!me) return STILL;
  switch (round.rules.mode) {
    case 'paint': {
      // A bucket in reach is worth a detour. Otherwise head for the nearest tile that is not this pet's colour yet.
      const bucket = round.rules.buckets.find(candidate => candidate.left <= 0.4 && Math.hypot(candidate.x - me.x, candidate.z - me.z) < 5);
      if (bucket) return toward(me, bucket.x, bucket.z);
      let best = -1;
      let nearest = Infinity;
      for (let index = 0; index < round.data.length; index++) {
        if (round.data[index] === seat + 1) continue;
        const centre = round.centre(index);
        // A little noise, so two bots side by side do not march in step.
        const distance = Math.hypot(centre.x - me.x, centre.z - me.z) + rng.range(0, 1.5);
        if (distance < nearest) {
          nearest = distance;
          best = index;
        }
      }
      if (best < 0) return STILL;
      const centre = round.centre(best);
      return toward(me, centre.x, centre.z);
    }
    default:
      return STILL;
  }
}
