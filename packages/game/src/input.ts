// The latest input per seat. Phones, bots and a debug keyboard all write here, so the
// simulation never knows which one it is reading.
import { BUTTON_BITS, INPUT_STALE_MS, MAX_SEATS, type ButtonName } from '@boom/protocol';

export type ButtonEdge = { button: ButtonName; down: boolean };

export type SampledInput = {
  /** Right is positive. */
  x: number;
  /** Up (away from the player) is positive. */
  y: number;
  a: boolean;
  b: boolean;
  /** No input arrived recently: the stick reads as released and a charge must pause, not grow. */
  stale: boolean;
  /** Presses and releases since the last sample, in order. A tap shorter than a tick still shows as two edges. */
  edges: ButtonEdge[];
};

type Slot = { x: number; y: number; held: number; at: number; edges: ButtonEdge[] };

const emptySlot = (): Slot => ({ x: 0, y: 0, held: 0, at: -Infinity, edges: [] });

export class InputBuffer {
  private readonly slots = Array.from({ length: MAX_SEATS }, emptySlot);

  /** Stores a stick frame. `now` is any monotonic millisecond clock, the same one passed to `sample`. */
  setFrame(seat: number, frame: { x: number; y: number; held: number }, now: number): void {
    const slot = this.slots[seat];
    if (!slot) return;
    slot.x = frame.x;
    slot.y = frame.y;
    slot.held = frame.held;
    slot.at = now;
  }

  /** Records a press or release the instant it arrives, ahead of the next stick frame. */
  pushEdge(seat: number, edge: ButtonEdge, now: number): void {
    const slot = this.slots[seat];
    if (!slot) return;
    const bit = BUTTON_BITS[edge.button];
    const wasDown = (slot.held & bit) !== 0;
    slot.held = edge.down ? slot.held | bit : slot.held & ~bit;
    slot.at = now;
    // Stick frames also carry the held buttons, so the same change can arrive twice; keep one edge.
    if (wasDown !== edge.down) slot.edges.push(edge);
  }

  /** Reads a seat's input for one tick and empties its edge queue. */
  sample(seat: number, now: number): SampledInput {
    const slot = this.slots[seat];
    if (!slot) return { x: 0, y: 0, a: false, b: false, stale: true, edges: [] };
    const stale = now - slot.at > INPUT_STALE_MS;
    const edges = slot.edges;
    slot.edges = [];
    return {
      x: stale ? 0 : slot.x,
      y: stale ? 0 : slot.y,
      a: (slot.held & BUTTON_BITS.a) !== 0,
      b: (slot.held & BUTTON_BITS.b) !== 0,
      stale,
      edges,
    };
  }

  /** Forgets a seat, for when its player leaves or reconnects. */
  clear(seat: number): void {
    if (this.slots[seat]) this.slots[seat] = emptySlot();
  }
}
