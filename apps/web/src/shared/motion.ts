// UI motion timings shared by the host HUD and the phone. Nothing enters, moves or leaves without one of these.
export const motion = {
  /** Anything entering: scale 0 to 1 with overshoot. */
  popIn: { ms: 280, overshoot: 1.15, css: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  /** Anything leaving: a small swell, then 0. */
  squishOut: { ms: 160, swell: 1.08, css: 'cubic-bezier(0.36, 0, 0.66, -0.56)' },
  /** Cards, crown, flying points: fast start, soft stop. */
  move: { ms: 420, css: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  /** Delay between items of a list or row. */
  staggerMs: 40,
  /** Number change, button press. */
  punch: { ms: 90, scale: 1.2 },
  /** Anything idle. */
  breathe: { ms: 2400, amount: 0.02 },
} as const;
