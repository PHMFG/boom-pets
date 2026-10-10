// O Chão é Lava: a slab of pale stone in the mouth of a volcano. Round rocks rise out of it for each wave,
// the sea of lava round it climbs while the alarm sounds, and then covers everything but the rocks.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps } from '../../../shared/tokens';
import { HOT, random, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { disposeToys, toy } from './toys';

const COLUMNS = tuning.lava.columns;
const ROWS = tuning.lava.rows;
const palette = maps.lava;
const LAVA = new Color(palette.lava);
const LAVA_HOT = new Color(palette.lavaHot).multiplyScalar(1.6);
/** How high the lava stands: far below while it is calm, at the slab's lip when the alarm ends, over the floor in a flood. */
const LEVEL = { calm: -0.75, alarm: -0.06, flood: 0.14 };
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

type RockView = { mesh: Mesh; x: number; z: number; age: number; leaving: number | null };

export class LavaMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'night';
  readonly light = { hemisphere: 1.05, sun: 1.4 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.stone, palette.stoneDark]);
  private readonly scenery = new Group();
  private readonly sea: Mesh;
  /** Drawn a little wider than it is, and dark: on a pale floor a rock has to be the first thing anyone sees. */
  private readonly rockGeometry = new CylinderGeometry(tuning.lava.rockRadius * 1.25, tuning.lava.rockRadius * 1.4, tuning.lava.rockHeight + 0.5, 9);
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
    this.group.add(this.tiles.mesh, this.sea, this.scenery);
    this.tiles.reset(true);
    this.build();
  }

  handle(event: GameEvent): void {
    const { words, rig, renderer, particles } = this.kit;
    if (event.t === 'lava') {
      this.phase = event.phase;
      this.phaseLeft = this.phaseTotal = event.seconds;
      if (event.phase === 'alarm') {
        words.pop(strings.words3d.lavaWarn, 0, 3.6, -1, { size: 1.5, color: colors.gold, seconds: 1.2 });
        rig.shake(0.2);
      } else if (event.phase === 'flood') {
        words.pop(strings.words3d.lava, 0, 3.8, -1, { size: 2, color: colors.danger, seconds: 1.3 });
        rig.shake(0.45);
        renderer.kick(0.3);
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
      for (const spot of rules.rocks) {
        const mesh = toy(this.rockGeometry, palette.rock, 1.07);
        mesh.receiveShadow = true;
        this.group.add(mesh);
        this.rocks.push({ mesh, x: spot.x, z: spot.z, age: 0, leaving: null });
      }
    }
    this.rocks = this.rocks.filter(rock => {
      rock.age += dt;
      if (rock.leaving !== null) rock.leaving += dt;
      // Up with a bounce; down plainly.
      const up = rock.leaving === null ? backOut(Math.min(1, rock.age / 0.35)) : Math.max(0, 1 - rock.leaving / 0.3);
      rock.mesh.position.set(rock.x, tuning.lava.rockHeight - (tuning.lava.rockHeight + 0.5) / 2 - (1 - up) * 0.9, rock.z);
      if (rock.leaving === null || rock.leaving < 0.3) return true;
      rock.mesh.removeFromParent();
      (rock.mesh.material as MeshBasicMaterial).dispose();
      return false;
    });

    // The lava climbs steadily through the alarm, so the floor shows how long is left; it jumps over the lip only when the alarm ends.
    this.phaseLeft = Math.max(0, this.phaseLeft - dt);
    const progress = 1 - this.phaseLeft / this.phaseTotal;
    const goal = this.phase === 'flood' ? LEVEL.flood : this.phase === 'alarm' ? LEVEL.calm + (LEVEL.alarm - LEVEL.calm) * progress : LEVEL.calm;
    this.level += (goal - this.level) * (1 - Math.exp(-(this.phase === 'alarm' ? 30 : 9) * dt));
    this.sea.position.y = this.level - 0.2;

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
  }

  dispose(): void {
    for (const rock of this.rocks) (rock.mesh.material as MeshBasicMaterial).dispose();
    this.rockGeometry.dispose();
    this.sea.geometry.dispose();
    (this.sea.material as MeshBasicMaterial).dispose();
    this.tiles.dispose();
    disposeToys(this.scenery);
    this.group.removeFromParent();
  }

  /** The crater: dark boulders standing in the lava, and two cones at the back with glowing mouths. */
  private build(): void {
    const boulder = new IcosahedronGeometry(1, 0);
    for (let index = 0; index < 18; index++) {
      const angle = (index / 18) * Math.PI * 2 + (index % 2) * 0.2;
      const reach = Math.max(COLUMNS, ROWS) / 2 + 3.5 + (index % 3) * 2.4;
      const rock = toy(boulder.clone(), palette.rim, 1.04);
      rock.position.set(Math.sin(angle) * reach * 1.15, -0.4, Math.cos(angle) * reach);
      rock.scale.set(1.6 + (index % 3) * 0.8, 1.3 + (index % 4) * 0.5, 1.6 + (index % 2) * 0.9);
      rock.rotation.y = index * 1.3;
      this.scenery.add(rock);
    }
    boulder.dispose();
    for (const [x, z, size] of [[-9, -17, 1], [8, -19, 1.3]] as const) {
      const cone = toy(new ConeGeometry(5.5 * size, 8 * size, 9, 1, true), palette.cone, 1.02);
      cone.position.set(x, 2.6 * size, z);
      const mouth = new Mesh(new CylinderGeometry(1.5 * size, 1.5 * size, 0.3, 9), new MeshBasicMaterial({ color: LAVA_HOT }));
      mouth.position.y = 3.6 * size;
      cone.add(mouth);
      this.scenery.add(cone);
    }
  }
}
