// Batatinha Frita 1, 2, 3: a race to the far line, where a giant cat sits with its back turned, singing.
// While it sings, run. When it turns round, anyone still pushing the joystick is sent back to the start.
// What is judged is the joystick, after a moment's grace: a pet still sliding, or a slow network, is not.
import { frita, STEP } from '../tuning';
import type { SampledInput } from '../input';
import { rankBy, type Field, type MiniRules } from './field';

export class FritaRules implements MiniRules {
  readonly mode = 'frita' as const;
  readonly cap = frita.cap;
  /** Sing: the cat's back is turned. Watch: it is looking. */
  phase: 'sing' | 'watch' = 'sing';
  /** Seconds left of the phase, and how long it is in all. */
  left = 0;
  total = 1;
  /** Seats over the line, in order, with the second they crossed it. */
  readonly finishers: { seat: number; at: number }[] = [];
  /** How far each seat has got: metres from the start line. It goes back to nothing when a pet is caught. */
  readonly reach = new Map<number, number>();
  private started = false;
  /** Seats already sent back during this look. Once is enough. */
  private readonly caught = new Set<number>();

  setup(field: Field): void {
    field.resize(frita.columns, frita.rows);
    field.wall = { kind: 'rect' };
  }

  /** In a row along the start line, on the left. */
  spawn(field: Field, index: number, count: number): { x: number; z: number } {
    // Spread over nearly the whole depth of the lane: with six, every bit of room between two pets is a ring that can be seen.
    return { x: -field.columns / 2 + 1, z: ((index + 0.5) / Math.max(1, count) - 0.5) * (field.rows - 0.8) };
  }

  step(field: Field, inputs: ReadonlyMap<number, SampledInput>): void {
    if (!this.started) {
      this.started = true;
      this.enter(field, 'sing');
    }
    this.left -= STEP;
    const finishX = field.columns / 2 - frita.finish;
    for (const pet of field.pets) {
      if (this.finishers.some(entry => entry.seat === pet.seat)) continue;
      const input = inputs.get(pet.seat);
      // Looking, and past the grace: a joystick that is still pushed is a pet that moved.
      if (this.phase === 'watch' && !this.caught.has(pet.seat) && this.total - this.left > frita.grace && input && !input.stale && Math.hypot(input.x, input.y) > frita.stickLimit) {
        this.caught.add(pet.seat);
        // Where it was caught goes out before it is moved, so the screen can show both ends of the trip.
        field.emit({ t: 'caught', pet: pet.id, seat: pet.seat, x: pet.x, z: pet.z });
        const home = this.spawn(field, pet.seat, 6);
        field.respawn(pet, home.x, home.z);
        this.reach.set(pet.seat, 0);
        continue;
      }
      this.reach.set(pet.seat, Math.max(0, pet.x - (-field.columns / 2 + 1)));
      if (pet.x >= finishX) {
        this.finishers.push({ seat: pet.seat, at: field.time });
        field.emit({ t: 'finish', pet: pet.id, seat: pet.seat, place: this.finishers.length });
      }
    }
    if (this.left <= 0) this.enter(field, this.phase === 'sing' ? 'watch' : 'sing');
  }

  /** Everyone tiptoes. */
  speed(): number {
    return frita.speed;
  }

  finished(field: Field): boolean {
    const first = this.finishers[0];
    return this.finishers.length >= field.pets.length || (first !== undefined && field.time >= first.at + frita.finishGrace);
  }

  ranking(field: Field): number[][] {
    const done = new Set(this.finishers.map(entry => entry.seat));
    const rest = field.pets.map(pet => pet.seat).filter(seat => !done.has(seat));
    // Those who crossed in the same instant share the place.
    return [...rankBy([...done], seat => -this.finishers.find(entry => entry.seat === seat)!.at), ...rankBy(rest, seat => Math.round(this.reach.get(seat) ?? 0))];
  }

  /** How much of the way is behind the pet, out of 100. */
  metric(field: Field, seat: number): number {
    if (this.finishers.some(entry => entry.seat === seat)) return 100;
    return Math.min(99, Math.round(((this.reach.get(seat) ?? 0) / (field.columns - 1 - frita.finish)) * 100));
  }

  hash(): number {
    let hash = this.finishers.length + (this.phase === 'sing' ? 0 : 1) * 10 + Math.round(this.left * 100) * 100;
    for (const [seat, reach] of this.reach) hash = (Math.imul(hash, 31) + seat * 1000 + Math.round(reach * 10)) | 0;
    return hash;
  }

  /** The song is never the same length twice, so nobody can count it; the look is. */
  private enter(field: Field, phase: FritaRules['phase']): void {
    this.phase = phase;
    this.caught.clear();
    this.left = this.total = phase === 'sing' ? field.rng.range(frita.singMin, frita.singMax) : field.rng.range(frita.watchMin, frita.watchMax);
    field.emit({ t: 'watch', phase, seconds: this.total });
  }
}
