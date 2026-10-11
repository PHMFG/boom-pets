// What a map is, and what it is handed by the stage: the scene's shared effects and the few colours every map uses.
import type { AnyRound, GameEvent } from '@boom/game';
import { Color, Vector3, type Group } from 'three';
import { colors } from '../../shared/tokens';
import type { Decals } from '../fx/Decals';
import type { Particles } from '../fx/Particles';
import type { CameraRig } from '../render/CameraRig';
import type { Renderer } from '../render/Renderer';
import type { Words } from './Props';

export const WHITE = new Color(colors.white);
export const INK = new Color(colors.ink);
export const DANGER = new Color(colors.danger);
export const GOLD = new Color(colors.gold);
/** Brighter than white, so the glow picks it up: sparks, fuses, embers. */
export const HOT = new Color(colors.gold).multiplyScalar(2.6);
export const SMOKE = [new Color(colors.cream), new Color(colors.smoke), new Color(colors.danger), new Color(colors.gold)];
export const random = (low: number, high: number) => low + Math.random() * (high - low);

/**
 * A floor that has grown since its scenery was modelled round it. Rather than model the scenery again, a map
 * puts it in a group scaled by this, so what stood at the floor's edge still does. `y` is the smaller of the
 * other two: a prop may come out a little wide, never tall and thin. `at()` is where a spot of the model is
 * in the world, for what stands in the scenery without being scaled with it (spectators, particles). `line` is
 * how much bigger the scenery is drawn over all, which is what its outlines are thinned by (`Model.drawnAt`).
 */
export function fitScenery(built: { columns: number; rows: number }, columns: number, rows: number) {
  const x = columns / built.columns;
  const z = rows / built.rows;
  const y = Math.min(x, z);
  return { x, y, z, line: Math.cbrt(x * y * z), at: (spot: { x: number; y: number; z: number }) => new Vector3(spot.x * x, spot.y * y, spot.z * z) };
}

export const SKY_IDS = ['day', 'morning', 'night', 'alien', 'space'] as const;
export type SkyId = (typeof SKY_IDS)[number];
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** The stage's shared effects, lent to whichever map is up. */
export type StageKit = {
  particles: Particles;
  decals: Decals;
  words: Words;
  rig: CameraRig;
  renderer: Renderer;
  dust(x: number, z: number, count: number): void;
  poof(x: number, y: number, z: number): void;
  stars(x: number, y: number, z: number, count: number): void;
  confetti(x: number, y: number, z: number, palette: Color[], count: number): void;
  /** A blast of `radius`: smoke, sparks, a shock ring, a shake and the big word. */
  boom(x: number, y: number, z: number, radius: number): void;
};

/**
 * One game's world: its floor, its surroundings and its own props. The stage owns the pets, the camera and
 * the effects, and swaps maps when the game changes.
 */
export interface MapView {
  readonly group: Group;
  readonly sky: SkyId;
  /** Light levels. Kept low enough that a pale floor does not burn out to white. */
  readonly light: { hemisphere: number; sun: number };
  /** The floor's extent, for the camera when there is nobody to frame. */
  readonly bounds: Bounds;
  /** Shows one thing the simulation says just happened, if it is this map's to show. */
  handle(event: GameEvent, round: AnyRound): void;
  /** More for the camera to keep in view than the pets themselves: what a player needs to see coming. */
  focus?(round: AnyRound, points: { x: number; z: number }[]): void;
  /** Metres to lift a seat's name, when the map draws something of its own over that pet's head. */
  headroom?(round: AnyRound, seat: number): number;
  /** Once a frame. `round` is null when nothing of the round is drawn (the podium's stage). */
  frame(round: AnyRound | null, dt: number, time: number, alpha: number): void;
  dispose(): void;
}

/** Keeps a map of views in step with a list of simulation objects: new ones appear, missing ones are removed. */
export function syncViews<Item extends { id: number }, View extends { group: Group; dispose(): void }>(
  parent: { add(object: Group): unknown },
  views: Map<number, View>,
  items: readonly Item[],
  create: (item: Item) => View,
  update: (view: View, item: Item) => void,
): void {
  const present = new Set<number>();
  for (const item of items) {
    present.add(item.id);
    let view = views.get(item.id);
    if (!view) {
      view = create(item);
      views.set(item.id, view);
      parent.add(view.group);
    }
    update(view, item);
  }
  for (const [id, view] of views) {
    if (present.has(id)) continue;
    view.dispose();
    views.delete(id);
  }
}
