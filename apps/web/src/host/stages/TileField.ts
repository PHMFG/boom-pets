// A floor of tiles in one draw call, each able to rise in, shake a warning, tumble away, change colour and
// stand a little higher than its neighbours. The brawl's platform and every other game's floor are one of these.
import { BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { TILE, tuning } from '@boom/game';
import { colors } from '../../shared/tokens';
import { toonMaterial } from '../render/materials';

const backOut = (t: number, strength: number) => 1 + (strength + 1) * (t - 1) ** 3 + strength * (t - 1) ** 2;

type Tile = { mode: 'solid' | 'rising' | 'warning' | 'falling' | 'gone'; clock: number; delay: number; y: number; speed: number; angle: number; spin: number; height: number; hop: number };

export class TileField {
  readonly mesh: InstancedMesh;
  readonly columns: number;
  readonly rows: number;
  private readonly tiles: Tile[];
  private readonly shades: Color[];
  private readonly paint: (Color | null)[];
  private readonly seen: Uint8Array;
  private readonly danger = new Color(colors.danger);
  private readonly tint = new Color();
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler();

  /** `shades` are the two colours of the checker. Without arguments this is the brawl's white platform. */
  constructor(columns: number = tuning.arena.size, rows: number = tuning.arena.size, shades: [string, string] = [colors.floor, colors.floorDark]) {
    this.columns = columns;
    this.rows = rows;
    this.shades = shades.map(shade => new Color(shade));
    this.tiles = Array.from({ length: columns * rows }, () => ({ mode: 'solid', clock: 0, delay: 0, y: 0, speed: 0, angle: 0, spin: 0, height: 0, hop: 0 }));
    this.paint = this.tiles.map(() => null);
    this.seen = new Uint8Array(columns * rows);
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), toonMaterial(), columns * rows);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    for (let index = 0; index < this.tiles.length; index++) this.mesh.setColorAt(index, this.shade(index));
    this.reset(false);
  }

  /** Puts every tile back. With `ripple`, they pop up from below in a wave from the centre. */
  reset(ripple: boolean): void {
    this.tiles.forEach((tile, index) => {
      const column = Math.floor(index / this.rows);
      const row = index % this.rows;
      tile.mode = ripple ? 'rising' : 'solid';
      tile.clock = 0;
      tile.delay = Math.hypot(column - this.columns / 2 + 0.5, row - this.rows / 2 + 0.5) * 0.045;
      tile.y = 0;
      tile.angle = 0;
      this.mesh.setColorAt(index, this.shade(index));
    });
    this.seen.fill(TILE.solid);
    this.mesh.instanceColor!.needsUpdate = true;
    this.update(0, 0);
  }

  warn(index: number): void {
    const tile = this.tiles[index];
    if (tile && tile.mode !== 'gone' && tile.mode !== 'falling') tile.mode = 'warning';
  }

  /** `broken` tiles are blown out with more spin than ones that simply give way. */
  drop(index: number, broken: boolean): void {
    const tile = this.tiles[index];
    if (!tile || tile.mode === 'gone' || tile.mode === 'falling') return;
    tile.mode = 'falling';
    tile.speed = broken ? 3 + Math.random() * 3 : 0;
    tile.spin = (Math.random() - 0.5) * (broken ? 9 : 3);
    this.mesh.setColorAt(index, this.shade(index));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** Brings one tile back up from below. */
  rise(index: number): void {
    const tile = this.tiles[index];
    if (!tile) return;
    tile.mode = 'rising';
    tile.clock = 0;
    tile.delay = 0;
    tile.angle = 0;
  }

  /** Gives a tile a colour of its own, with a little hop so the change is seen. Null gives it back its checker colour. */
  setColor(index: number, color: Color | null, hop = true): void {
    const tile = this.tiles[index];
    if (!tile) return;
    this.paint[index] = color;
    if (hop) tile.hop = 1;
    this.mesh.setColorAt(index, this.shade(index));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** How high a tile stands above the rest. */
  setHeight(index: number, height: number): void {
    const tile = this.tiles[index];
    if (tile) tile.height = height;
  }

  /** Follows a game's own tile states: a tile that started to shake, fell or came back does so here too. */
  sync(states: Uint8Array): void {
    for (let index = 0; index < states.length; index++) {
      const state = states[index]!;
      if (state === this.seen[index]) continue;
      if (state === TILE.warning) this.warn(index);
      else if (state === TILE.gone) this.drop(index, false);
      else if (this.seen[index] === TILE.gone) this.rise(index);
      else this.tiles[index]!.mode = 'solid';
      this.seen[index] = state;
    }
  }

  centre(index: number): { x: number; z: number } {
    return { x: Math.floor(index / this.rows) - this.columns / 2 + 0.5, z: (index % this.rows) - this.rows / 2 + 0.5 };
  }

  update(dt: number, time: number): void {
    let recolor = false;
    this.tiles.forEach((tile, index) => {
      const { x, z } = this.centre(index);
      let size = 1;
      let shakeX = 0;
      let shakeZ = 0;
      tile.hop = Math.max(0, tile.hop - dt * 5);
      if (tile.mode === 'rising') {
        tile.clock += dt;
        const t = (tile.clock - tile.delay) / 0.4;
        size = t <= 0 ? 0 : t >= 1 ? 1 : backOut(t, 1.8);
        tile.y = t >= 1 ? 0 : (1 - Math.max(0, t)) * -2.5;
        if (t >= 1) tile.mode = 'solid';
      } else if (tile.mode === 'warning') {
        // A shake and a slow blink (under 3 per second) toward the danger colour.
        shakeX = Math.sin(time * 61 + index) * 0.035;
        shakeZ = Math.cos(time * 53 + index * 2) * 0.035;
        tile.y = Math.sin(time * 47 + index) * 0.025;
        this.tint.copy(this.shade(index)).lerp(this.danger, 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * 2.5));
        this.mesh.setColorAt(index, this.tint);
        recolor = true;
      } else if (tile.mode === 'falling') {
        tile.speed -= 26 * dt;
        tile.y += tile.speed * dt;
        tile.angle += tile.spin * dt;
        size = Math.max(0, 1 + (tile.y + 5) / 9);
        if (tile.y < -5) size = Math.max(0, 1 - (-5 - tile.y) / 9);
        if (size <= 0) tile.mode = 'gone';
      } else if (tile.mode === 'gone') {
        size = 0;
      } else {
        tile.y = 0;
      }
      this.euler.set(tile.angle, tile.angle * 0.3, tile.angle * 0.7);
      // A freshly coloured tile hops: up and back, like a key being pressed the wrong way round.
      const hop = Math.sin(tile.hop * Math.PI) * 0.12;
      this.matrix.compose(this.position.set(x + shakeX, -0.5 + tile.y + tile.height + hop, z + shakeZ), this.rotation.setFromEuler(this.euler), this.scale.setScalar(Math.max(size, 0.0001)));
      this.mesh.setMatrixAt(index, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (recolor) this.mesh.instanceColor!.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }

  private shade(index: number): Color {
    return this.paint[index] ?? this.shades[(Math.floor(index / this.rows) + (index % this.rows)) % 2]!;
  }
}
