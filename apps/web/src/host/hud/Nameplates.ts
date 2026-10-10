// Name tags that follow things in the 3D scene. Written straight to the DOM every frame:
// going through React at 60 fps would re-render the whole HUD.
import type { SeatInfo } from '@boom/protocol';
import { seatShapeSvg } from '../../shared/glyphs';
import { motion } from '../../shared/motion';
import { strings } from '../../shared/strings.pt-BR';
import { seats as seatTokens } from '../../shared/tokens';

type Plate = { anchor: HTMLElement; tag: HTMLElement; name: HTMLElement; sleep: HTMLElement; holdUntil: number | null };

export class Nameplates {
  private readonly layer: HTMLElement;
  private readonly plates = new Map<number, Plate>();

  constructor(layer: HTMLElement) {
    this.layer = layer;
  }

  /** Adds, updates and removes tags to match the roster. `rosterAt` is when that roster arrived. */
  sync(seats: SeatInfo[], rosterAt: number): void {
    const present = new Set(seats.map(seat => seat.seat));
    for (const [seat, plate] of this.plates) {
      if (present.has(seat)) continue;
      this.plates.delete(seat);
      plate.tag.classList.add('is-leaving');
      window.setTimeout(() => plate.anchor.remove(), motion.squishOut.ms);
    }
    for (const info of seats) {
      const plate = this.plates.get(info.seat) ?? this.create(info.seat);
      plate.name.textContent = info.name;
      plate.tag.classList.toggle('is-away', !info.connected);
      plate.holdUntil = info.holdMsLeft === null ? null : rosterAt + info.holdMsLeft;
    }
  }

  /** Moves a tag to a point in canvas pixels. */
  place(seat: number, x: number, y: number): void {
    const plate = this.plates.get(seat);
    if (plate) plate.anchor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  /** Puts a crown on the seat that is leading, or on nobody. */
  setCrown(seat: number | null): void {
    for (const [index, plate] of this.plates) plate.tag.classList.toggle('has-crown', index === seat);
  }

  /** Refreshes the countdown on seats whose phone dropped. */
  tick(now: number): void {
    for (const plate of this.plates.values()) {
      const text = plate.holdUntil === null ? '' : strings.lobby.sleeping(Math.max(0, Math.ceil((plate.holdUntil - now) / 1000)));
      if (plate.sleep.textContent !== text) plate.sleep.textContent = text;
    }
  }

  dispose(): void {
    this.plates.forEach(plate => plate.anchor.remove());
    this.plates.clear();
  }

  private create(seat: number): Plate {
    const token = seatTokens[seat % seatTokens.length]!;
    // The anchor carries the position; the tag inside carries the pop-in, so the two transforms never fight.
    const anchor = document.createElement('div');
    anchor.className = 'nameplate-anchor';
    const tag = document.createElement('div');
    tag.className = 'nameplate';
    tag.style.setProperty('--seat', token.color);
    const shape = document.createElement('span');
    shape.className = 'nameplate-shape';
    shape.innerHTML = seatShapeSvg(token.shape, token.color);
    const name = document.createElement('span');
    const sleep = document.createElement('span');
    sleep.className = 'nameplate-sleep';
    tag.append(shape, name, sleep);
    anchor.append(tag);
    this.layer.append(anchor);
    const plate: Plate = { anchor, tag, name, sleep, holdUntil: null };
    this.plates.set(seat, plate);
    return plate;
  }
}
