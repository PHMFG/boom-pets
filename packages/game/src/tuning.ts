// Every number that shapes how the game feels. Starting values from the design doc; tune here after playtests.
// Distances are metres, times are seconds, speeds are metres per second.

export const STEP = 1 / 60;

export const arena = {
  /** Tiles per side. Each tile is 1 m. */
  size: 16,
  /** A pet below this height is gone. */
  killY: -9,
  gravity: -30,
  /** Seconds of play before the outer ring starts to go. */
  shrinkAfter: 20,
  /** Seconds a ring shakes before it falls. */
  warnTime: 1,
  /** Seconds between rings. */
  ringEvery: 8,
  /** Rings stop falling when this many tiles per side remain. */
  minSize: 4,
  /** In the last seconds of a round, explosions also break tiles. */
  explosionsBreakTilesInLast: 15,
} as const;

export const pet = {
  radius: 0.4,
  halfHeight: 0.25,
  speed: 6,
  /** How quickly the stick takes hold of the velocity (higher is snappier). */
  control: 14,
  /** Seconds for stick control to come back after a hit or a dash. */
  controlRecovery: 0.7,
  /** How quickly a knocked pet slides to a stop on the ground. */
  slideFriction: 2.2,
  turnRate: 16,
  /** How far below standing height a pet can be and still step back onto a tile. */
  stepUp: 0.35,
  /** Standing this close to a missing tile makes a slow pet teeter. */
  teeterDistance: 0.38,
} as const;

export const dash = {
  /** Seconds of holding A for a full charge. */
  chargeTime: 1.2,
  /** Seconds of holding A at which the phone and pet start warning. */
  warnAt: 1.4,
  /** Seconds of holding A at which the pet detonates. */
  overchargeAt: 1.8,
  /** Movement speed while charging, as a share of normal. */
  chargingSpeed: 0.35,
  minSpeed: 6,
  maxSpeed: 18,
  /** Seconds the dash itself lasts, at zero and at full charge. */
  minDuration: 0.2,
  maxDuration: 0.3,
  minRadius: 1.5,
  maxRadius: 3.5,
  /** Upward speed given to a pet that is hit. */
  lift: 5,
  /** Extra reach of the hit test beyond the two bodies touching. */
  reach: 0.18,
  /** Share of the blast a pet at the very edge of the radius receives. */
  edgeFalloff: 0.35,
  /** Degrees a dash bends toward a rival in the stick's direction. */
  aimAssist: 25,
  aimRange: 9,
  /** A barrel only explodes when dashed at this charge or more. */
  barrelCharge: 0.5,
  overchargeForce: 20,
  /** A dash with less than this share of a full charge (a tap) is only a shove: one pet, a small push, no blast. */
  shoveBelow: 0.25,
  shoveForce: 4.5,
  shoveLift: 1.5,
  /** Stick control a shoved pet keeps. A real hit leaves none. */
  shoveControl: 0.6,
  /** Seconds before A works again after a dash that hit something, and after one that hit nothing. */
  cooldown: 0.5,
  cooldownMiss: 0.9,
} as const;

export const grab = {
  range: 1.7,
  /** Seconds a pet lunges at another pet before the grab lands. Barrels are instant. */
  windUp: 0.2,
  lungeSpeed: 9,
  /** How much farther than `range` the target may be when the lunge ends. */
  slack: 0.7,
  /** Seconds B does nothing after a grab at thin air. */
  missLock: 0.4,
  carrySpeed: 0.85,
  escapeTime: 2.5,
  escapeTaps: 8,
  /** Seconds a grabbed pet is held before its taps start to count: time to turn toward an edge. */
  escapeGrace: 0.5,
  /** How much a carried pet's wriggling slows the carrier, at the last tap before it gets free. */
  struggle: 0.4,
  /** Seconds a released pet cannot be grabbed again. */
  immunity: 1,
  throwSpeed: 11.5,
  throwLift: 6.5,
  /** Share of its speed a thrown pet keeps when it lands. It splats rather than slides, so where it was thrown from matters. */
  landGrip: 0.45,
  /** Knock given to a rival that a thrown pet lands on. */
  throwHitForce: 11,
  throwHitLift: 5,
} as const;

export const barrel = {
  count: 6,
  lobbyCount: 3,
  lobbyRespawn: 4,
  radius: 0.42,
  halfHeight: 0.45,
  blastRadius: 2.6,
  force: 15,
  lift: 7,
  /** Seconds between links of a chain reaction, so players can follow it. */
  chainDelay: 0.15,
} as const;

