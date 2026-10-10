// What the simulation shows the outside world: state to read every frame, and events for one-shot moments.
// The host reads these and never writes to them.

export type Tier = 'common' | 'rare' | 'cursed' | 'super' | 'superCurse';

/** Seconds each power lasts. Mega Dash ends when it is used; its time is only a safety cap. */
export const POWERS = {
  rocket: { tier: 'common', duration: 6 },
  megaDash: { tier: 'common', duration: 20 },
  jelly: { tier: 'common', duration: 5 },
  giant: { tier: 'rare', duration: 7 },
  decoys: { tier: 'rare', duration: 8 },
  reversed: { tier: 'cursed', duration: 5 },
  pebble: { tier: 'cursed', duration: 6 },
  honk: { tier: 'cursed', duration: 6 },
  kaiju: { tier: 'super', duration: 7 },
  meteorShower: { tier: 'super', duration: 6 },
  pinata: { tier: 'superCurse', duration: 8 },
} as const satisfies Record<string, { tier: Tier; duration: number }>;
export type PowerId = keyof typeof POWERS;

export type Cause = 'fall' | 'dash' | 'barrel' | 'throw' | 'meteor' | 'overcharge' | 'power';
export type Phase = 'lobby' | 'countdown' | 'play' | 'roundEnd' | 'matchEnd';
export type BotStyle = 'coward' | 'kamikaze' | 'thrower';

export type SeatSetup = {
  seat: number;
  /** Pet model id, opaque to the simulation. */
  pet: string;
  name: string;
  /** Null for a human. */
  bot: BotStyle | null;
};

export type Credit = { seat: number; step: number; cause: Cause };

export type Pet = {
  id: number;
  /** The seat that owns this pet. Decoy clones share their owner's seat. */
  seat: number;
  decoy: boolean;
  pet: string;
  alive: boolean;
  /** Position after the latest physics step, and the one before it, for smooth drawing between steps. */
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  /** Radians; 0 faces +z (toward the camera). */
  facing: number;
  grounded: boolean;
  /** Left the platform and is on the way down. */
  falling: boolean;
  /** Standing still right at an edge. */
  teeter: boolean;
  scale: number;
  /** Seconds A has been held; 0 when not charging. */
  chargeTime: number;
  /** Seconds of dash left; 0 when not dashing. */
  dashTime: number;
  dashCharge: number;
  dashX: number;
  dashZ: number;
  /** Seconds until A works again after a dash, and what that wait started at. */
  dashCooldown: number;
  dashCooldownTotal: number;
  /** 0 just after a hit or dash, back to 1 as stick control returns. */
  authority: number;
  /** Seconds left of reaching for a pet before the grab lands. */
  reachTime: number;
  reachTarget: number | null;
  /** Id of the pet carrying this one. */
  carriedBy: number | null;
  carrying: { kind: 'pet' | 'barrel'; id: number } | null;
  carriedTime: number;
  mash: number;
  grabImmune: number;
  /** What B would take right now: the pet or barrel in reach, or null. */
  grabTarget: { kind: 'pet' | 'barrel'; id: number } | null;
  /** Seconds B is locked after a grab at thin air. */
  grabLock: number;
  /** Flying after being thrown, until it lands. */
  thrown: boolean;
  lastHit: Credit | null;
  /** The power running now. */
  power: PowerId | null;
  powerLeft: number;
  powerTotal: number;
  /** A power collected and not yet used. The power button starts it. */
  held: PowerId | null;
  /** A roll whose slot reels are still spinning. */
  slot: { tier: Tier; power: PowerId; left: number } | null;
  /** Lobby only: seconds until this pet drops back in. */
  respawnIn: number;
};

export type Barrel = {
  id: number;
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  /** Seconds until it explodes; null while idle. */
  fuse: number | null;
  chain: number;
  owner: number | null;
  carriedBy: number | null;
  thrown: boolean;
  grounded: boolean;
};

