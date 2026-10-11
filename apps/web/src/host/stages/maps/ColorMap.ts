// Cor Certa: a dance floor floating in space. Its tiles are patches of four pale colours, each marked with
// its fruit, so a colour is never told apart by hue alone. When one is called, its name and fruit hang over
// the floor until the rest drops away.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial } from 'three';
import { FLAVORS } from '../../../shared/games';
import { colors, maps } from '../../../shared/tokens';
import type { MapView, SkyId, StageKit } from '../kit';
import { TileField } from '../TileField';
import { disposeToys, toy } from './toys';

const PATCH = tuning.color.patch;
const SIDE = tuning.color.patches * PATCH;
const palette = maps.color;
const tints = FLAVORS.map(flavor => new Color(flavor.color));
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

/** A fruit on a see-through square, to lie on a patch or hang in the air. */
function fruitTexture(emoji: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 160;
  const context = canvas.getContext('2d')!;
  context.font = `120px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(emoji, 80, 88);
  return new CanvasTexture(canvas);
}

export class ColorMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'space';
  readonly light = { hemisphere: 1.15, sun: 1.5 };
  readonly bounds = { minX: -SIDE / 2, maxX: SIDE / 2, minZ: -SIDE / 2, maxZ: SIDE / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(SIDE, SIDE, [colors.white, colors.white]);
  private readonly scenery = new Group();
  private readonly textures = FLAVORS.map(flavor => fruitTexture(flavor.icon));
  private readonly marks: { mesh: Mesh; material: MeshBasicMaterial; flavor: number; shown: number }[] = [];
  /** The called colour's fruit, hung over each speaker: at the corners, where it covers nobody. */
  private readonly signs: Sprite[] = [];
  private readonly rim: Mesh;
  private readonly ball: Mesh;
  private readonly seen = new Uint8Array(SIDE * SIDE);
  private called: number | null = null;
  private signSize = 0;
  private dropped = false;

  constructor(kit: StageKit) {
    this.kit = kit;
    // One fruit lying on each patch.
    const plane = new PlaneGeometry(PATCH * 0.62, PATCH * 0.62).rotateX(-Math.PI / 2);
    for (let column = 0; column < tuning.color.patches; column++) {
      for (let row = 0; row < tuning.color.patches; row++) {
        const material = new MeshBasicMaterial({ transparent: true, depthWrite: false });
        const mesh = new Mesh(plane, material);
        mesh.position.set(column * PATCH + PATCH / 2 - SIDE / 2, 0.02, row * PATCH + PATCH / 2 - SIDE / 2);
        mesh.renderOrder = 1;
        this.marks.push({ mesh, material, flavor: -1, shown: 0 });
        this.group.add(mesh);
      }
    }
    // A band round the floor that takes the called colour.
    this.rim = new Mesh(new BoxGeometry(SIDE + 0.7, 0.5, SIDE + 0.7), new MeshBasicMaterial({ color: palette.base }));
    this.rim.position.y = -0.76;
    this.ball = new Mesh(new IcosahedronGeometry(1.6, 1), new MeshBasicMaterial({ color: new Color(colors.white).multiplyScalar(1.5) }));
    this.ball.position.set(0, 9, -SIDE / 2 - 3);
    this.group.add(this.tiles.mesh, this.scenery, this.rim, this.ball);
    this.tiles.reset(true);
    this.build();
  }

  handle(event: GameEvent): void {
    const { rig, renderer } = this.kit;
    if (event.t === 'colorShow') {
      this.called = null;
      this.dropped = false;
      (this.rim.material as MeshBasicMaterial).color.set(palette.base);
    } else if (event.t === 'colorCall') {
      // The fruit goes up over every speaker and the band round the floor takes the colour. The name is the HUD's and the announcer's.
      this.called = event.color;
      for (const sign of this.signs) {
        sign.material.map = this.textures[event.color]!;
        sign.material.needsUpdate = true;
      }
      (this.rim.material as MeshBasicMaterial).color.set(FLAVORS[event.color]!.color);
      rig.shake(0.15);
    } else if (event.t === 'colorDrop') {
      this.dropped = true;
      rig.shake(0.35);
      renderer.kick(0.2);
    }
  }

  frame(round: AnyRound | null, dt: number, time: number): void {
    const field = round?.gameMode === 'color' ? round : null;
    if (field) {
      // A new deal: every tile takes its colour, and every patch its fruit.
      for (let index = 0; index < field.data.length; index++) {
        const kind = field.data[index]!;
        if (kind === this.seen[index] || kind === 0) continue;
        this.seen[index] = kind;
        this.tiles.setColor(index, tints[kind - 1]!, false);
      }
      this.tiles.sync(field.tiles);
      this.marks.forEach((mark, index) => {
        const column = Math.floor(index / tuning.color.patches) * PATCH;
        const row = (index % tuning.color.patches) * PATCH;
        const flavor = field.data[column * SIDE + row]! - 1;
        if (flavor !== mark.flavor && flavor >= 0) {
          mark.flavor = flavor;
          mark.material.map = this.textures[flavor]!;
          mark.material.needsUpdate = true;
          mark.shown = 0;
        }
        // A fruit goes with its patch when the patch drops, and pops back with the new floor.
        const there = !this.dropped || flavor === this.called;
        mark.shown = Math.max(0, Math.min(1, mark.shown + (there ? dt / 0.3 : -dt / 0.15)));
        mark.mesh.scale.setScalar(Math.max(0.001, there ? backOut(mark.shown) : mark.shown));
      });
    }
    // The fruit over the floor grows open at the call and squishes shut at the drop.
    const open = this.called !== null && !this.dropped;
    this.signSize = Math.max(0, Math.min(1, this.signSize + (open ? dt / 0.28 : -dt / 0.16)));
    for (const sign of this.signs) sign.scale.setScalar(Math.max(0.001, (open ? backOut(this.signSize) : this.signSize) * 2.6));
    this.ball.rotation.y = time * 0.6;
    this.tiles.update(dt, time);
  }

  dispose(): void {
    this.tiles.dispose();
    this.textures.forEach(texture => texture.dispose());
    this.marks.forEach(mark => mark.material.dispose());
    this.marks[0]?.mesh.geometry.dispose();
    this.signs.forEach(sign => sign.material.dispose());
    this.rim.geometry.dispose();
    (this.rim.material as MeshBasicMaterial).dispose();
    this.ball.geometry.dispose();
    (this.ball.material as MeshBasicMaterial).dispose();
    disposeToys(this.scenery);
    this.group.removeFromParent();
  }

  /** What holds the floor up, and the speakers at its corners. */
  private build(): void {
    const base = toy(new BoxGeometry(SIDE + 1.2, 0.8, SIDE + 1.2), palette.base, 1.01);
    base.position.y = -1.42;
    base.castShadow = false;
    this.scenery.add(base);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const stack = new Group();
      for (let level = 0; level < 2; level++) {
        const box = toy(new BoxGeometry(2.2, 2, 1.6), palette.speaker, 1.04);
        box.position.y = 1 + level * 2.05;
        const cone = toy(new CylinderGeometry(0.62, 0.62, 0.2, 14), palette.cone, 1.1);
        cone.rotation.x = Math.PI / 2;
        cone.position.set(0, 1 + level * 2.05, 0.85);
        stack.add(box, cone);
      }
      stack.position.set(x * (SIDE / 2 + 2.6), -1.8, z * (SIDE / 2 + 1.6) - (z < 0 ? 0.5 : 0));
      stack.rotation.y = Math.atan2(-x, -z);
      this.scenery.add(stack);
      const sign = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false }));
      sign.position.set(stack.position.x, 4.4, stack.position.z);
      sign.scale.setScalar(0.001);
      this.signs.push(sign);
      this.group.add(sign);
    }
  }
}
