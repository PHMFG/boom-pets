// Batata Quente: one pet carries a lit bomb, and bumping into anyone hands it over. When the fuse runs out
// whoever holds it is out, and a new bomb starts with a shorter fuse. The arena has a wall: there is nowhere
// to go but round each other. Joystick only.
import { potato, pet as petTune, STEP } from '../tuning';
import type { Field, MiniRules } from './field';

export class PotatoRules implements MiniRules {
  readonly mode = 'potato' as const;
  readonly cap = potato.cap;
  /** The seat holding the bomb, or null between bombs. */
  holder: number | null = null;
  /** Seconds left on the fuse, and what it started at. */
  fuse = 0;
  fuseTotal = 1;
  /** Seconds every fuse of this round is longer by, for having started with few players. Unknown until the first bomb. */
  private few: number | null = null;
  /** How many bombs have gone off. */
  bombs = 0;
  /** Seconds until the next bomb is handed out. */
  private wait: number = potato.firstWait;
  /** Who passed the bomb last. For a moment it cannot go straight back to them. */
  private giver: number | null = null;
  private giverLeft = 0;

  setup(field: Field): void {
    const side = Math.ceil(potato.radius * 2) + 2;
    field.resize(side, side);
    field.wall = { kind: 'circle', radius: potato.radius };
  }

  spawn(_field: Field, index: number, count: number): { x: number; z: number } {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return { x: Math.sin(angle) * potato.radius * 0.6, z: Math.cos(angle) * potato.radius * 0.6 };
  }

  step(field: Field): void {
    const alive = field.alive();
    if (this.holder === null) {
      this.wait -= STEP;
      if (this.wait > 0 || alive.length < 2) return;
      // A new bomb, for someone picked by the roll. Each fuse is shorter than the last, and all of them longer in a
      // round that started with few players, which has few bombs.
      const first = alive[field.rng.int(alive.length)]!;
      this.holder = first.seat;
      this.giver = null;
      // Counted once, from how many started: the round does not get slower as it thins out.
      this.few ??= Math.max(0, potato.fullAt - alive.length) * potato.fuseFew;
      this.fuse = this.fuseTotal = Math.max(potato.fuseMin, potato.fuse - this.bombs * potato.fuseStep) + this.few;
      field.emit({ t: 'potato', holder: first.seat, from: null, fuse: this.fuse });
      return;
    }

    const holder = field.petOfSeat(this.holder);
    if (!holder) {
      this.holder = null;
      return;
    }
    this.giverLeft = Math.max(0, this.giverLeft - STEP);
    this.fuse -= STEP;
    if (this.fuse <= 0) {
      // Whoever is holding it goes, and everyone close is thrown back.
      field.emit({ t: 'potatoBoom', seat: holder.seat, x: holder.x, z: holder.z });
      for (const other of alive) {
        const distance = Math.hypot(other.x - holder.x, other.z - holder.z);
        if (other === holder || distance > potato.blastRadius) continue;
        field.knock(other, (other.x - holder.x) / (distance || 1), (other.z - holder.z) / (distance || 1), potato.blastForce, potato.blastLift);
      }
      field.eliminate(holder, 'bomb');
      this.holder = null;
      this.bombs++;
      this.wait = potato.nextWait;
      return;
    }
    // A touch hands it over: to the nearest pet in contact, but not straight back to whoever just gave it.
    const touched = alive
      .filter(other => other !== holder && !(other.seat === this.giver && this.giverLeft > 0))
      .map(other => ({ other, gap: Math.hypot(other.x - holder.x, other.z - holder.z) - petTune.radius * (other.scale + holder.scale) }))
      .filter(entry => entry.gap <= potato.touch && Math.abs(entry.other.y - holder.y) < 1)
      .sort((a, b) => a.gap - b.gap)[0];
    if (!touched) return;
    this.giver = holder.seat;
    this.giverLeft = potato.noReturn;
    this.holder = touched.other.seat;
    field.emit({ t: 'potato', holder: touched.other.seat, from: holder.seat, fuse: this.fuse });
  }

  /** Whoever holds the bomb is a little faster than the rest, or nobody could ever be caught. */
  speed(_field: Field, pet: { seat: number }): number {
    return pet.seat === this.holder ? potato.holderSpeed : 1;
  }

  finished(field: Field): boolean {
    return field.alive().length <= 1;
  }

  ranking(field: Field): number[][] {
    return [field.aliveSeats(), ...[...field.out].reverse().map(seat => [seat])];
  }

  metric(): null {
    return null;
  }

  hash(): number {
    return (this.holder ?? -1) * 10_000 + Math.round(this.fuse * 100) + this.bombs * 1_000_000;
  }
}
