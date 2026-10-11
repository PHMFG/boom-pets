// Batata Quente: a frying pan on a stove, under a pink evening sky. The pan is the whole arena and its rim
// is the wall. The bomb rides over whoever holds it, swelling and beating faster as its fuse burns down.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, TorusGeometry, type MeshToonMaterial } from 'three';
import { motion } from '../../../shared/motion';
import { colors, maps, seats } from '../../../shared/tokens';
import { DANGER, HOT, random, type MapView, type SkyId, type StageKit } from '../kit';
import { disposeToys, toy } from './toys';

const RADIUS = tuning.potato.radius;
const BLAST = tuning.potato.blastRadius;
const palette = maps.potato;
const COOL = new Color(palette.bomb);
const FLAME = new Color(palette.flame).multiplyScalar(1.5);
const FLAME_HOT = new Color(palette.flameHot).multiplyScalar(1.7);
/** Beats a second: slow on a fresh fuse, and on a short one as quick as anything in the game may pulse. */
const BEAT = { slow: 1, fast: 1000 / motion.alarm.ms };
/** The last seconds of a fuse, when the reach of the blast is drawn round the holder. */
const WARN_SECONDS = 1.4;
/** How far over the holder's middle the bomb rides: just clear of its head. Its name moves up to make room. */
const RIDE = 1.45;
const HEADROOM = 1.15;
const FUSE = { length: 0.32, lean: -0.4, foot: 0.46 };
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

/** The bomb: a round black shell with a cap, a fuse that shortens and a spark at its tip. */
class Bomb {
  readonly group = new Group();
  /** Where the spark is, for the map to shed sparks from. */
  readonly tip = { x: 0, y: 0, z: 0 };
  private readonly body: Mesh;
  private readonly fuse: Mesh;
  private readonly spark: Mesh;
  private shown = 0;
  private beat = 0;
  private placed = false;

  constructor() {
    this.body = toy(new SphereGeometry(0.4, 16, 12), palette.bomb, 1.1);
    const shine = new Mesh(new SphereGeometry(0.1, 8, 6), new MeshBasicMaterial({ color: colors.white }));
    shine.position.set(-0.15, 0.17, 0.3);
    const cap = toy(new CylinderGeometry(0.13, 0.16, 0.14, 10), palette.grip, 1.12);
    cap.position.y = 0.41;
    // The fuse grows from its foot, so shortening it burns it down from the tip.
    this.fuse = toy(new CylinderGeometry(0.035, 0.035, FUSE.length, 6).translate(0, FUSE.length / 2, 0), palette.spoon, 1);
    this.fuse.position.y = FUSE.foot;
    this.fuse.rotation.z = FUSE.lean;
    this.spark = new Mesh(new IcosahedronGeometry(0.12, 0), new MeshBasicMaterial({ color: HOT }));
    this.group.add(this.body, shine, cap, this.fuse, this.spark);
    this.group.scale.setScalar(0.001);
  }

  /** How big the beat makes it right now: 0 between beats, 1 on one. The floor ring beats with it. */
  get pulse(): number {
    return Math.max(0, Math.sin(this.beat)) ** 2;
  }

  /** `over` is where to ride and how much fuse is left (1 to 0), or null when nobody holds a bomb. */
  update(over: { x: number; y: number; z: number; left: number } | null, dt: number, time: number): void {
    this.shown = Math.max(0, Math.min(1, this.shown + (over ? dt / 0.25 : -dt / 0.15)));
    if (!over) {
      this.placed = false;
      this.group.scale.setScalar(Math.max(0.001, this.shown));
      return;
    }
    // It flies to a new holder instead of jumping there, so a pass can be followed by eye.
    const pull = this.placed ? 1 - Math.exp(-14 * dt) : 1;
    this.placed = true;
    const { position } = this.group;
    position.set(position.x + (over.x - position.x) * pull, position.y + (over.y - position.y) * pull, position.z + (over.z - position.z) * pull);

    const heat = 1 - over.left;
    this.beat += dt * Math.PI * 2 * (BEAT.slow + (BEAT.fast - BEAT.slow) * heat);
    // It swells as the fuse burns, and goes from black to red.
    this.group.scale.setScalar(Math.max(0.001, backOut(this.shown) * (1.15 + heat * 0.35 + this.pulse * 0.14)));
    this.group.rotation.z = Math.sin(time * 9) * 0.05 * (1 + heat * 2);
    (this.body.material as MeshToonMaterial).color.copy(COOL).lerp(DANGER, heat * heat * 0.85);

    const length = 0.2 + 0.8 * over.left;
    this.fuse.scale.y = length;
    this.spark.position.set(-Math.sin(FUSE.lean) * FUSE.length * length, FUSE.foot + Math.cos(FUSE.lean) * FUSE.length * length, 0);
    this.spark.rotation.set(time * 9, time * 7, 0);
    this.spark.scale.setScalar(1 + Math.sin(time * 14) * 0.25);
    const scale = this.group.scale.x;
    this.tip.x = position.x + this.spark.position.x * scale;
    this.tip.y = position.y + this.spark.position.y * scale;
    this.tip.z = position.z;
  }