export const meteor = {
  /** Seconds the shadow grows before impact. */
  delay: 1,
  cooldown: 4,
  cooldownAfterSwap: 6,
  radius: 2,
  force: 13,
  cursorSpeed: 10,
} as const;

export const cube = {
  minGap: 12,
  maxGap: 18,
  pickupRadius: 0.95,
  dropTime: 1.2,
  /** Seconds the slot reels spin over the pet. The result is already decided. */
  slotTime: 1,
  /** Rolls without a SUPER before the next one is guaranteed. */
  pity: 6,
} as const;

/** The SUPER powers. A SUPER is rare, so it has to be the event of its round. */
export const supers = {
  /** A SUPER that held arrives with a strike on its owner's spot, which spares the owner: seconds the floor warns, and how far the blast reaches. */
  arrivalDelay: 0.8,
  arrivalRadius: 4,
  arrivalForce: 16,
  /** Kaiju: size, weight and walking speed as multiples of a normal pet. It keeps pace with a pet on foot. */
  kaijuScale: 3.2,
  kaijuMass: 10,
  kaijuSpeed: 1,
  /** Every step of a walking kaiju is a blast around its feet: seconds between steps, reach, push and lift. */
  kaijuStepEvery: 0.34,
  kaijuStepRadius: 2.6,
  kaijuStepForce: 12,
  kaijuStepLift: 5,
  /** How much harder and wider a kaiju's charged dash hits. A tap is still only a shove. */
  kaijuDash: 1.5,
  /** Meteor Shower: seconds between meteors, how long each one warns, and how far its blast reaches. */
  showerEvery: 0.22,
  showerDelay: 0.8,
  showerRadius: 2.3,
  showerForce: 14,
  /** Each meteor of the shower also knocks out the tiles this close to where it lands: a pet that does not move falls through. */
  showerHole: 0.8,
  /** Of every three meteors, this many are aimed at a rival, each rival in turn. The rest fall anywhere. */
  showerAimed: 2,
  /** How far ahead of a running rival an aimed meteor lands, as a share of the ground the rival would cover before it hits. Turning is the way out. */
  showerLead: 0.8,
  /** No meteor of the shower lands this close to the pet that called it, so standing next to that pet is the way out. */
  showerSafe: 2.5,
} as const;

/** Batata Quente. */
export const potato = {
  cap: 80,
  /** The arena is round, with a wall. */
  radius: 7.5,
  /** Seconds before the first bomb is handed out, and between one going off and the next. */
  firstWait: 1.5,
  nextWait: 2.2,
  /** Seconds on the first fuse, how much shorter each one is, and the shortest it gets. */
  fuse: 9.5,
  fuseStep: 0.7,
  fuseMin: 5.5,
  /** How close two pets must be for the bomb to pass, beyond touching. */
  touch: 0.12,
  /** Seconds the bomb cannot go straight back to whoever just passed it. */
  noReturn: 0.8,
  /** How much faster the pet with the bomb is. */
  holderSpeed: 1.15,
  blastRadius: 3,
  blastForce: 9,
  blastLift: 5,
} as const;

/** Batatinha Frita 1, 2, 3. */
export const frita = {
  cap: 90,
  /** A wide, shallow lane: it runs left to right, so the whole way fits a wide screen. */
  columns: 32,
  rows: 11,
  /** The finish line is this far from the right-hand end. */
  finish: 3,
  /** Seconds the round goes on after the first pet crosses the line. */
  finishGrace: 10,
  /** How fast a pet goes here, as a share of normal: on tiptoe, so the way takes many songs. */
  speed: 0.46,
  /** The shortest and longest the cat sings with its back turned, and the shortest and longest it looks. */
  singMin: 1.2,
  singMax: 2.8,
  watchMin: 1.4,
  watchMax: 2.4,
  /** Seconds after it turns before anyone is judged: time for a thumb to let go, and for a slow network. */
  // Wide enough that a phone's lag alone catches nobody: the slower phones in the playtests ran 120 to 180 ms behind,
  // which leaves about a quarter of a second for the thumb itself.
  grace: 0.45,
  /** How far the joystick may still be pushed while the cat looks. */
  stickLimit: 0.25,
} as const;

/** Cor Certa. */
export const color = {
  cap: 75,
  /** The floor is this many patches a side, each this many tiles a side. A multiple of two keeps every colour equal. */
  patches: 4,
  patch: 4,
  /** Seconds a new floor is shown before a colour is called. */
  show: 1.3,
  /** Seconds to reach the colour on the first call, how much shorter each call is, and the shortest it gets. */
  count: 3.8,
  countStep: 0.4,
  countMin: 1.3,
  /** How many patches the colour about to be called has, wave by wave; the last number goes on. Fewer means farther to run. */
  safePatches: [4, 4, 3, 3, 2, 2, 1],
  /** Seconds the other tiles stay gone: long enough for whoever was on them to fall. */
  drop: 1.5,
} as const;

