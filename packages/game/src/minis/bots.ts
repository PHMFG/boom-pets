// How bots play the simple games. Like the brawl's bots they are stand-ins, not opponents: each decision is
// a guess a person could make, and everything is worked out from the round as it stands, because a bot may
// take over a seat in the middle of one.
import type { Rng } from '../rng';
import { color, lava, potato } from '../tuning';
import type { AnyRound } from '../rounds';
import { TILE, type Pet } from '../types';
import { reach, seatsOf, type Furniture } from './lava';

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

type Spot = { x: number; z: number };
type Box = { x0: number; x1: number; z0: number; z1: number };
const boxOf = (piece: Furniture): Box => ({ x0: piece.x - reach(piece).x, x1: piece.x + reach(piece).x, z0: piece.z - reach(piece).z, z1: piece.z + reach(piece).z });

/**
 * The spot nearest a pet in what two pieces' tops have in common, a little in from its edges, if that is at least
 * `least` across both ways; and nothing if they only touch. The nearest, not the middle: a crowd that all heads for
 * one point pushes itself off the edge.
 */
function common(a: Furniture, b: Furniture, least: number, me: Spot): Spot[] {
  const [first, second] = [boxOf(a), boxOf(b)];
  const [x0, x1, z0, z1] = [Math.max(first.x0, second.x0), Math.min(first.x1, second.x1), Math.max(first.z0, second.z0), Math.min(first.z1, second.z1)];
  if (x1 - x0 < least || z1 - z0 < least) return [];
  const inX = Math.min(0.35, (x1 - x0) / 2);
  const inZ = Math.min(0.35, (z1 - z0) / 2);
  return [{ x: Math.min(x1 - inX, Math.max(x0 + inX, me.x)), z: Math.min(z1 - inZ, Math.max(z0 + inZ, me.z)) }];
}

/**
 * Where to head for, to get from where a pet is to a spot on the same floor of furniture without leaving it:
 * the spot itself if it is on the piece the pet stands on, and otherwise the way through to the next piece toward it,
 * a step past the seam the two meet at.
 */
function through(floor: readonly Furniture[], me: Spot, goal: Spot): Spot {
  const holds = (piece: Furniture, spot: Spot) => Math.abs(piece.x - spot.x) <= reach(piece).x + 0.05 && Math.abs(piece.z - spot.z) <= reach(piece).z + 0.05;
  const from = floor.find(piece => holds(piece, me));
  const to = floor.find(piece => holds(piece, goal));
  if (!from || !to || from === to) return goal;
  const meets = (a: Furniture, b: Furniture) => {
    const [first, second] = [boxOf(a), boxOf(b)];
    return Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0) >= -0.01 && Math.min(first.z1, second.z1) - Math.max(first.z0, second.z0) >= -0.01;
  };
  // Outward from the piece the goal is on, until the one the pet is on is reached: what led to it is the next piece on the way.
  const toward = new Map<Furniture, Furniture | null>([[to, null]]);
  const queue = [to];
  for (let piece = queue.shift(); piece && !toward.has(from); piece = queue.shift()) {
    for (const other of floor) {
      if (toward.has(other) || !meets(piece, other)) continue;
      toward.set(other, piece);
      queue.push(other);
    }
  }
  const next = toward.get(from);
  if (!next) return goal;
  const [first, second] = [boxOf(from), boxOf(next)];
  const [x0, x1, z0, z1] = [Math.max(first.x0, second.x0), Math.min(first.x1, second.x1), Math.max(first.z0, second.z0), Math.min(first.z1, second.z1)];
  // The seam is long one way and a hair across the other: through its middle, and half a metre on into the next piece.
  const sideways = x1 - x0 < z1 - z0;
  return sideways ? { x: (x0 + x1) / 2 + Math.sign(next.x - from.x) * 0.5, z: (z0 + z1) / 2 } : { x: (x0 + x1) / 2, z: (z0 + z1) / 2 + Math.sign(next.z - from.z) * 0.5 };
}

