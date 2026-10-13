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
  /** A score ticking up: long enough to be seen from the sofa. */
  count: { ms: 260 },
  /** Anything idle. */
  breathe: { ms: 2400, amount: 0.02 },
  /** Anything asking to be pressed: one swell this long, back and forth. */
  nudge: { ms: 500 },
  /** A prompt waiting for a key, slower than a nudge. */
  prompt: { ms: 1100 },
  /** Danger: one beat this long, back and forth, which keeps it under three blinks a second. */
  alarm: { ms: 380 },
  /** A shake that says "do something": one swing this long. */
  wobble: { ms: 180 },
  /** The pulse on a phone's border that stands in for vibration. */
  buzz: { ms: 320 },
  /** How a roulette reel slows to a stop. Its length is the simulation's (`tuning.match.introRoulette`). */
  spin: { css: 'cubic-bezier(0.12, 0.7, 0.2, 1)' },
  /** The reel stops this long before the game's card takes its place, and the picture it stopped on swells. */
  landing: { ms: 380 },
  /** The curtain that closes to a point before the world changes behind it, and opens again. */
  iris: { ms: 420, css: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  /** The end of a round: how long the winner has the screen before the places are listed, the gap between rows, and how long a row's number takes to count up. */
  roundResults: { delayMs: 1100, staggerMs: 150, countMs: 700 },
  /** How long a line of the event feed stays. */
  feed: { ms: 3600 },
  /** A line that waits for the player ("press any key", "ENTER to start"): one slow swell, back and forth. */
  swell: { ms: 900 },
  /** A number the whole room watches changing: the timer's last seconds, a round pip filling. */
  tick: { ms: 320 },
  /** The title. Letters drop in one after another, then hop in a wave; the tag line and the prompt follow; on a key the letters fly off. */
  title: { dropMs: 520, dropStaggerMs: 70, hopMs: 2600, hopDelayMs: 900, hopStaggerMs: 110, tagDelayMs: 620, promptDelayMs: 800, flyMs: 360 },
  /** The winner's two beats: the word VITÓRIA! over the podium for this long, and then the banner with the winner's name in its place. */
  victory: { ms: 1300 },
  /** The results: rows arrive one after another once the podium is up. */
  results: { delayMs: 600, staggerMs: 120 },
} as const;

/**
 * ── Between rounds ──────────────────────────────────────────────────────────
 * What the HUD shows when no round is being played: the reel and the card, the lists of places, the points
 * that fly to the players' cards. One block, so the passage from one round to the next can be read in one
 * place. The ones the stylesheet needs are published as `--between-*` by `host/hud/GameScreen.tsx`.
 */
export const between = {
  /**
   * A list that builds itself (a round's places, the final table). A box is never up with nothing in it: its
   * first row starts `leadMs` after the box does, and each row's place in the list opens as the row arrives
   * (over `openMs`, quick at first, so the place is there before the row has grown into it), so the box grows
   * with what it holds.
   */
  list: { leadMs: 140, openMs: 280, openCss: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  /** The final table: its rows arrive this far apart. */
  table: { staggerMs: 150 },
  /**
   * The roulette's reel. It runs for the simulation's `introRoulette`, and slows the way a wheel does (`css`): a
   * blur, then pictures going by one at a time, each slower than the last. It reaches the game to come, drifts
   * a little past the pointers for `settleMs` and drops back into place with a clunk. The clunk falls where
   * `motion.landing` begins, which is where the reel is heard to land (`AudioEngine.roulette`): for `joltMs`
   * the reel jolts, and through `landing` the picture it stopped on swells to `swell`.
   */
  reel: { settleMs: 300, joltMs: 220, swell: 1.25, css: 'cubic-bezier(0.2, 0.75, 0.5, 0.96)' },
  /**
   * What a round paid, flying from a row of the list of places to that player's card: how long the flight is
   * (slow out of the row and slow onto the card, like the curtain), and how long the card's score then takes to
   * count up to its new number.
   */
  points: { flyMs: 560, countMs: 520 },
  /**
   * The game's card: the confetti thrown from behind it as it lands is gone after this long. On the last round
   * the tag that says it counts double is stamped on the card `stampDelayMs` after the card arrives, once its
   * name has been spelled out, and takes `stampMs` to come down.
   */
  card: { burstMs: 760, stampDelayMs: 900, stampMs: 340 },
} as const;
