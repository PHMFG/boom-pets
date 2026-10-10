// The platform: 256 tiles in one draw call, each able to rise in, shake a warning, and tumble away.
import { BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { tuning } from '@boom/game';
import { colors } from '../../shared/tokens';
import { toonMaterial } from '../render/materials';

const SIZE = tuning.arena.size;
const HALF = SIZE / 2;
const backOut = (t: number, strength: number) => 1 + (strength + 1) * (t - 1) ** 3 + strength * (t - 1) ** 2;

type Tile = { mode: 'solid' | 'rising' | 'warning' | 'falling' | 'gone'; clock: number; delay: number; y: number; speed: number; angle: number; spin: number };

export class TileField {
  readonly mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), toonMaterial(), SIZE * SIZE);
  private readonly tiles: Tile[] = Array.from({ length: SIZE * SIZE }, () => ({ mode: 'solid', clock: 0, delay: 0, y: 0, speed: 0, angle: 0, spin: 0 }));
  private readonly shades = [new Color(colors.cream), new Color(colors.creamDark)];
  private readonly danger = new Color(colors.danger);
  private readonly tint = new Color();
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler();

  constructor() {
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    for (let index = 0; index < this.tiles.length; index++) this.mesh.setColorAt(index, this.shade(index));
    this.reset(false);
  }

  /** Puts every tile back. With `ripple`, they pop up from below in a wave from the centre. */
  reset(ripple: boolean): void {
    this.tiles.forEach((tile, index) => {
      const column = Math.floor(index / SIZE);
      const row = index % SIZE;
      tile.mode = ripple ? 'rising' : 'solid';
      tile.clock = 0;
      tile.delay = Math.hypot(column - HALF + 0.5, row - HALF + 0.5) * 0.045;
      tile.y = 0;
      tile.angle = 0;
      this.mesh.setColorAt(index, this.shade(index));
    });
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

  centre(index: number): { x: number; z: number } {
    return { x: Math.floor(index / SIZE) - HALF + 0.5, z: (index % SIZE) - HALF + 0.5 };
  }

  update(dt: number, time: number): void {
    let recolor = false;
    this.tiles.forEach((tile, index) => {
      const { x, z } = this.centre(index);
      let size = 1;
      let shakeX = 0;
      let shakeZ = 0;
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
      }
      this.euler.set(tile.angle, tile.angle * 0.3, tile.angle * 0.7);
      this.matrix.compose(this.position.set(x + shakeX, -0.5 + tile.y, z + shakeZ), this.rotation.setFromEuler(this.euler), this.scale.setScalar(Math.max(size, 0.0001)));
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
    return this.shades[(Math.floor(index / SIZE) + (index % SIZE)) % 2]!;
  }
}
