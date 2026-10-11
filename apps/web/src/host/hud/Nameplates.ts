// Name tags that follow things in the 3D scene. Written straight to the DOM every frame:
// going through React at 60 fps would re-render the whole HUD.
import type { SeatInfo } from '@boom/protocol';
import { seatShapeSvg } from '../../shared/glyphs';
import { motion } from '../../shared/motion';
import { strings } from '../../shared/strings.pt-BR';
import { colors, seats as seatTokens } from '../../shared/tokens';

/** Where a tag stands by its pet: over its head, or to one side of it when over would cover another pet. */
export type TagSide = 'above' | 'left' | 'right';
type Plate = {
  anchor: HTMLElement;
  tag: HTMLElement;
  name: HTMLElement;
  sleep: HTMLElement;
  held: HTMLElement;
  hand: HTMLElement;
  holdUntil: number | null;
  heldIcon: string | null;
  reachedBy: number | null;
  /** How it stands now, as last written to the page, so the page is only written to when that changes. */
  stand: string;
  /** Its size in pixels with its whole name showing, measured now and then: reading it every frame would cost a layout. */
  size: { width: number; height: number };
  measured: number;
};

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

  /** How big a tag is on the page with its name showing, in pixels. */
  size(seat: number): { width: number; height: number } {
    const plate = this.plates.get(seat);
    if (!plate) return { width: 0, height: 0 };
    if (plate.measured-- <= 0 && !plate.tag.classList.contains('is-compact')) {
      plate.size = { width: plate.tag.offsetWidth, height: plate.tag.offsetHeight };
      plate.measured = 30;
    }
    return plate.size;
  }

  /**
   * Says where a tag stands by its pet. Over the head is the usual place. To one side it is `reach` pixels out from
   * the point over the head and `drop` pixels down from it, level with the pet's middle, pointing across at it.
   * `compact` leaves only the seat's shape on it: for a crowd, where any place would cover somebody.
   */
  stand(seat: number, side: TagSide, reach: number, drop: number, compact: boolean): void {
    const plate = this.plates.get(seat);
    if (!plate) return;
    const stand = `${side} ${Math.round(reach)} ${Math.round(drop)} ${compact}`;
    if (plate.stand === stand) return;
    plate.stand = stand;
    plate.tag.classList.toggle('is-left', side === 'left');
    plate.tag.classList.toggle('is-right', side === 'right');
    plate.tag.classList.toggle('is-compact', compact);
    plate.tag.style.setProperty('--reach', `${Math.round(reach)}px`);
    plate.tag.style.setProperty('--drop', `${Math.round(drop)}px`);
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
    shape.innerHTML = seatShapeSvg(token.shape, colors.white);
    const name = document.createElement('span');
    name.className = 'nameplate-name';
    const sleep = document.createElement('span');
    sleep.className = 'nameplate-sleep';
    const held = document.createElement('span');
    held.className = 'nameplate-held';
    const hand = document.createElement('span');
    hand.className = 'nameplate-hand';
    tag.append(shape, name, sleep, held, hand);
    anchor.append(tag);
    this.layer.append(anchor);
    const plate: Plate = { anchor, tag, name, sleep, held, hand, holdUntil: null, heldIcon: null, reachedBy: null, stand: '', size: { width: 0, height: 0 }, measured: 0 };
    this.plates.set(seat, plate);
    return plate;
  }
}
