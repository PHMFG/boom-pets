// Cor Certa: a dance floor floating in space. Its tiles are patches of four pale colours, each marked with
// its fruit, so a colour is never told apart by hue alone. When one is called, its name and fruit hang over
// the floor until the rest drops away.
// The stage under the floor and everything that floats round it (speakers, the DJ's desk, lights, the mirror
// ball, planets and a rocket) are modelled in Blender (tools/blender/maps/color.py), and move by themselves.
// The stage answers the round: its lights go the called colour, its speakers kick when the floor drops, it all
// plays a little faster wave by wave, and there are dancers on it who care how it goes.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, Vector3, type Material, type Object3D } from 'three';
import { FLAVORS } from '../../../shared/games';
import { colors, maps } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { fitScenery, random, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { Crowd, type Spot } from './crowd';

const PATCH = tuning.color.patch;
const SIDE = tuning.color.patches * PATCH;
/** The stage was modelled round a floor twelve metres a side, and the floor has grown: see `fitScenery`. */
const FIT = fitScenery({ columns: 12, rows: 12 }, SIDE, SIDE);
const palette = maps.color;
const tints = FLAVORS.map(flavor => new Color(flavor.color));
/** The rail round the floor: how far it stands over the floor (low, so the near side hides nobody), how far down it goes (to the stage's frame, which is scaled), and how thick it is. */
const RAIL = { top: 0.3, foot: -1.01 * FIT.y, thick: 0.35 };
/** How much faster the whole stage plays with each wave, and the most: the quickest speaker then beats 2.5 times a second. */
const TEMPO = { step: 0.04, most: 1.24 };
/** How much of their glow the stage's lights lose at rest with each wave, and the least they keep: the called colour stands out more every time. */
const HOUSE = { step: 0.07, least: 0.55 };
/** Seconds a speaker's kick and a meter's jump last, and how big they are. */
const KICK = { seconds: 0.35, size: 0.12 };
const JUMP = { seconds: 0.5, size: 0.7 };
/** Dust in the air round the stage: how many motes a second, and the box round the floor they rise in. Never over the floor. */
const DUST = { rate: 7, inner: SIDE / 2 + 1.4, outer: SIDE / 2 + 5.5 };
const MOTE = new Color(palette.bulb).multiplyScalar(1.4);
const FIRE = new Color(palette.flame).multiplyScalar(1.7);
/** Where the confetti of a call goes up from: the two dance pods, in the model's measure. */
const PODS = { x: 9.5, y: -0.8, z: -1.75 };
/** Who is here to dance: the piece of the model each group stands on, and where on it. They ride with it. */
const DANCERS: { on: string; spots: Spot[] }[] = [
  { on: 'lights', spots: [{ x: 0.5, z: 1, turn: 1 }, { x: 1, z: -0.4, turn: 1.2 }, { x: -0.5, z: 0.3, turn: 0.8 }] },
  { on: 'mirror', spots: [{ x: -0.5, z: 1, turn: -1 }, { x: -1, z: -0.4, turn: -1.2 }, { x: 0.5, z: 0.3, turn: -0.8 }] },
  { on: 'dj', spots: [{ x: 0, y: 1.4, z: -1.95, scale: 1.5 }] },
  { on: 'saucer', spots: [{ x: 0, y: 0.22, z: 0, scale: 0.9 }] },
];
/** A light of the stage that takes the called colour: its material, the colour it rests at and how bright that is. */
type Light = { material: Material & { color: Color }; rest: Color; peak: number };

/** Whether the model's script marked this piece, or what it is part of, as a light that takes the called colour. */
function calls(node: Object3D): boolean {
  for (let at: Object3D | null = node; at; at = at.parent) if (at.userData.calls) return true;
  return false;
}
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
  /** The stage as it was modelled, scaled by `FIT`. */
  private readonly world = new Group();
  private readonly textures = FLAVORS.map(flavor => fruitTexture(flavor.icon));
  private readonly marks: { mesh: Mesh; material: MeshBasicMaterial; flavor: number; shown: number }[] = [];
  /** The called colour's fruit, hung over each stack of speakers: beside the floor, where it covers nobody and the camera still has it. */
  private readonly signs: Sprite[] = [];
  /**
   * The rail round the floor: the rim nobody can walk over, standing a little higher than the floor. It takes
   * the called colour. It is four bars and not a slab: where patches drop there is nothing under them but
   * space, so the patches left standing are plain to see.
   */
  private readonly rim = new Group();
  private readonly bars = [new BoxGeometry(SIDE + RAIL.thick * 2, RAIL.top - RAIL.foot, RAIL.thick), new BoxGeometry(RAIL.thick, RAIL.top - RAIL.foot, SIDE)] as const;
  private readonly band = new MeshBasicMaterial({ color: palette.base });
  /** Every light of the stage that takes the called colour: footlights, spotlights, meters, the mirror ball. */
  private readonly lights: Light[] = [];
  private readonly crowds: Crowd[] = [];
  /** The four stacks of speakers, which kick when the floor drops, and the two meters, which jump at a call. */
  private readonly stacks: Object3D[] = [];
  private readonly meters: Object3D[] = [];
  private readonly rocket: Object3D | undefined;
  private readonly ball: Object3D | undefined;
  private readonly point = new Vector3();
  private readonly glow = new Color();
  private wave = 1;
  private tempo = 1;
  private kick = 0;
  private jump = 0;
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
      across.position.z = side * (SIDE / 2 + RAIL.thick / 2);
      const along = new Mesh(this.bars[1], this.band);
      along.position.x = side * (SIDE / 2 + RAIL.thick / 2);
      this.rim.add(across, along);
    }
    this.rim.position.y = (RAIL.top + RAIL.foot) / 2;
    this.world.scale.set(FIT.x, FIT.y, FIT.z);
    this.world.add(this.model.scene);
    this.model.drawnAt(FIT.line);
    this.group.add(this.tiles.mesh, this.world, this.rim);
    this.tiles.reset(true);

    // The lights the model marks get materials of their own, one for each they shared, so they can change colour together.
    const made = new Map<Material, Light>();
    this.model.scene.traverse(node => {
      if (!(node instanceof Mesh) || node.name === 'outline' || !calls(node)) return;
      const shared = node.material as Material & { color: Color };
      let light = made.get(shared);
      if (!light) {
        const material = shared.clone();
        light = { material, rest: material.color.clone(), peak: Math.max(material.color.r, material.color.g, material.color.b) };
        made.set(shared, light);
        this.lights.push(light);
      }
      node.material = light.material;
    });
    for (let index = 0; index < 4; index++) {
      const stack = this.model.node(`speakers_${index}`);
      if (stack) this.stacks.push(stack);
      const meter = this.model.node(`meter_${index}`);
      if (meter) this.meters.push(meter);
    }
    this.rocket = this.model.node('rocket');
    this.ball = this.model.node('mirror_ball');
    DANCERS.forEach((place, index) => {
      const piece = this.model.node(place.on);
      if (!piece) return;
      // They ride a piece that is scaled, and are not to be: their places are spread by `FIT` and the group shrunk by it.
      const crowd = new Crowd(place.spots.map(spot => ({ ...spot, ...FIT.at({ x: spot.x, y: spot.y ?? 0, z: spot.z }) })), { seed: 3 + index * 5 });
      crowd.group.scale.setScalar(1 / FIT.y);
      piece.add(crowd.group);
      this.crowds.push(crowd);
    });
    // The model marks a place over each of its four stacks of speakers. A sign hung there rides up and down with its pod.
    for (let stack = 0; stack < 4; stack++) {
      const sign = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false }));
      sign.scale.setScalar(0.001);
      this.signs.push(sign);
      this.model.node(`sign_${stack}`)?.add(sign);
    }
  }

  handle(event: GameEvent): void {
    const { rig, renderer } = this.kit;
    if (event.t === 'colorShow') {
      this.called = null;
      this.dropped = false;
      this.wave = event.wave;
      this.band.color.set(palette.base);
      // A new floor, and the music is back: everyone dances until the next one drops.
      for (const crowd of this.crowds) crowd.cheer(tuning.color.show + tuning.color.count);
    } else if (event.t === 'colorCall') {
      // The fruit goes up over every speaker and the band round the floor takes the colour. The name is the HUD's and the announcer's.
      this.called = event.color;
      for (const sign of this.signs) {
        sign.material.map = this.textures[event.color]!;
        sign.material.needsUpdate = true;
      }
      this.band.color.set(FLAVORS[event.color]!.color);
      // The whole stage takes the colour: every light goes to it (in `frame`), the meters jump, and a little
      // confetti of it goes up from the two dance pods.
      this.jump = 1;
      for (const crowd of this.crowds) crowd.clap();
      for (let index = 0; index < 28; index++) {
        // Thrown up and outward, so that none of it comes down on the floor.
        const side = index % 2 === 0 ? -1 : 1;
        this.kit.particles.cube({ x: side * PODS.x * FIT.x, y: PODS.y * FIT.y, z: PODS.z * FIT.z, vx: side * random(0, 3), vy: random(5, 9), vz: random(-2.5, 2.5), life: random(1, 1.6), size: random(0.1, 0.17), gravity: 11, drag: 1, spin: random(-14, 14), color: tints[event.color]! });
      }
      rig.shake(0.15);
    } else if (event.t === 'colorDrop') {
      this.dropped = true;
      // The floor goes: the speakers kick, the rocket below fires its engine, and the dancers start.
      this.kick = 1;
      for (const crowd of this.crowds) crowd.gasp();
      if (this.rocket) {
        const { x, y, z } = this.rocket.getWorldPosition(this.point);
        for (let index = 0; index < 16; index++) {
          this.kit.particles.spark({ x, y, z, vx: random(-4, 4), vy: random(-3, 1), vz: random(-4, 4), life: random(0.5, 1), size: random(0.18, 0.4), sizeEnd: 0.05, drag: 1.5, spin: 8, color: FIRE });
        }
      }
      rig.shake(0.35);
      renderer.kick(0.2);
    } else if (event.t === 'roundWinner') {
      for (const crowd of this.crowds) crowd.cheer(4);
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
    for (const sign of this.signs) sign.scale.setScalar(Math.max(0.001, ((open ? backOut(this.signSize) : this.signSize) * 2.6) / FIT.y));

    // The stage's lights: the called colour while it stands, and their own a little dimmer each wave between calls.
    const house = Math.max(HOUSE.least, 1 - (this.wave - 1) * HOUSE.step);
    for (const light of this.lights) {
      if (open) this.glow.copy(tints[this.called!]!).multiplyScalar(light.peak);
      else this.glow.copy(light.rest).multiplyScalar(house);
      light.material.color.lerp(this.glow, 1 - Math.exp(-12 * dt));
    }
    // The speakers kick at a drop and the meters jump at a call.
    this.kick = Math.max(0, this.kick - dt / KICK.seconds);
    this.jump = Math.max(0, this.jump - dt / JUMP.seconds);
    for (const stack of this.stacks) stack.scale.setScalar(1 + KICK.size * this.kick ** 2);
    for (const meter of this.meters) meter.scale.y = 1 + JUMP.size * this.jump ** 2;

    // Dust rises round the stage, never over the floor, and while a colour stands the mirror ball throws flecks of it out into the dark.
    const { particles } = this.kit;
    if (field && Math.random() < DUST.rate * dt) {
      const across = random(-DUST.outer, DUST.outer);
      const beside = (Math.random() < 0.5 ? -1 : 1) * random(DUST.inner, DUST.outer);
      const side = Math.random() < 0.7;
      particles.spark({ x: side ? beside : across, y: random(-4, -1), z: side ? across : -Math.abs(beside) - 2, vx: random(-0.2, 0.2), vy: random(0.5, 1.1), vz: random(-0.2, 0.2), life: random(3, 4.5), size: random(0.07, 0.13), sizeEnd: 0.03, spin: 2, color: MOTE });
    }
    if (open && this.ball && Math.random() < 9 * dt) {
      const { x, y, z } = this.ball.getWorldPosition(this.point);
      particles.spark({ x, y, z, vx: random(0.5, 3), vy: random(-2, 1.5), vz: random(-3, 3), life: random(0.8, 1.4), size: random(0.1, 0.18), sizeEnd: 0.03, drag: 0.8, spin: 5, color: this.glow.copy(tints[this.called!]!).multiplyScalar(1.5) });
    }

    // It all plays a little faster with every wave.
    this.tempo += (Math.min(TEMPO.most, 1 + (this.wave - 1) * TEMPO.step) - this.tempo) * (1 - Math.exp(-2 * dt));
    const beat = dt * this.tempo;
    this.model.update(beat);
    for (const crowd of this.crowds) crowd.update(beat);
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
    this.lights.forEach(light => light.material.dispose());
    this.crowds.forEach(crowd => crowd.dispose());
    this.model.dispose();
    this.group.removeFromParent();
  }
}
