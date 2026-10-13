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
  /**
   * How a pet reacts on the game screen while a round is played (`host/pets/PetView.ts`, and the events in
   * `host/stages/GameStage.ts`). Milliseconds of the round's own clock, which slow motion stretches.
   */
  feel: {
    /** A hit that lands holds both pets' poses this long; a catch (a grab, a bite) a little longer; the hardest hits (a full charge, a thrown pet landing on a rival) longer still. */
    hitStopMs: 80,
    catchStopMs: 100,
    heavyStopMs: 120,
    /** Sent flying, a pet sees stars for this long once it is back on its feet: after a hit, and after a blast or a throw. */
    dazeMs: 1000,
    dazeLongMs: 1400,
    /** Pleased with itself (it scored; longer when it crossed the line) and fed up (sent back; shorter for a dash at thin air): how long the pose is held. */
    cheerMs: 800,
    finishMs: 1400,
    slumpMs: 1100,
    windedMs: 700,
    /** How long a pet goes on looking at something after it stops mattering: no head snaps back in one frame. */
    lookHoldMs: 300,
    /** How long pets nearby turn to look at something that has just happened: a blast, a pet going over the edge, a knockout. */
    glanceMs: 800,
    /** The bubble over a pet that has just been caught out: sent back by the cat, or red in the face from a pepper. */
    frightMs: 800,
  },
} as const;