/**
 * Nobody walks off an edge on purpose. A bot's hands are a quarter second behind its eyes, so it looks as far ahead
 * as it will travel before it could stop, and a step that would end over a drop is not taken. (Being pushed off is another matter.)
 */
function careful(round: Extract<AnyRound, { gameMode: 'lava' }>, me: Pet, feet: number, plan: MiniPlan): MiniPlan {
  const length = Math.hypot(plan.x, plan.z);
  if (length < 0.05 || !me.grounded) return plan;
  const speed = Math.hypot(me.vx, me.vz);
  const far = 0.5 + speed * 0.4;
  for (let ahead = 0.25; ahead <= far; ahead += 0.25) {
    if (round.floorY(me.x + (plan.x / length) * ahead, me.z + (plan.z / length) * ahead, feet) >= feet - 0.2) continue;
    // Still going that way: lean back against it. Otherwise just do not go.
    return speed > 0.6 ? { x: -me.vx / speed, z: -me.vz / speed } : STILL;
  }
  return plan;
}

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
      const rules = round.rules;
      const feet = round.feetOf(me);
      const near = (spot: { x: number; z: number }) => Math.hypot(spot.x - me.x, spot.z - me.z);
      // The newest layer is the one to be on: its pieces that have landed, or are still only marked.
      const newest = rules.pieces.filter(piece => piece.layer === rules.wave);
      // And the floor this pet is on now: every landed piece level with its feet. They touch, so it is one floor to walk on.
      const mine = rules.pieces.filter(piece => piece.landed && Math.abs(piece.top - feet) < 0.2);
      const up = feet >= rules.wave * lava.height - 0.2;
      let goal: { x: number; z: number } | null = null;
      if (!up) {
        // Not up there yet. The way up is where a new piece reaches over the floor this pet is on: the middle of what
        // the two have in common, the nearest such place. From the slab itself, any new piece will do.
        for (const piece of newest) {
          const spots = feet < 0.2 ? [{ x: piece.x, z: piece.z }] : mine.flatMap(under => common(piece, under, 0.5, me));
          for (const spot of spots) if (!goal || near(spot) < near(goal)) goal = spot;
        }
        // Nowhere to step up from here: it has fallen behind, and can only hope.
        if (!goal) return STILL;
      } else {
        // Up there: the nearest seat nobody else is standing on, on a piece that is down. If every seat is taken, the
        // nearest one, and whoever is on it gets a shove.
        const seats = mine.flatMap(piece => seatsOf(piece));
        const taken = (spot: { x: number; z: number }) => round.pets.some(other => other !== me && other.alive && Math.hypot(other.x - spot.x, other.z - spot.z) < 0.55);
        seats.sort((a, b) => near(a) - near(b));
        const seat = seats.find(candidate => !taken(candidate)) ?? seats[0];
        if (!seat) return STILL;
        const owner = taken(seat) ? round.pets.find(other => other !== me && other.alive && Math.hypot(other.x - seat.x, other.z - seat.z) < 0.55) : undefined;
        // Push in, and shove when close enough to connect. Not every time: a person hesitates too.
        if (owner) return { ...careful(round, me, feet, toward(me, owner.x, owner.z)), tapA: near(owner) < 1.6 && rng.chance(0.3) };
        goal = seat;
      }
      // Across the floor it is on, piece by piece, and never off an edge on purpose.
      const next = feet < 0.2 ? goal : through(mine, me, goal);
      return careful(round, me, feet, arrive(me, next.x, next.z));
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
    case 'race': {
      const rules = round.rules;
      const { track } = rules;
      if (rules.finishers.some(entry => entry.seat === seat)) return STILL;
      const along = track.progressOf(me.x, me.z);
      const here = track.pointAt(along);
      /** The spot that far ahead, on one of the track's three rows (-1, 0 or 1 across it). */
      const at = (distance: number, row: number) => {
        const spot = track.pointAt(along + distance);
        return { x: spot.x + spot.dz * row, z: spot.z - spot.dx * row };
      };
      const stands = (distance: number, row: number) => {
        const spot = at(distance, row);
        return round.isFloor(spot.x, spot.z);
      };
      // A beam ahead: a stretch where one row is left standing and the other two are not. It may be any of the three.
      let lane = 0;
      let beam = false;
      for (const distance of [1.2, 2.2, 3.2]) {
        const rows = [-1, 0, 1].filter(row => stands(distance, row));
        if (rows.length !== 1) continue;
        lane = rows[0]!;
        beam = true;
        break;
      }
      // Aim a short way down the track, on the row that is there: short enough not to cut a corner over the drop.
      const ahead = at(1.2, lane);
      // Slower where care is needed, as a person would be: into a turn (a late thumb overshoots it), onto a beam
      // while not yet lined up with it, and behind someone already on the way.
      const turning = track.pointAt(along + 2.2).dx * here.dx + track.pointAt(along + 2.2).dz * here.dz < 0.5;
      const off = Math.abs((me.x - here.x) * here.dz - (me.z - here.z) * here.dx - lane);
      const queued = round.pets.some(other => {
        if (other === me) return false;
        const forward = (other.x - me.x) * here.dx + (other.z - me.z) * here.dz;
        const aside = Math.abs((other.x - me.x) * here.dz - (other.z - me.z) * here.dx);
        return forward > 0.2 && forward < 1.3 && aside < 0.8;
      });
      const pace = queued && beam ? 0.3 : turning ? 0.55 : beam && off > 0.2 ? 0.5 : 1;
      const run = toward(me, ahead.x, ahead.z, pace);
      if (!me.grounded) return run;
      // A press lands a quarter second after it is decided, so everything is judged for where the pet will be then.
      const lag = 0.27;
      const speed = Math.hypot(me.vx, me.vz);

      // A bar coming round: jump as it arrives. The middle of it cannot be jumped, only its arms.
      for (const sweeper of rules.sweepers) {
        const reach = Math.hypot(me.x - sweeper.x, me.z - sweeper.z);
        if (reach > 2.1 || reach < 0.5) continue;
        const mine = Math.atan2(me.x - sweeper.x, me.z - sweeper.z);
        // How far the nearer arm still has to turn to reach the pet. The two arms are half a turn apart.
        let gap = ((mine - sweeper.angle) * Math.sign(sweeper.speed)) % Math.PI;
        if (gap < 0) gap += Math.PI;
        const wait = gap / Math.abs(sweeper.speed);
        if (wait > lag && wait < lag + 0.22 && rng.chance(0.85)) return { ...run, tapA: true };
      }

      // What the floor does over the next few metres of the row it is running on. A tile that is shaking counts as already gone.
      const solid = (distance: number) => {
        const spot = at(distance, lane);
        const index = round.index(spot.x, spot.z);
        return index >= 0 && round.tiles[index] === TILE.solid;
      };
      // Already on a tile that is going: no stopping now.
      if (!solid(0)) return run;
      let edge = -1;
      let far = -1;
      for (let distance = 0.25; distance <= 6.5 && far < 0; distance += 0.25) {
        if (edge < 0 && !solid(distance)) edge = distance;
        else if (edge >= 0 && solid(distance)) far = distance;
      }
      if (edge < 0 || edge > 3) return run;
      // A hole too wide to jump is a stretch that blinked away: wait for it, a step back from the edge.
      if (far < 0 || far - edge > 2.4) return edge < 1.2 ? STILL : { x: run.x * 0.5, z: run.z * 0.5 };
      // A gap: keep running, and press so the jump starts just before the lip. Sometimes a little early or late.
      const lip = edge - speed * lag;
      return { ...run, tapA: lip < 0.75 + rng.range(-0.25, 0.2) };
    }
    case 'color': {
      const rules = round.rules;
      // Until a colour is called there is nothing to do but drift toward the middle, where every colour is near.
      // And for a moment after the call, too: a name has to be heard and a colour found before anyone runs.
      if (rules.phase === 'show' || (rules.phase === 'call' && rules.total - rules.left < 0.4)) return arrive(me, 0, 0);
      // The nearest tile of the called colour that is not on the rim of its patch, so a late stop still ends on it.
      let best = -1;
      let nearest = Infinity;
      for (let index = 0; index < round.data.length; index++) {
        if (round.data[index] !== rules.called + 1) continue;
        const centre = round.centre(index);
        const distance = Math.hypot(centre.x - me.x, centre.z - me.z);
        if (distance < nearest) {
          nearest = distance;
          best = index;
        }
      }
      if (best < 0) return STILL;
      // Aim a little way into the patch, not at its very edge.
      const edge = round.centre(best);
      const column = Math.floor(best / round.rows);
      const row = best % round.rows;
      const side = color.patch;
      const patch = { x: Math.floor(column / side) * side + side / 2 - round.columns / 2, z: Math.floor(row / side) * side + side / 2 - round.rows / 2 };
      return arrive(me, (edge.x + patch.x) / 2, (edge.z + patch.z) / 2);
    }
    case 'potato': {
      const rules = round.rules;
      const others = round.pets.filter(other => other !== me && other.alive);
      if (rules.holder === seat) {
        // Holding it: straight at whoever is nearest.
        const prey = [...others].sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
        return prey ? toward(me, prey.x, prey.z) : STILL;
      }
      const holder = others.find(other => other.seat === rules.holder);
      if (!holder) return arrive(me, me.x * 0.6, me.z * 0.6);
      const gap = Math.hypot(holder.x - me.x, holder.z - me.z);
      if (gap > potato.radius * 0.75) return STILL;
      // Away from the bomb, sliding along the wall instead of running into it and stopping there.
      let x = (me.x - holder.x) / (gap || 1);
      let z = (me.z - holder.z) / (gap || 1);
      // Not into a huddle, where the bomb only goes round: a little away from anyone else close by, too.
      for (const other of others) {
        const near = Math.hypot(other.x - me.x, other.z - me.z);
        if (other === holder || near > 2.5) continue;
        x += ((me.x - other.x) / (near || 1)) * 0.7;
        z += ((me.z - other.z) / (near || 1)) * 0.7;
      }
      const out = Math.hypot(me.x, me.z);
      if (out > potato.radius - 1.7) {
        const side = Math.sign(x * -me.z + z * me.x) || 1;
        x = (-me.z / out) * side - (me.x / out) * 0.3;
        z = (me.x / out) * side - (me.z / out) * 0.3;
      }
      return { x, z };
    }
    case 'frita': {
      const rules = round.rules;
      if (rules.finishers.some(entry => entry.seat === seat)) return STILL;
      const careful = seat % 2 === 0;
      const run = { x: 1, z: 0 };
      // One roll for each song or look and each bot, made from its own length, so it is the same however often it is asked.
      const roll = ((Math.round(rules.total * 9973) * (seat * 2 + 3)) % 100) / 100;
      // The cat counts the song out, so a bot knows when to let go, allowing for its own slow hands:
      // a careful one around "three", a bold one nearer the end, and neither the same way twice.
      if (rules.phase === 'sing') return rules.left > (careful ? 0.35 + roll * 0.4 : 0.25 + roll * 0.35) ? run : STILL;
      // Now and then one twitches after the cat has turned, and pays for it; the bold ones more often.
      return roll < (careful ? 0.06 : 0.26) && rules.total - rules.left < 0.3 && me.x > -round.columns / 2 + 2 ? run : STILL;
    }
    default:
      return STILL;
  }
}
