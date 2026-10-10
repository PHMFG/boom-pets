import { BUTTON_BITS, INPUT_STALE_MS } from '@boom/protocol';
import { describe, expect, it } from 'vitest';
import { InputBuffer } from './input';

describe('InputBuffer', () => {
  it('returns the latest stick frame and held buttons', () => {
    const input = new InputBuffer();
    input.setFrame(2, { x: 0.5, y: -1, held: BUTTON_BITS.a }, 1000);
    expect(input.sample(2, 1010)).toEqual({ x: 0.5, y: -1, a: true, b: false, stale: false, edges: [] });
  });

  it('reads a silent seat as a released stick and marks it stale', () => {
    const input = new InputBuffer();
    input.setFrame(0, { x: 1, y: 0, held: BUTTON_BITS.a }, 1000);
    expect(input.sample(0, 1000 + INPUT_STALE_MS)).toMatchObject({ x: 1, stale: false });
    // The button stays held so a charge can pause instead of releasing as a dash.
    expect(input.sample(0, 1000 + INPUT_STALE_MS + 1)).toMatchObject({ x: 0, y: 0, a: true, stale: true });
  });

  it('treats a seat that never sent anything as stale', () => {
    expect(new InputBuffer().sample(3, 0)).toMatchObject({ x: 0, y: 0, a: false, stale: true });
  });

  it('delivers button edges once, in order', () => {
    const input = new InputBuffer();
    input.pushEdge(1, { button: 'a', down: true }, 10);
    input.pushEdge(1, { button: 'b', down: true }, 11);
    expect(input.sample(1, 12).edges).toEqual([{ button: 'a', down: true }, { button: 'b', down: true }]);
    expect(input.sample(1, 13)).toMatchObject({ a: true, b: true, edges: [] });
  });

  it('keeps both edges of a tap that starts and ends between two samples', () => {
    const input = new InputBuffer();
    input.pushEdge(0, { button: 'a', down: true }, 10);
    input.pushEdge(0, { button: 'a', down: false }, 14);
    expect(input.sample(0, 16)).toMatchObject({ a: false, edges: [{ button: 'a', down: true }, { button: 'a', down: false }] });
  });

  it('does not repeat an edge the stick frame already reported', () => {
    const input = new InputBuffer();
    input.setFrame(0, { x: 0, y: 0, held: BUTTON_BITS.a }, 10);
    input.pushEdge(0, { button: 'a', down: true }, 11);
    expect(input.sample(0, 12)).toMatchObject({ a: true, edges: [] });
  });

  it('forgets a cleared seat and ignores seats that do not exist', () => {
    const input = new InputBuffer();
    input.setFrame(0, { x: 1, y: 1, held: 3 }, 10);
    input.pushEdge(0, { button: 'b', down: false }, 11);
    input.clear(0);
    expect(input.sample(0, 12)).toEqual({ x: 0, y: 0, a: false, b: false, stale: true, edges: [] });
    input.setFrame(99, { x: 1, y: 1, held: 0 }, 10);
    expect(input.sample(99, 10).stale).toBe(true);
  });
});
