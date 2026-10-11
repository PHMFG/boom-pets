// Cor Certa: a dance floor floating in space. Its tiles are patches of four pale colours, each marked with
// its fruit, so a colour is never told apart by hue alone. When one is called, its name and fruit hang over
// the floor until the rest drops away.
// The stage under the floor and everything that floats round it (speakers, the DJ's desk, lights, the mirror
// ball, a planet and a rocket) are modelled in Blender (tools/blender/maps/color.py), and move by themselves.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial } from 'three';
import { FLAVORS } from '../../../shared/games';
import { colors, maps } from '../../../shared/tokens';
import { Model } from '../../render/models';
import type { MapView, SkyId, StageKit } from '../kit';
import { TileField } from '../TileField';

const PATCH = tuning.color.patch;
const SIDE = tuning.color.patches * PATCH;
const palette = maps.color;
const tints = FLAVORS.map(flavor => new Color(flavor.color));
/** The footlights in each called colour: a little over white, and no more, or the colour would burn out of them. */
const lampTints = tints.map(tint => tint.clone().multiplyScalar(1.25));
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
  private readonly model = new Model('color');
  private readonly textures = FLAVORS.map(flavor => fruitTexture(flavor.icon));
  private readonly marks: { mesh: Mesh; material: MeshBasicMaterial; flavor: number; shown: number }[] = [];
  /** The called colour's fruit, hung over each speaker: at the corners, where it covers nobody. */
  private readonly signs: Sprite[] = [];
  /**
   * The band round the floor that takes the called colour. It is four bars and not a slab: where patches drop
   * there is nothing under them but space, so the patches left standing are plain to see.
   */
  private readonly rim = new Group();
  private readonly bars = [new BoxGeometry(SIDE + 0.7, 0.5, 0.35), new BoxGeometry(0.35, 0.5, SIDE)] as const;
  private readonly band = new MeshBasicMaterial({ color: palette.base });
  /** The footlights round the stage. They burn warm, and take the called colour along with the band. */
  private readonly lamps: { color: Color } | null;
  private readonly lampRest = new Color();
  private lampGoal = this.lampRest;
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
    for (const side of [-1, 1]) {
      const across = new Mesh(this.bars[0], this.band);
      across.position.z = side * (SIDE / 2 + 0.175);
      const along = new Mesh(this.bars[1], this.band);
      along.position.x = side * (SIDE / 2 + 0.175);
      this.rim.add(across, along);
    }
    this.rim.position.y = -0.76;
    this.group.add(this.tiles.mesh, this.model.scene, this.rim);
    this.tiles.reset(true);
    const footlights = this.model.node('footlights');
    this.lamps = footlights ? this.model.own(footlights, 'bulb') : null;
    if (this.lamps) this.lampRest.copy(this.lamps.color);
    // The model marks a place over each corner's speakers. A sign hung there rides up and down with its pod.
    for (let corner = 0; corner < 4; corner++) {
      const sign = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false }));
      sign.scale.setScalar(0.001);
      this.signs.push(sign);
      this.model.node(`sign_${corner}`)?.add(sign);
    }
  }

  handle(event: GameEvent): void {
    const { rig, renderer } = this.kit;
    if (event.t === 'colorShow') {
      this.called = null;
      this.dropped = false;
      this.band.color.set(palette.base);
      this.lampGoal = this.lampRest;
    } else if (event.t === 'colorCall') {
      // The fruit goes up over every speaker and the band round the floor takes the colour. The name is the HUD's and the announcer's.
      this.called = event.color;
      for (const sign of this.signs) {
        sign.material.map = this.textures[event.color]!;
        sign.material.needsUpdate = true;
      }
      this.band.color.set(FLAVORS[event.color]!.color);
      this.lampGoal = lampTints[event.color]!;
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
    this.lamps?.color.lerp(this.lampGoal, 1 - Math.exp(-12 * dt));
    this.model.update(dt);
    this.tiles.update(dt, time);
  }

  dispose(): void {
    this.tiles.dispose();
    this.textures.forEach(texture => texture.dispose());
    this.marks.forEach(mark => mark.material.dispose());
    this.marks[0]?.mesh.geometry.dispose();
    this.signs.forEach(sign => sign.material.dispose());
    this.bars.forEach(bar => bar.dispose());
    this.band.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }
}
