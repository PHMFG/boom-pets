// O Chão é Lava: a slab of pale stone in the mouth of a volcano. Flat-topped rocks rise out of it for each wave,
// the sea of lava round it climbs while the alarm sounds, and then covers everything but the rocks.
// The crater, the rocks and what floats on the lava are modelled in Blender (tools/blender/maps/lava.py).
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { HOT, random, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';

const COLUMNS = tuning.lava.columns;
const ROWS = tuning.lava.rows;
const palette = maps.lava;
const LAVA = new Color(palette.lava);
const LAVA_HOT = new Color(palette.lavaHot).multiplyScalar(1.6);
/** How high the lava stands: far below while it is calm, at the slab's lip when the alarm ends, over the floor in a flood. */
const LEVEL = { calm: -0.75, alarm: -0.06, flood: 0.14 };
/**
 * The rocks as they are modelled: how high their flat top is, and the radius of the game's rock they were drawn for.
 * On a pale floor a rock has to be the first thing anyone sees, so it is dark and drawn a little wider than it is.
 */
const STONE = { names: ['stone_a', 'stone_b', 'stone_c'], height: 0.3, radius: 0.5 };
/** Bubbles swelling out of the lava at any moment, and where the volcano stands: none come up inside it. */
const BUBBLES = 9;
const VOLCANO = { x: -11.45, z: 0.8, radius: 3.3, mouth: 4.5 };
/** Spouts shooting out of the lava at any moment, how near the slab one may come (too far to look like a threat), and how high one stands as modelled. */
const SPOUTS = 3;
const SPOUT = { clear: 2.4, up: 0.16, hold: 0.3, down: 0.22, height: 2 };
/** How fast the bright slivers drift round the slab, in radians a second: lazily, and quicker once the lava is on its way. */
const DRIFT = { calm: 0.035, busy: 0.12 };
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

type RockView = { view: Object3D; x: number; z: number; age: number; leaving: number | null };
/** A bubble waits under the lava, swells for `life` seconds and bursts. */
type Bubble = { view: Object3D; wait: number; age: number; life: number; size: number; burst: number | null };
/** A spout waits under the lava, then shoots up, stands a moment and drops. */
type Spout = { view: Object3D; wait: number; age: number; size: number };

export class LavaMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'night';
  readonly light = { hemisphere: 1.05, sun: 1.4 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.stone, palette.stoneDark]);
  private readonly model = new Model('lava');
  private readonly sea: Mesh;
  /** Whatever rides on the lava and rises with it: the bright line round every rock, the rafts of crust, the slivers. */
  private readonly afloat: Object3D | undefined;
  private readonly swirl: Object3D | undefined;
  private readonly bubbles: Bubble[] = [];
  private readonly spouts: Spout[] = [];
  private rocks: RockView[] = [];
  private wave = 0;
  private level = LEVEL.calm;
  private phase: 'calm' | 'alarm' | 'flood' = 'calm';
  private phaseLeft = 0;
  private phaseTotal = 1;

  constructor(kit: StageKit) {
    this.kit = kit;
    // Brighter than white, so the glow picks it up. It is a flat colour: lava is the one thing here with no outline.
    this.sea = new Mesh(new CylinderGeometry(70, 70, 0.4, 48), new MeshBasicMaterial({ color: LAVA.clone().multiplyScalar(1.35) }));
    this.afloat = this.model.node('afloat');
    this.swirl = this.model.node('swirl');
    this.group.add(this.tiles.mesh, this.sea, this.model.scene);
    for (let index = 0; index < BUBBLES; index++) {
      const view = this.model.part('bubble');
      view.scale.setScalar(0.001);
      this.group.add(view);
      this.bubbles.push({ view, wait: random(0, 3), age: 0, life: 1, size: 1, burst: null });
    }
    for (let index = 0; index < SPOUTS; index++) {
      const view = this.model.part('spout');
      view.scale.setScalar(0.001);
      this.group.add(view);
      this.spouts.push({ view, wait: random(1, 5), age: 0, size: 1 });
    }
    this.tiles.reset(true);
  }

  handle(event: GameEvent): void {
    const { words, rig, renderer, particles } = this.kit;
    if (event.t === 'lava') {
      this.phase = event.phase;
      this.phaseLeft = this.phaseTotal = event.seconds;
      if (event.phase === 'alarm') {
        words.pop(strings.words3d.lavaWarn, 0, 3.6, -1, { size: 1.5, color: colors.gold, seconds: 1.2 });
        rig.shake(0.2);
        this.erupt(8);
      } else if (event.phase === 'flood') {
        words.pop(strings.words3d.lava, 0, 3.8, -1, { size: 2, color: colors.danger, seconds: 1.3 });
        rig.shake(0.45);
        renderer.kick(0.3);
        this.erupt(22);
      }
    }
    if (event.t === 'eliminated' && event.cause === 'lava') {
      // Burnt: a burst of sparks where it stood.
      for (let index = 0; index < 18; index++) {
        const angle = random(0, Math.PI * 2);
        particles.spark({ x: event.x, y: 0.4, z: event.z, vx: Math.sin(angle) * random(1, 4), vy: random(4, 9), vz: Math.cos(angle) * random(1, 4), life: random(0.4, 0.8), size: random(0.12, 0.24), gravity: 12, spin: 10, color: HOT });
      }
    }
  }

  frame(round: AnyRound | null, dt: number, time: number): void {
    const field = round?.gameMode === 'lava' ? round : null;
    const rules = field?.rules;

    // A new wave: the old rocks sink and the new ones push up somewhere else.
    if (rules && rules.wave !== this.wave) {
      this.wave = rules.wave;
      for (const rock of this.rocks) rock.leaving ??= 0;
      rules.rocks.forEach((spot, index) => {
        // Three shapes in turn, each turned its own way, sized from the game's own numbers.
        const view = this.model.part(STONE.names[(this.wave + index) % STONE.names.length]!);
        const wide = tuning.lava.rockRadius / STONE.radius;
        view.scale.set(wide, tuning.lava.rockHeight / STONE.height, wide);
        view.rotation.y = random(0, Math.PI * 2);
        this.group.add(view);
        this.rocks.push({ view, x: spot.x, z: spot.z, age: 0, leaving: null });
      });
    }
    this.rocks = this.rocks.filter(rock => {
      rock.age += dt;
      if (rock.leaving !== null) rock.leaving += dt;
      // Up with a bounce; down plainly.
      const up = rock.leaving === null ? backOut(Math.min(1, rock.age / 0.35)) : Math.max(0, 1 - rock.leaving / 0.3);
      rock.view.position.set(rock.x, -(1 - up) * 0.9, rock.z);
      if (rock.leaving === null || rock.leaving < 0.3) return true;
      rock.view.removeFromParent();
      return false;
    });

    // The lava climbs steadily through the alarm, so the floor shows how long is left; it jumps over the lip only when the alarm ends.
    this.phaseLeft = Math.max(0, this.phaseLeft - dt);
    const progress = 1 - this.phaseLeft / this.phaseTotal;
    const goal = this.phase === 'flood' ? LEVEL.flood : this.phase === 'alarm' ? LEVEL.calm + (LEVEL.alarm - LEVEL.calm) * progress : LEVEL.calm;
    this.level += (goal - this.level) * (1 - Math.exp(-(this.phase === 'alarm' ? 30 : 9) * dt));
    this.sea.position.y = this.level - 0.2;
    if (this.afloat) this.afloat.position.y = this.level;
    if (this.swirl) this.swirl.rotation.y += (this.phase === 'calm' ? DRIFT.calm : DRIFT.busy) * dt;
    this.boil(dt);

    // Embers drift up from the sea all the time, and it spits when it is rising.
    const { particles } = this.kit;
    const busy = this.phase === 'calm' ? 6 : 26;
    if (Math.random() < busy * dt) {
      const angle = random(0, Math.PI * 2);
      const reach = random(Math.max(COLUMNS, ROWS) / 2 + 0.5, 15);
      particles.spark({ x: Math.sin(angle) * reach, y: this.level + 0.1, z: Math.cos(angle) * reach, vx: random(-0.5, 0.5), vy: random(2, 5), vz: random(-0.5, 0.5), life: random(0.6, 1.2), size: random(0.1, 0.22), gravity: -1, color: LAVA_HOT });
    }
    if (this.phase === 'flood' && Math.random() < 30 * dt) {
      particles.puff({ x: random(-COLUMNS / 2, COLUMNS / 2), y: this.level + 0.1, z: random(-ROWS / 2, ROWS / 2), vy: random(1, 2.5), life: 0.5, size: 0.25, sizeEnd: 0.6, color: LAVA_HOT });
    }
    this.tiles.update(dt, time);
    this.model.update(dt);
  }

  dispose(): void {
    this.sea.geometry.dispose();
    (this.sea.material as MeshBasicMaterial).dispose();
    this.tiles.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }

  /** The volcano answers the alarm: its mouth throws sparks, more of them when the lava comes. */
  private erupt(count: number): void {
    const { particles } = this.kit;
    for (let index = 0; index < count; index++) {
      const angle = random(0, Math.PI * 2);
      particles.spark({ x: VOLCANO.x, y: VOLCANO.mouth, z: VOLCANO.z, vx: Math.sin(angle) * random(1, 4.5), vy: random(6, 12), vz: Math.cos(angle) * random(1, 4.5), life: random(0.6, 1.1), size: random(0.16, 0.3), gravity: 14, spin: 9, color: LAVA_HOT });
    }
  }

  /** A spot in the open lava, at least `clear` metres from the slab and not inside the volcano. */
  private openLava(clear: number): { x: number; z: number } {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 16; tries++) {
      x = random(-14, 14);
      z = random(-9.5, 9.5);
      const nearSlab = Math.abs(x) < COLUMNS / 2 + clear && Math.abs(z) < ROWS / 2 + clear;
      if (!nearSlab && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) > VOLCANO.radius) break;
    }
    return { x, z };
  }

  /** The lava boils: bubbles swell up out of it here and there and burst in a few sparks, and now and then it spits a spout. More of both once it is rising. */
  private boil(dt: number): void {
    const { particles } = this.kit;
    const hurry = this.phase === 'calm' ? 1 : 2;
    for (const spout of this.spouts) {
      const { view } = spout;
      if (spout.wait > 0) {
        spout.wait -= dt * hurry;
        if (spout.wait > 0) continue;
        const { x, z } = this.openLava(SPOUT.clear);
        view.position.set(x, this.level, z);
        view.rotation.y = random(0, Math.PI * 2);
        spout.age = 0;
        spout.size = random(0.6, 1.15);
        for (let index = 0; index < 5; index++) {
          const angle = random(0, Math.PI * 2);
          particles.spark({ x, y: this.level + SPOUT.height * spout.size, z, vx: Math.sin(angle) * random(0.5, 2), vy: random(4, 7), vz: Math.cos(angle) * random(0.5, 2), life: random(0.4, 0.7), size: random(0.1, 0.2), gravity: 13, spin: 8, color: LAVA_HOT });
        }
      }
      spout.age += dt;
      view.position.y = this.level;
      // Up with a pop, a moment standing, then it drops back and thins as it goes.
      const up = backOut(Math.min(1, spout.age / SPOUT.up));
      const down = Math.max(0, Math.min(1, (spout.age - SPOUT.up - SPOUT.hold) / SPOUT.down));
      view.scale.set(spout.size * (1 - 0.5 * down), Math.max(0.001, spout.size * up * (1 - down)), spout.size * (1 - 0.5 * down));
      if (down >= 1) {
        view.scale.setScalar(0.001);
        spout.wait = random(2.5, 6);
      }
    }
    for (const bubble of this.bubbles) {
      const { view } = bubble;
      if (bubble.wait > 0) {
        bubble.wait -= dt * hurry;
        if (bubble.wait > 0) continue;
        const { x, z } = this.openLava(1.6);
        view.position.set(x, this.level, z);
        bubble.age = 0;
        bubble.life = random(0.7, 1.6) / hurry;
        bubble.size = random(0.5, 1.1);
        bubble.burst = null;
      }
      view.position.y = this.level;
      if (bubble.burst === null) {
        bubble.age += dt;
        // Out with a pop, then it goes on swelling until it gives.
        const swell = backOut(Math.min(1, bubble.age / 0.3)) * (0.6 + 0.4 * Math.min(1, bubble.age / bubble.life));
        view.scale.setScalar(Math.max(0.001, bubble.size * swell));
        if (bubble.age < bubble.life) continue;
        bubble.burst = 0;
        for (let index = 0; index < 4; index++) {
          const angle = random(0, Math.PI * 2);
          particles.spark({ x: view.position.x, y: this.level + 0.3, z: view.position.z, vx: Math.sin(angle) * random(0.6, 1.8), vy: random(2.5, 5), vz: Math.cos(angle) * random(0.6, 1.8), life: random(0.35, 0.6), size: random(0.1, 0.2) * bubble.size, gravity: 12, spin: 8, color: LAVA_HOT });
        }
      } else {
        // Burst: it flattens into the lava and is gone.
        bubble.burst += dt;
        const left = Math.max(0, 1 - bubble.burst / 0.12);
        const spread = bubble.size * (1.3 - 0.3 * left);
        view.scale.set(spread, Math.max(0.001, bubble.size * left), spread);
        if (left <= 0) {
          view.scale.setScalar(0.001);
          bubble.wait = random(0.4, 2.6);
        }
      }
    }
  }
}
