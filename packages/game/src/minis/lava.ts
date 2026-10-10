// O Chão é Lava: rocks rise out of the floor, an alarm sounds, and then the lava comes up over everything
// that is not a rock. Whoever is not standing on one is out. The rocks sink, fewer rise somewhere else, and
// it starts again, a little faster. A is a shove, for the moment two pets want the same rock.
import { lava, STEP } from '../tuning';
import type { Pet } from '../types';
import type { Field, MiniRules } from './field';

/** `data` marks a rock with this. */
export const ROCK = 1;

export class LavaRules implements MiniRules {
  readonly mode = 'lava' as const;
  readonly cap = lava.cap;
  /** Calm: rocks are up and there is time to reach one. Alarm: the lava is coming. Flood: it is here. */
  phase: 'calm' | 'alarm' | 'flood' = 'calm';
  /** Seconds left of the phase. */
  left = 0;
  wave = 0;
  /** Where the rocks of this wave stand. A rock is round and holds one pet; two only if they balance on its edges. */
  rocks: { x: number; z: number }[] = [];
  /** The wave each seat went out in. Seats out in the same wave tie. */
  private readonly outWave = new Map<number, number>();

  setup(field: Field): void {
    field.resize(lava.columns, lava.rows);
    field.wall = { kind: 'rect' };
  }

  spawn(field: Field, index: number, count: number): { x: number; z: number } {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return { x: Math.sin(angle) * field.columns * 0.28, z: Math.cos(angle) * field.rows * 0.28 };
  }

  step(field: Field): void {
    if (this.wave === 0) this.startWave(field);
    this.left -= STEP;
    if (this.left > 0) return;
    if (this.phase === 'calm') this.enter(field, 'alarm', lava.alarm);
    else if (this.phase === 'alarm') {
      this.enter(field, 'flood', lava.flood);
      // The lava is up: anyone whose feet are not on a rock is out.
      for (const pet of field.alive()) {
        if (this.floorY(field, pet.x, pet.z) > 0) continue;
        this.outWave.set(pet.seat, this.wave);
        field.eliminate(pet, 'lava');
      }
    } else this.startWave(field);
  }

  pressA(field: Field, pet: Pet, stickX: number, stickZ: number): void {
    field.lunge(pet, stickX, stickZ, lava.shoveSpeed, lava.shoveSeconds, lava.shoveRest, lava.shoveRestMiss);
  }

  /** A shove: the pet that was touched is pushed along, and keeps most of its footing. */
  touch(field: Field, pet: Pet, other: Pet): boolean {
    field.knock(other, pet.dashX, pet.dashZ, lava.shoveForce, lava.shoveLift, true);
    field.emit({ t: 'dashHit', pet: pet.id, seat: pet.seat, x: (pet.x + other.x) / 2, y: pet.y, z: (pet.z + other.z) / 2, charge: 0, radius: 0, victims: [other.id] });
    return true;
  }

  /** The floor is flat, except where a rock stands. */
  floorY(_field: Field, x: number, z: number): number {
    return this.rocks.some(rock => Math.hypot(rock.x - x, rock.z - z) <= lava.rockRadius) ? lava.rockHeight : 0;
  }

  finished(field: Field): boolean {
    return field.alive().length <= 1;
  }

  /** Whoever is still standing, then everyone else by the wave that took them, latest first. */
  ranking(field: Field): number[][] {
    const waves = [...new Set(this.outWave.values())].sort((a, b) => b - a);
    return [field.aliveSeats(), ...waves.map(wave => field.out.filter(seat => this.outWave.get(seat) === wave))];
  }

  metric(): null {
    return null;
  }

  hash(): number {
    return this.wave * 1000 + Math.round(this.left * 100) + (this.phase === 'calm' ? 0 : this.phase === 'alarm' ? 1 : 2) * 100_000;
  }

  /** The rocks of the last wave sink and new ones rise somewhere else: one fewer than there are pets, so somebody has to share or be left out. */
  private startWave(field: Field): void {
    this.wave++;
    field.data.fill(0);
    const wanted = Math.max(1, field.alive().length - 1);
    const rocks: number[] = [];
    for (let attempt = 0; attempt < 200 && rocks.length < wanted; attempt++) {
      // Not on the outer ring, and not right beside another rock.
      const column = 1 + field.rng.int(field.columns - 2);
      const row = 1 + field.rng.int(field.rows - 2);
      const index = column * field.rows + row;
      const here = field.centre(index);
      if (rocks.some(other => Math.hypot(field.centre(other).x - here.x, field.centre(other).z - here.z) < lava.rockGap)) continue;
      rocks.push(index);
    }
    for (const index of rocks) field.data[index] = ROCK;
    this.rocks = rocks.map(index => field.centre(index));
    // Each calm is shorter than the last.
    this.enter(field, 'calm', Math.max(lava.calmMin, lava.calm - (this.wave - 1) * lava.calmStep));
  }

  private enter(field: Field, phase: LavaRules['phase'], seconds: number): void {
    this.phase = phase;
    this.left = seconds;
    field.emit({ t: 'lava', phase, wave: this.wave, seconds });
  }
}
