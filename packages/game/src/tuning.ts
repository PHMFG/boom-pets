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

/** Pinta o Chão. */
export const paint = {
  cap: 40,
  columns: 14,
  rows: 12,
  /** For the last seconds nobody is shown the count. */
  hideLast: 8,
  /** Seconds before the first bucket of paint drops, and between buckets after it. */
  bucketFirst: 6,
  bucketEvery: 7,
  /** Seconds a bucket takes to come down: its spot is marked on the floor meanwhile. */
  bucketDrop: 1.2,
  pickupRadius: 0.95,
  /** A kicked bucket paints every tile this close to it. */
  splashRadius: 2.3,
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