/** Corrida Maluca. */
export const race = {
  cap: 105,
  /**
   * The floor, and the grid of points the track may turn at: so many across and so many deep, so far apart. The
   * track is three tiles wide, so two stretches side by side have three or four tiles of nothing between them, and
   * the outermost points leave just the track's own width to the floor's edge.
   */
  columns: 33,
  rows: 27,
  nodesX: 6,
  nodesZ: 5,
  pitchX: 6,
  pitchZ: 6,
  /** A track is drawn afresh each round. It is at least this long, in metres, and has room for at least this many obstacles: one that only twists is not a race. */
  minLength: 150,
  minHurdles: 11,
  /**
   * Where obstacles go: only on a straight at least `minRun` long, none nearer a corner than `clear` (room to
   * come out of the turn and run), none nearer the start than `lead`, and about `spacing` apart. Whole numbers:
   * an obstacle is centred half a tile off them, on a line between tiles.
   */
  minRun: 12,
  clear: 5,
  lead: 7,
  spacing: 7,
  /** Seconds the round goes on after the first pet crosses the line. */
  grace: 10,
  /** Upward speed of a jump: about 0.9 m high and 3 m long at a run, enough for a gap of two tiles and not for the three between two stretches of track. */
  jumpSpeed: 7.5,
  jumpRest: 0.2,
  /** Tiles of track an obstacle takes up, and how many a gap takes away. Even numbers: an obstacle is centred on a line between tiles. */
  stretch: 4,
  gapLength: 2,
  /** Tiles that blink: seconds solid, seconds shaking, and the whole cycle. */
  blinkSolid: 1.7,
  blinkWarn: 0.7,
  blinkCycle: 3.6,
  /** A sweeping bar: radians a second, how far it reaches from its post, how near its middle line a pet is hit, and how hard. */
  sweepSpeed: 2.1,
  sweepReach: 1.7,
  sweepThick: 0.4,
  sweepForce: 8,
  sweepLift: 4,
  /** The most progress one step on the floor can add. A landing on another stretch of the track is farther than this, so it is not counted. */
  maxStride: 4,
} as const;

/** Come e Cresce. */
export const grow = {
  cap: 55,
  columns: 20,
  rows: 15,
  /** Seconds between two pieces of food with two pets on the blanket (faster with more), and the most that may lie there at once. */
  foodEvery: 0.75,
  maxFood: 24,
  /** Seconds a piece takes to fall. */
  dropTime: 0.7,
  /** Chances of an apple, a doughnut, a slice of watermelon and a pepper, out of 100, and what each is worth. The pepper shrinks. */
  kindWeights: [56, 28, 9, 7],
  value: { apple: 1, donut: 2, melon: 4, pepper: -4 },
  /** How near a piece a pet of normal size must be to eat it. */
  mouth: 0.8,
  /** Points for each size a pet grows, how many sizes there are, how much bigger each makes it, and how much slower. */
  perSize: 7,
  sizes: 8,
  growPerSize: 0.11,
  slowPerSize: 0.035,
  /** Seconds between feasts: a slice of watermelon dropped beside whoever is smallest. */
  feastEvery: 6,
  /** A's bite: a short lunge, then a rest, longer after a miss. */
  biteSpeed: 10,
  biteSeconds: 0.22,
  biteRest: 0.7,
  biteRestMiss: 1,
  /** A bite only counts on a pet this many sizes smaller. It loses this share of what it ate, as crumbs, and cannot be bitten again for a moment. */
  biteLead: 2,
  biteShare: 0.25,
  maxCrumbs: 8,
  biteImmune: 3,
  biteForce: 9,
  biteLift: 5,
  /** A bite on anyone else is only this much of a bump. */
  bumpForce: 3.5,
} as const;