export type Cube = { id: number; x: number; y: number; z: number; landed: boolean };
export type Meteor = { id: number; x: number; z: number; left: number; total: number; radius: number; owner: number; fromGhost: boolean };
export type Ghost = { seat: number; x: number; z: number; cooldown: number; cooldownTotal: number };

/** Tile states, one per tile in a size-by-size grid (index = column * size + row). */
export const TILE = { solid: 0, warning: 1, gone: 2 } as const;

export type GachaView = {
  seat: number;
  /** Real seconds since the sequence began. */
  time: number;
  /** How far the winner has pulled the lever, 0 to 1. */
  lever: number;
  pulled: boolean;
  jinx: number;
  /** Set at the reveal. */
  cursed: boolean | null;
  power: PowerId;
};

export type AwardId =
  | 'selfDestruct'
  | 'accident'
  | 'thrower'
  | 'unlucky'
  | 'meteor'
  | 'chain'
  | 'faller'
  | 'honker';

export type Standing = { seat: number; score: number; place: number; award: AwardId | null };

export type GameEvent =
  | { t: 'phase'; phase: Phase; round: number }
  | { t: 'countdown'; n: number }
  | { t: 'spawn'; pet: number; seat: number }
  | { t: 'dash'; pet: number; charge: number; x: number; z: number; dx: number; dz: number }
  | { t: 'dashHit'; pet: number; seat: number; x: number; y: number; z: number; charge: number; radius: number; victims: number[] }
  | { t: 'dashEnd'; pet: number; seat: number; hit: boolean }
  /** A was pressed while the pet was still catching its breath. */
  | { t: 'tired'; pet: number }
  | { t: 'explosion'; x: number; y: number; z: number; radius: number; cause: Cause; chain: number; owner: number | null }
  | { t: 'barrelArmed'; barrel: number; delay: number }
  | { t: 'barrelSpawn'; barrel: number }
  | { t: 'reach'; pet: number; target: number }
  | { t: 'grab'; pet: number; kind: 'pet' | 'barrel'; target: number }
  | { t: 'grabMiss'; pet: number }
  | { t: 'throw'; pet: number; kind: 'pet' | 'barrel'; target: number }
  /** A thrown pet landed on a rival. */
  | { t: 'throwHit'; pet: number; victim: number; seat: number | null; x: number; z: number }
  | { t: 'escape'; pet: number }
  | { t: 'land'; pet: number; speed: number }
  | { t: 'fall'; pet: number; seat: number }
  | { t: 'eliminated'; pet: number; seat: number; decoy: boolean; cause: Cause; killer: number | null; x: number; z: number }
  | { t: 'tileWarn'; index: number }
  | { t: 'tileFall'; index: number; broken: boolean }
  | { t: 'cubeSpawn'; x: number; z: number }
  | { t: 'cubeCollected'; pet: number; seat: number; x: number; z: number }
  | { t: 'roll'; pet: number; seat: number; tier: Tier; power: PowerId; pity: number; instant: boolean }
  /** A power is now waiting on the pet's power button. */
  | { t: 'powerReady'; pet: number; seat: number; power: PowerId }
  | { t: 'powerStart'; pet: number; seat: number; power: PowerId }
  | { t: 'powerEnd'; pet: number; seat: number; power: PowerId }
  | { t: 'honk'; pet: number }
  | { t: 'gachaStart'; seat: number; pet: number }
  | { t: 'gachaLever'; seat: number }
  | { t: 'gachaJinx'; seat: number; total: number }
  | { t: 'gachaReveal'; seat: number; cursed: boolean; power: PowerId }
  | { t: 'gachaEnd'; seat: number }
  | { t: 'meteorCall'; id: number; x: number; z: number; delay: number; radius: number; owner: number }
  | { t: 'ghost'; seat: number; x: number; z: number }
  | { t: 'revengeSwap'; ghost: number; victim: number }
  | { t: 'score'; seat: number; points: number; reason: 'kill' | 'place' | 'swap' | 'bounty'; x: number | null; z: number | null }
  | { t: 'bounty'; seat: number | null }
  | { t: 'slowMo'; scale: number; seconds: number }
  | { t: 'roundWinner'; seats: number[] };
