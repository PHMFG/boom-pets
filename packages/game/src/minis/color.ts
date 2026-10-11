// Cor Certa: the floor is patches of four colours. One is called, and after a short count every tile of the
// other three drops away. Whoever is left standing gets a new floor and a shorter count. Joystick only.
import { color, STEP } from '../tuning';
import { TILE } from '../types';
import type { Field, MiniRules } from './field';

export class ColorRules implements MiniRules {
  readonly mode = 'color' as const;
  readonly cap = color.cap;
  /** Show: a new floor, and a moment to look at it. Call: one colour is named and the count runs. Drop: the rest is gone. */
  phase: 'show' | 'call' | 'drop' = 'show';
  /** Seconds left of the phase, and how long it is in all. */
  left = 0;
  total = 0;
  wave = 0;
  /** The colour called this wave, 0 to 3. */
  called = 0;
  private readonly outWave = new Map<number, number>();
  private seen = 0;

  setup(field: Field): void {
    field.resize(color.patches * color.patch, color.patches * color.patch);
    // The stage has a rim. The only way out is the one the game announces: a patch dropping from under a pet.
    field.wall = { kind: 'rect' };
  }

  spawn(field: Field, index: number, count: number): { x: number; z: number } {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return { x: Math.sin(angle) * field.columns * 0.25, z: Math.cos(angle) * field.rows * 0.25 };
  }

  /** `data` holds a tile's colour: 1 to 4. */
  step(field: Field): void {
    if (this.wave === 0) this.show(field);
    // Whoever fell since the last step went out in this wave: pets lost together share a place.
    for (; this.seen < field.out.length; this.seen++) this.outWave.set(field.out[this.seen]!, this.wave);
    this.left -= STEP;
    if (this.left > 0) return;
    if (this.phase === 'show') {
      this.phase = 'call';
      // Each count is shorter than the last.
      this.left = this.total = Math.max(color.countMin, color.count - (this.wave - 1) * color.countStep);
      field.emit({ t: 'colorCall', color: this.called, wave: this.wave, seconds: this.left });
    } else if (this.phase === 'call') {
      this.phase = 'drop';
      this.left = color.drop;
      for (let index = 0; index < field.tiles.length; index++) if (field.data[index] !== this.called + 1) field.tiles[index] = TILE.gone;
      field.emit({ t: 'colorDrop', color: this.called });
    } else this.show(field);
  }

  finished(field: Field): boolean {
    return field.alive().length <= 1;
  }

  ranking(field: Field): number[][] {
    // A pet that fell in the very last step has not been written down yet: it went in the wave being played.
    const waveOf = (seat: number) => this.outWave.get(seat) ?? this.wave;
    const waves = [...new Set(field.out.map(waveOf))].sort((a, b) => b - a);
    return [field.aliveSeats(), ...waves.map(wave => field.out.filter(seat => waveOf(seat) === wave))];
  }

  metric(): null {
    return null;
  }

  hash(): number {
    return this.wave * 1000 + this.called * 100 + Math.round(this.left * 10);
  }

  /**
   * A whole new floor, dealt at random. The colour that will be called is chosen now, and gets fewer patches
   * as the round goes on, so the run to it gets longer. Nobody is told which it is until the call.
   */
  private show(field: Field): void {
    this.wave++;
    this.phase = 'show';
    this.left = color.show;
    this.called = field.rng.int(4);
    const safe = color.safePatches[Math.min(this.wave, color.safePatches.length) - 1]!;
    const others = [0, 1, 2, 3].filter(index => index !== this.called);
    const deal = Array.from({ length: color.patches * color.patches }, (_, index) => (index < safe ? this.called : others[index % 3]!));
    for (let index = deal.length - 1; index > 0; index--) {
      const other = field.rng.int(index + 1);
      [deal[index], deal[other]] = [deal[other]!, deal[index]!];
    }
    for (let index = 0; index < field.tiles.length; index++) {
      const column = Math.floor(index / field.rows);
      const row = index % field.rows;
      field.tiles[index] = TILE.solid;
      field.data[index] = deal[Math.floor(column / color.patch) * color.patches + Math.floor(row / color.patch)]! + 1;
    }
    field.emit({ t: 'colorShow', wave: this.wave });
  }
}