  /** Gone at once: the blast is what takes its place. */
  vanish(): void {
    this.shown = 0;
    this.placed = false;
    this.group.scale.setScalar(0.001);
  }

  dispose(): void {
    disposeToys(this.group);
  }
}

export class PotatoMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'alien';
  readonly light = { hemisphere: 1.1, sun: 1.45 };
  readonly bounds = { minX: -RADIUS, maxX: RADIUS, minZ: -RADIUS, maxZ: RADIUS };

  private readonly kit: StageKit;
  private readonly scenery = new Group();
  private readonly bomb = new Bomb();
  /** A broken ring that turns under whoever holds the bomb. Broken, so it is never taken for a seat's ring. */
  private readonly mark = new Group();
  /** How far the blast will throw, drawn round the holder for the fuse's last moments. */
  private readonly reach: Mesh;
  private readonly flames: Mesh[] = [];
  private readonly danger = new MeshBasicMaterial({ color: colors.danger });
  private markSize = 0;

  constructor(kit: StageKit) {
    this.kit = kit;
    for (let index = 0; index < 4; index++) {
      const dash = new Mesh(new RingGeometry(1, 1.24, 10, 1, (index / 4) * Math.PI * 2, 1), this.danger);
      dash.rotation.x = -Math.PI / 2;
      this.mark.add(dash);
    }
    this.reach = new Mesh(new RingGeometry(BLAST - 0.14, BLAST, 56).rotateX(-Math.PI / 2), this.danger);
    this.mark.position.y = this.reach.position.y = 0.05;
    this.mark.scale.setScalar(0.001);
    this.reach.scale.setScalar(0.001);
    this.group.add(this.scenery, this.bomb.group, this.mark, this.reach);
    this.build();
  }

  handle(event: GameEvent, round: AnyRound): void {
    const { decals, rig, stars, boom, poof } = this.kit;
    if (event.t === 'potato') {
      const holder = round.petOfSeat(event.holder);
      if (!holder) return;
      const color = new Color(seats[event.holder % seats.length]!.color);
      if (event.from === null) {
        // A new bomb drops in on someone.
        poof(holder.x, RIDE, holder.z);
        rig.shake(0.2);
      } else {
        stars(holder.x, 1.2, holder.z, 6);
      }
      decals.shock(holder.x, holder.z, 1.6, color, 0.3);
    } else if (event.t === 'potatoBoom') {
      this.bomb.vanish();
      boom(event.x, 0.6, event.z, BLAST);
    }
  }

  headroom(round: AnyRound, seat: number): number {
    return round.gameMode === 'potato' && round.rules.holder === seat ? HEADROOM : 0;
  }

  frame(round: AnyRound | null, dt: number, time: number): void {
    const field = round?.gameMode === 'potato' ? round : null;
    const rules = field?.rules;
    const holder = field && rules && rules.holder !== null && field.playing ? field.petOfSeat(rules.holder) : undefined;
    const left = holder && rules ? Math.max(0, rules.fuse / rules.fuseTotal) : 1;
    this.bomb.update(holder ? { x: holder.x, y: holder.y + RIDE, z: holder.z, left } : null, dt, time);

    // The mark under the holder beats with the bomb; the blast's reach closes in over the fuse's last moments.
    this.markSize = Math.max(0, Math.min(1, this.markSize + (holder ? dt / 0.2 : -dt / 0.15)));
    this.mark.scale.setScalar(Math.max(0.001, this.markSize * (1 + this.bomb.pulse * 0.1)));
    this.mark.rotation.y = time * 1.6;
    const warned = holder && rules ? Math.max(0, Math.min(1, 1 - rules.fuse / WARN_SECONDS)) : 0;
    this.reach.scale.setScalar(Math.max(0.001, warned));
    if (holder) {
      this.mark.position.set(holder.x, 0.05, holder.z);
      this.reach.position.set(holder.x, 0.05, holder.z);
      const { particles } = this.kit;
      if (Math.random() < (14 + (1 - left) * 30) * dt) {
        particles.spark({ x: this.bomb.tip.x, y: this.bomb.tip.y, z: this.bomb.tip.z, vx: random(-1.5, 1.5), vy: random(0.5, 3), vz: random(-1.5, 1.5), life: random(0.2, 0.4), size: random(0.06, 0.12), gravity: 9, spin: 12, color: HOT });
      }
    }

    // The burner under the pan: each flame flickers at its own pace, and they stand taller as a fuse runs out.
    this.flames.forEach((flame, index) => {
      const flicker = 0.8 + 0.2 * Math.sin(time * (7 + (index % 3)) + index * 1.9);
      flame.scale.set(1, flicker * (1 + (holder ? 1 - left : 0) * 0.5), 1);
    });
  }

  dispose(): void {
    this.bomb.dispose();
    this.mark.children.forEach(dash => (dash as Mesh).geometry.dispose());
    this.reach.geometry.dispose();
    this.danger.dispose();
    this.flames.forEach(flame => {
      flame.geometry.dispose();
      (flame.material as MeshBasicMaterial).dispose();
    });
    disposeToys(this.scenery);
    this.group.removeFromParent();
  }

  /** The pan, its handle, the stove it sits on and a wooden spoon left beside it. */
  private build(): void {
    // The cooking surface: pale, with two wide rings a shade deeper so movement over it can be read.
    [
      [RADIUS + 0.3, palette.pan],
      [RADIUS * 0.75, palette.panDark],
      [RADIUS * 0.5, palette.pan],
      [RADIUS * 0.25, palette.panDark],
    ].forEach(([radius, color], index) => {
      const disc = toy(new CylinderGeometry(radius as number, radius as number, 0.1, 56), color as string, 1);
      disc.position.y = -0.05 + index * 0.004;
      disc.castShadow = false;
      disc.receiveShadow = true;
      this.scenery.add(disc);
    });
    const body = toy(new CylinderGeometry(RADIUS + 0.7, RADIUS + 0.2, 1.06, 56), palette.rim, 1.012);
    body.position.y = -0.6;
    // The rim is the wall: low, so it never hides a pet standing against the near side.
    const rim = toy(new TorusGeometry(RADIUS + 0.48, 0.26, 10, 64), palette.rim, 1.012);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    this.scenery.add(body, rim);

    const handle = new Group();
    const arm = toy(new BoxGeometry(6.4, 0.42, 1.2), palette.rim, 1.03);
    arm.position.x = RADIUS + 3.6;
    const grip = toy(new BoxGeometry(3.6, 0.6, 1.5), palette.grip, 1.04);
    grip.position.x = RADIUS + 5.4;
    handle.add(arm, grip);
    handle.position.y = -0.2;
    handle.rotation.y = 0.55;
    this.scenery.add(handle);

    const stove = toy(new BoxGeometry(44, 2, 34), palette.stove, 1);
    stove.position.y = -3.2;
    stove.castShadow = false;
    stove.receiveShadow = true;
    const burner = toy(new CylinderGeometry(RADIUS - 0.4, RADIUS + 0.4, 0.9, 32), palette.burner, 1.01);
    burner.position.y = -1.75;
    this.scenery.add(stove, burner);
    for (let index = 0; index < 4; index++) {
      const arm = toy(new BoxGeometry(RADIUS * 2 + 4.4, 0.3, 0.5), palette.burner, 1.02);
      arm.position.y = -1.2;
      arm.rotation.y = (index / 4) * Math.PI;
      this.scenery.add(arm);
    }
    // The other burners, cold, and the knobs along the front.
    for (const [x, z, size] of [[-15, -9, 3.4], [15.5, -10, 2.6], [-15, 9, 2.6]] as const) {
      const cold = toy(new CylinderGeometry(size, size + 0.3, 0.5, 24), palette.burner, 1.02);
      cold.position.set(x, -1.95, z);
      this.scenery.add(cold);
    }
    for (let index = 0; index < 4; index++) {
      const knob = toy(new CylinderGeometry(0.9, 1, 0.7, 16), palette.grip, 1.05);
      knob.position.set(-7.5 + index * 5, -1.85, RADIUS + 6.2);
      this.scenery.add(knob);
    }

    // Flames lick up round the pan's edge. Brighter than white, so the glow picks them up.
    const count = 22;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const hot = index % 2 === 0;
      const flame = new Mesh(new ConeGeometry(hot ? 0.34 : 0.5, hot ? 1.1 : 1.5, 6).translate(0, hot ? 0.55 : 0.75, 0), new MeshBasicMaterial({ color: hot ? FLAME_HOT : FLAME }));
      flame.position.set(Math.sin(angle) * (RADIUS + 1.15), -1.75, Math.cos(angle) * (RADIUS + 1.15));
      this.flames.push(flame);
      this.group.add(flame);
    }

    const spoon = new Group();
    const shaft = toy(new CylinderGeometry(0.3, 0.36, 9, 8), palette.spoon, 1.05);
    shaft.rotation.z = Math.PI / 2;
    const bowl = toy(new SphereGeometry(1.5, 14, 10), palette.spoon, 1.04);
    bowl.scale.set(1.25, 0.35, 1);
    bowl.position.x = -5.6;
    spoon.add(shaft, bowl);
    spoon.position.set(-RADIUS - 5.6, -1.85, 2.5);
    spoon.rotation.y = 1.15;
    this.scenery.add(spoon);
  }
}
