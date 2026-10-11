// What the simulation shows the outside world: state to read every frame, and events for one-shot moments.
// The host reads these and never writes to them.
import type { SampledInput } from './input';

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
  kaiju: { tier: 'super', duration: 9 },
  meteorShower: { tier: 'super', duration: 8 },
  pinata: { tier: 'superCurse', duration: 8 },
} as const satisfies Record<string, { tier: Tier; duration: number }>;
export type PowerId = keyof typeof POWERS;

export type Cause = 'fall' | 'dash' | 'barrel' | 'throw' | 'meteor' | 'overcharge' | 'power' | 'lava' | 'bomb';

/** The games a round can be. `brawl` is the original; the others are the simple games played on a `Field`. */
export const GAME_MODES = ['brawl', 'lava', 'grow', 'race', 'color', 'potato', 'paint', 'frita'] as const;
export type GameMode = (typeof GAME_MODES)[number];
export type MiniMode = Exclude<GameMode, 'brawl'>;
/**
 * Where a match is. Each round is `intro` (the next game is drawn and explained), `countdown`, `play`, `roundEnd`;
 * after the last one, `finale` reveals the places from third up, then `matchEnd` waits for a rematch.
 */
export type Phase = 'lobby' | 'intro' | 'countdown' | 'play' | 'roundEnd' | 'finale' | 'matchEnd';
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
export type Meteor = {
  id: number;
  x: number;
  z: number;
  left: number;
  total: number;
  radius: number;
  force: number;
  /** Tiles this close to the centre fall when it lands; 0 for none. */
  hole: number;
  owner: number;
  fromGhost: boolean;
};
export type Ghost = {
  seat: number;
  x: number;
  z: number;
  cooldown: number;
  cooldownTotal: number;
  /** True in the brawl, where a ghost aims meteors. False for one that only watches. */
  cursor: boolean;
};

/**
 * What every kind of round offers, whatever game it is. The game, the screen, the logs and the tools read a
 * round through this; anything only the brawl has (barrels, the cube, powers) is reached after checking `gameMode`.
 */
export interface RoundCore {
  readonly gameMode: GameMode;
  /** Seconds of play before the round is called. Infinity in the lobby. */
  readonly cap: number;
  readonly pets: Pet[];
  readonly ghosts: Ghost[];
  /** Seats in the order they were knocked out. */
  readonly out: number[];
  /** Seconds of play so far. */
  time: number;
  steps: number;
  playing: boolean;
  finished: boolean;
  step(read: (seat: number) => SampledInput): void;
  free(): void;
  /** A number that changes if anything about the round does. */
  hash(): number;
  petOfSeat(seat: number): Pet | undefined;
  petById(id: number): Pet | undefined;
  aliveSeats(): number[];
  isFloor(x: number, z: number): boolean;
  /** Height of the floor at a spot. */
  floorY(x: number, z: number): number;
  /** Places for scoring, best first. Seats in one group tied. */
  ranking(): number[][];
  /** The round's number for a seat's card (tiles painted, food eaten), `hidden` while it is kept secret, or null in a game without one. */
  metric(seat: number): number | 'hidden' | null;
}

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
  | 'honker'
  | 'glutton'
  | 'painter'
  | 'runner'
  | 'potato';

export type Standing = { seat: number; score: number; place: number; award: AwardId | null };

export type GameEvent =
  | { t: 'phase'; phase: Phase; round: number }
  | { t: 'countdown'; n: number }
  /** The next round's game has been drawn and its round built. `first` is true the first time this game comes up. */
  | { t: 'reveal'; mode: GameMode; round: number; final: boolean; first: boolean }
  /** The finale shows one place: third, then second, then the winner. Seats sharing a place are shown together. */
  | { t: 'finale'; place: 1 | 2 | 3; seats: number[] }
  /** A pet that fell is back on the floor. It is the same pet, and nothing counts it as knocked out. */
  | { t: 'respawn'; pet: number; seat: number; x: number; z: number }
  | { t: 'jump'; pet: number }
  /** Pinta o Chão: a bucket of paint is coming down, and one was kicked over. */
  | { t: 'bucket'; id: number; x: number; z: number; delay: number }
  | { t: 'splash'; seat: number; x: number; z: number; radius: number }
  /** Batata Quente: the bomb is in a new pair of hands (`from` is null for a fresh bomb), with that long left on its fuse; it went off. */
  | { t: 'potato'; holder: number; from: number | null; fuse: number }
  | { t: 'potatoBoom'; seat: number; x: number; z: number }
  /** Batatinha Frita: the cat started singing with its back turned, or turned to look, for that long; a pet that moved was sent back. */
  | { t: 'watch'; phase: 'sing' | 'watch'; seconds: number }
  | { t: 'caught'; pet: number; seat: number; x: number; z: number }
  /** Cor Certa: a new floor is shown; one of its four colours is called, with that long to reach it; every other tile drops. */
  | { t: 'colorShow'; wave: number }
  | { t: 'colorCall'; color: number; wave: number; seconds: number }
  | { t: 'colorDrop'; color: number }
  /** Corrida Maluca: a pet crossed the line, in that place; a pet was knocked off its feet by a sweeping bar. */
  | { t: 'finish'; pet: number; seat: number; place: number }
  | { t: 'swept'; pet: number }
  /** Come e Cresce: a pet ate something, and a pet bit a smaller one, which lost that many points. */
  | { t: 'eat'; pet: number; seat: number; kind: 'apple' | 'donut' | 'melon' | 'pepper'; x: number; z: number }
  | { t: 'bite'; pet: number; seat: number; victim: number; lost: number }
  /** O Chão é Lava: a new phase of a wave has begun. `seconds` is how long it lasts. */
  | { t: 'lava'; phase: 'calm' | 'alarm' | 'flood'; wave: number; seconds: number }
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
