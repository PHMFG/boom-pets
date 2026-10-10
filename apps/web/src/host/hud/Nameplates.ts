// Name tags that follow things in the 3D scene. Written straight to the DOM every frame:
// going through React at 60 fps would re-render the whole HUD.
import type { SeatInfo } from '@boom/protocol';
import { seatShapeSvg } from '../../shared/glyphs';
import { motion } from '../../shared/motion';
import { strings } from '../../shared/strings.pt-BR';
import { seats as seatTokens } from '../../shared/tokens';

type Plate = { anchor: HTMLElement; tag: HTMLElement; name: HTMLElement; sleep: HTMLElement; held: HTMLElement; hand: HTMLElement; holdUntil: number | null; heldIcon: string | null; reachedBy: number | null };

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

  /** Shows the power waiting on a seat's button as a badge on its tag, so everyone can see who is holding what. */
  setHeld(seat: number, icon: string | null, color: string): void {
    const plate = this.plates.get(seat);
    if (!plate || plate.heldIcon === icon) return;
    plate.heldIcon = icon;
    plate.held.textContent = icon ?? '';
    plate.held.style.setProperty('--tier', color);
  }

  /** Marks a seat as within another player's reach: a hand in that player's colour over the tag. */
  setReach(seat: number, grabber: number | null): void {
    const plate = this.plates.get(seat);
    if (!plate || plate.reachedBy === grabber) return;
    plate.reachedBy = grabber;
    plate.hand.textContent = grabber === null ? '' : '✋';
    if (grabber !== null) plate.hand.style.setProperty('--grabber', seatTokens[grabber % seatTokens.length]!.color);
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
    const held = document.createElement('span');
    held.className = 'nameplate-held';
    const hand = document.createElement('span');
    hand.className = 'nameplate-hand';
    tag.append(shape, name, sleep, held, hand);
    anchor.append(tag);
    this.layer.append(anchor);
    const plate: Plate = { anchor, tag, name, sleep, held, hand, holdUntil: null, heldIcon: null, reachedBy: null };
    this.plates.set(seat, plate);
    return plate;
  }
}