/** O Chão é Lava. */
export const lava = {
  /** Pets are out in this game, so its cap stays with the other games that have someone watching (see "What a new game has to be", item 4). */
  cap: 75,
  columns: 20,
  rows: 16,
  /** How high a piece of furniture stands (never more than 0.3, or a pet could not step up onto it). */
  height: 0.3,
  /**
   * The furniture that falls from the sky: how many pets each piece is meant for, and the part of its top a
   * pet is safe on (a circle's radius, or a rectangle's width and depth). The safe part is a little smaller
   * than the piece is drawn, so a pet that looks on it is on it. `seats` is what a wave is counted in and
   * where bots stand; it is not a limit. Pets that keep still can squeeze more onto a piece than it seats,
   * and one shove undoes that: the squeeze and the shove are the game.
   */
  pieces: {
    pouf: { seats: 1, radius: 0.6, width: 0, depth: 0 },
    armchair: { seats: 1, radius: 0.6, width: 0, depth: 0 },
    table: { seats: 2, radius: 0, width: 2.05, depth: 1.1 },
    sofa: { seats: 3, radius: 0, width: 3.25, depth: 1.1 },
    bed: { seats: 4, radius: 0, width: 1.75, depth: 1.75 },
  },
  /** Pieces never land closer together than this, edge to edge, or nearer the wall than this. */
  gap: 1.8,
  /** Seconds after a wave starts before the first piece lands, and between one landing and the next. Every piece's spot is marked on the floor from the start of the wave. */
  dropFirst: 1.3,
  dropEvery: 0.55,
  /** Seconds between the last piece landing and the alarm on the first wave, how much shorter each wave after it, and the shortest it gets. */
  calm: 3,
  calmStep: 0.4,
  calmMin: 1.2,
  /** For this many waves at the start there is a seat for every pet: the first to learn on, the second with less time, and nobody has to be left out of either. After that there is one too few. */
  spareWaves: 2,
  /** From this wave on there are two seats too few (never fewer than one seat): a room that has learnt to squeeze up is thinned all the same. */
  scarceFrom: 5,
  /** Seconds the alarm sounds before the lava is up, and seconds it stays up. */
  alarm: 3,
  flood: 2,
  /** A's shove: a short lunge that pushes whoever it touches, then a rest, longer after a miss. */
  shoveSpeed: 9,
  shoveSeconds: 0.2,
  shoveForce: 6,
  shoveLift: 2,
  shoveRest: 0.5,
  shoveRestMiss: 0.9,
} as const;

/** Pinta o Chão. */
export const paint = {
  cap: 55,
  columns: 18,
  rows: 15,
  /** For the last seconds nobody is shown the count. */
  hideLast: 10,
  /** Seconds before the first bucket of paint drops, and between buckets after it. */
  bucketFirst: 5,
  bucketEvery: 5.5,
  /** Seconds a bucket takes to come down: its spot is marked on the floor meanwhile. */
  bucketDrop: 1.2,
  pickupRadius: 0.95,
  /** A kicked bucket paints every tile this close to it. */
  splashRadius: 2.6,
} as const;

export const gacha = {
  /** Game speed while the sequence plays. */
  dilation: 0.1,
  machineAt: 0.3,
  leverFrom: 0.8,
  leverUntil: 1.6,
  revealAt: 2.4,
  duration: 3.2,
  /** Each ZICA tap adds one percent of curse chance, up to this. */
  maxCurse: 25,
} as const;

export const match = {
  rounds: 5,
  quickRounds: 3,
  /** Seconds the roulette spins before the next game is revealed, and how long its card then stays: longer the first time a game comes up. */
  introRoulette: 2,
  introCardFirst: 4,
  introCard: 2.5,
  countdown: 3,
  roundCap: 75,
  roundEnd: 5,
  /** Seconds the finale lasts, and when in it third place, second place and the winner are shown. */
  finale: 9,
  finaleReveal: [1.8, 3, 4.6],
  /** Seats filled with bots when few humans play. */
  fillTo: 4,
  /** Seconds a knock is remembered for kill credit. */
  creditWindow: 3,
  /**
   * Every game pays the same for where a player finished, so no game weighs more than another.
   * In the brawl a knockout, a ghost's swap back in and knocking out the leader add a point each on top.
   */
  placePoints: [6, 4, 3, 2, 1],
  killPoints: 1,
  swapPoints: 1,
  bountyPoints: 1,
  finalRoundFactor: 2,
  /** The player in last place gets a bigger blast. */
  underdogRadius: 1.2,
  /** Game speed and real seconds of slow motion when a pet is knocked out. */
  slowMo: 0.3,
  slowMoTime: 0.6,
  /** Minimum real seconds between two slow-motion moments. */
  slowMoGap: 2.5,
  lobbyRespawn: 1,
} as const;

export const bot = {
  /** Seconds between decisions. */
  think: 0.1,
  /** Seconds before a decision takes effect. */
  reaction: 0.25,
  /** Degrees of aim error. */
  aimNoise: 14,
  edgeFear: 1.4,
} as const;
