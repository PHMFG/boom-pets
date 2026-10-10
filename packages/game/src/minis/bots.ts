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

/** Like `toward`, but easing off as it gets there: a bot acts a quarter second late, and at full speed would run straight past. */
const arrive = (me: Pet, x: number, z: number): MiniPlan => {
  const distance = Math.hypot(x - me.x, z - me.z);
  // The gain is low enough that being late does not turn the approach into a swing back and forth.
  return distance < 0.15 ? STILL : toward(me, x, z, Math.min(1, distance / 2.6));
};

export function miniPlan(round: AnyRound, seat: number, rng: Rng): MiniPlan {
  if (round.gameMode === 'brawl') return STILL;
  const me = round.petOfSeat(seat);
  if (!me) return STILL;
  switch (round.gameMode) {
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
    case 'lava': {
      // The nearest rock nobody else is standing on. If every rock is taken, the nearest one, and its owner gets a shove.
      const taken = (rock: { x: number; z: number }) => round.pets.some(other => other !== me && other.alive && Math.hypot(other.x - rock.x, other.z - rock.z) < 0.55);
      const near = (rock: { x: number; z: number }) => Math.hypot(rock.x - me.x, rock.z - me.z);
      const rocks = [...round.rules.rocks].sort((a, b) => near(a) - near(b));
      const rock = rocks.find(candidate => !taken(candidate)) ?? rocks[0];
      if (!rock) return STILL;
      if (!taken(rock)) return arrive(me, rock.x, rock.z);
      const owner = round.pets.find(other => other !== me && other.alive && Math.hypot(other.x - rock.x, other.z - rock.z) < 0.55);
      if (!owner) return arrive(me, rock.x, rock.z);
      // Push in, and shove when close enough to connect. Not every time: a person hesitates too.
      return { ...toward(me, owner.x, owner.z), tapA: near(owner) < 1.6 && rng.chance(0.3) };
    }
    case 'grow': {
      const rules = round.rules;
      const mine = rules.size(seat);
      // A pet two sizes bigger, close by, is a mouth to keep away from.
      const threat = round.pets.find(other => other !== me && rules.size(other.seat) >= mine + 2 && Math.hypot(other.x - me.x, other.z - me.z) < 2.2);
      if (threat) return toward(me, me.x * 2 - threat.x, me.z * 2 - threat.z);
      // A pet two sizes smaller, in reach, is worth a bite, when the bot thinks of it.
      const prey = round.pets.find(other => other !== me && rules.size(other.seat) <= mine - 2 && other.grabImmune <= 0 && Math.hypot(other.x - me.x, other.z - me.z) < 2);
      if (prey && me.dashCooldown <= 0 && rng.chance(0.15)) return { ...toward(me, prey.x, prey.z), tapA: true };
      // Otherwise the best piece for the walk: worth more is worth going farther for, and a pepper is never worth it.
      let best: { x: number; z: number } | null = null;
      let score = -Infinity;
      for (const food of rules.foods) {
        if (food.kind === 'pepper') continue;
        const value = food.kind === 'melon' ? 4 : food.kind === 'donut' ? 2 : 1;
        const worth = value * 2.2 - Math.hypot(food.x - me.x, food.z - me.z) + rng.range(0, 1);
        if (worth > score) {
          score = worth;
          best = food;
        }
      }
      return best ? toward(me, best.x, best.z) : STILL;
    }
    default:
      return STILL;
  }
}
