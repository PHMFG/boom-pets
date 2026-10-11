// Low-frequency state for the React HUD. The engine writes here; React reads with useStore.
// Anything that changes every frame (positions, nameplates) is written to the DOM directly instead.
import type { GameMode, Phase } from '@boom/game';
import type { NetworkInfo, SeatInfo } from '@boom/protocol';
import { useSyncExternalStore } from 'react';

export type Store<State> = {
  get(): State;
  set(patch: Partial<State>): void;
  subscribe(listener: () => void): () => void;
};

export function createStore<State extends object>(initial: State): Store<State> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      listeners.forEach(listener => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** `select` must return a stored value (a field), not a new object, or React re-renders forever. */
export function useStore<State, Selected>(store: Store<State>, select: (state: State) => Selected): Selected {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

export type Connection = 'connecting' | 'online' | 'offline' | 'notLocal' | 'replaced' | 'version' | 'busy' | 'solo';

/** One player's card in the strip along the bottom. */
export type PlayerCard = {
  seat: number;
  name: string;
  portrait: string;
  bot: boolean;
  connected: boolean;
  ready: boolean;
  score: number;
  /** Rolls since the last SUPER, 0 to 6. */
  pity: number;
  /** `left` runs from 1 to 0 as the power runs out. */
  power: { icon: string; color: string; left: number } | null;
  /** A power waiting on this player's power button. */
  held: { icon: string; color: string } | null;
  bounty: boolean;
  ghost: boolean;
  /** The round's own number in a game that has one (tiles painted, food eaten): its picture and the number, or "?" while it is kept secret. */
  metric: { icon: string; text: string } | null;
};

export type FeedWho = { seat: number; name: string };
/** One line of the event feed: who did what to whom. */
export type FeedItem = { id: number; by: FeedWho | null; icon: string; target: FeedWho | null; text: string | null };

/** Explains a power the moment someone gets one: whose it is, whether it waits or runs, and what it does. */
export type PowerNote = { id: number; who: FeedWho; state: 'ready' | 'on' | 'cursed'; icon: string; name: string; hint: string; color: string };

export type ResultRow = { seat: number; name: string; portrait: string; score: number; place: number; award: { icon: string; name: string } | null };
/** A round's outcome for the list shown as it ends. `points` is everything the round paid that player. */
export type RoundResult = {
  mode: GameMode;
  double: boolean;
  /** `count` is what the game itself counted for that player (tiles painted, food eaten, how far along the way), where it counts anything. */
  rows: { seat: number; name: string; place: number; points: number; count: number | null }[];
};
export type Options = { rounds: number; bots: boolean; reduced: boolean; muted: boolean };

export type HudState = {
  /** Models and physics are still loading. */
  loading: boolean;
  /** The title screen is up, waiting for a key (which also unlocks sound). */
  title: boolean;
  phase: Phase;
  round: number;
  rounds: number;
  /** Whole seconds left in the round. */
  timeLeft: number;
  /** The game of the round being played, or about to be. */
  gameMode: GameMode;
  /** The screen between games: the roulette while `mode` is null (it stops on `upcoming`), then that game's card. */
  intro: { mode: GameMode | null; upcoming: GameMode | null; final: boolean } | null;
  /** The curtain between worlds is shut (or shutting): the map is being changed behind it. */
  curtain: boolean;
  /** The round that just ended: who came where and what it paid, best first. */
  roundResult: RoundResult | null;
  /** The end of a match: a drum roll until `winners` is filled in. */
  finale: { winners: { seat: number; name: string }[] } | null;
  /**
   * What is happening right now, shown where the tips go: the colour called in Cor Certa, what the cat is
   * doing, who has the bomb. With `seat` it names a player, and wears that seat's shape as well as its colour.
   */
  call: { icon: string; name: string; color: string; seat?: number } | null;
  /** How much has loaded at start-up, 0 to 1. */
  loadProgress: number;
  /** Seconds the round being played may last, for the timer's ring. */
  roundCap: number;
  players: PlayerCard[];
  results: ResultRow[];
  options: Options;
  /** Whole seconds until the match starts by itself, once everyone is ready. */
  startIn: number | null;
  /** First-play hint currently on screen. */
  tip: 'dash' | 'grab' | 'power' | null;
  powerNote: PowerNote | null;
  feed: FeedItem[];
  /** Who took the round, shown while the round ends. */
  banner: { seat: number; text: string } | null;
  connection: Connection;
  room: string | null;
  network: NetworkInfo;
  seats: SeatInfo[];
  /** performance.now() when `seats` arrived, to count down each seat's hold time locally. */
  rosterAt: number;
};

export const hud = createStore<HudState>({
  loading: true,
  title: true,
  phase: 'lobby',
  round: 0,
  rounds: 5,
  timeLeft: 0,
  gameMode: 'brawl',
  intro: null,
  curtain: false,
  roundResult: null,
  finale: null,
  call: null,
  loadProgress: 0,
  roundCap: 0,
  players: [],
  results: [],
  options: { rounds: 5, bots: true, reduced: false, muted: false },
  startIn: null,
  tip: null,
  powerNote: null,
  feed: [],
  banner: null,
  connection: 'connecting',
  room: null,
  network: { address: null, ssid: null },
  seats: [],
  rosterAt: 0,
});
