// Batata Quente: a frying pan on a stove, under a pink evening sky. The pan is the whole arena and its rim
// is the wall. The bomb rides over whoever holds it, swelling and beating faster as its fuse burns down.
// The pan, the stove and the bomb are modelled in Blender (tools/blender/maps/potato.py). So is what makes the
// kitchen a place: spectators on tins round the pan who watch whoever has the bomb, a kitchen timer whose hand is
// the fuse, a kettle coming to the boil, and a lid that rattles. When the bomb goes off, everything on the stove jumps.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, RingGeometry, type MeshToonMaterial, type Object3D } from 'three';
import { motion } from '../../../shared/motion';
import { colors, maps, seats } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { DANGER, HOT, random, WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { Crowd, type Spot } from './crowd';
import { disposeToys, toy } from './toys';

const RADIUS = tuning.potato.radius;
/**
 * The pan was modelled 6 m from its middle to its rim, and the arena has grown since: the whole kitchen is
 * scaled so the rim is still the wall. A spot of the model is that many times farther out in the world.
 */
const FIT = RADIUS / 6;
const BLAST = tuning.potato.blastRadius;
const palette = maps.potato;
const COOL = new Color(palette.bomb);
/** Beats a second: slow on a fresh fuse, and on a short one as quick as anything in the game may pulse. */
const BEAT = { slow: 1, fast: 1000 / motion.alarm.ms };
/** The last seconds of a fuse, when the reach of the blast is drawn round the holder. */
const WARN_SECONDS = 1.4;
/** How far over the holder's middle the bomb rides: just clear of its head. Its name moves up to make room. */
const RIDE = 1.45;
const HEADROOM = 1.15;
const FUSE = { length: 0.32, lean: -0.4, foot: 0.46 };
/** A blast makes the things on the stove hop: how high, for how long, and how much later for each metre from the pan. */
const JOLT = { height: 0.4, seconds: 0.32, spread: 0.03 };
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

/** The bomb: a round black shell with a cap, a fuse that shortens and a spark at its tip. */
class Bomb {
  readonly group = new Group();
  /** Where the spark is, for the map to shed sparks from. */
  readonly tip = { x: 0, y: 0, z: 0 };
  private readonly body: MeshToonMaterial | null;
  private readonly fuse: Mesh;
  private readonly spark: Mesh;
  private shown = 0;
  private beat = 0;
  private placed = false;

  /** `shell` is the modelled bomb, and `body` the material of its black ball, which reddens. */
  constructor(shell: Object3D, body: MeshToonMaterial | null) {
    this.body = body;
    // The fuse grows from its foot, so shortening it burns it down from the tip.
    this.fuse = toy(new CylinderGeometry(0.035, 0.035, FUSE.length, 6).translate(0, FUSE.length / 2, 0), palette.spoon, 1);
    this.fuse.position.y = FUSE.foot;
    this.fuse.rotation.z = FUSE.lean;
    this.spark = new Mesh(new IcosahedronGeometry(0.12, 0), new MeshBasicMaterial({ color: HOT }));
    this.group.add(shell, this.fuse, this.spark);
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
    this.body?.color.copy(COOL).lerp(DANGER, heat * heat * 0.85);

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

  /** The fuse and the spark are made here; the shell is the model's. */
  dispose(): void {
    disposeToys(this.fuse);
    this.spark.geometry.dispose();
    (this.spark.material as MeshBasicMaterial).dispose();
  }
}

export class PotatoMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'alien';
  readonly light = { hemisphere: 1.1, sun: 1.45 };
  readonly bounds = { minX: -RADIUS, maxX: RADIUS, minZ: -RADIUS, maxZ: RADIUS };

  private readonly kit: StageKit;
  private readonly model = new Model('potato');
  /** The kitchen as it was modelled, scaled by `FIT`. Spectators and the bomb stay out of it: they keep their size. */
  private readonly world = new Group();
  private readonly bomb: Bomb;
  /** A broken ring that turns under whoever holds the bomb. Broken, so it is never taken for a seat's ring. */
  private readonly mark = new Group();
  /** How far the blast will throw, drawn round the holder for the fuse's last moments. */
  private readonly reach: Mesh;
  private readonly flames: Object3D[] = [];
  private readonly danger = new MeshBasicMaterial({ color: colors.danger });
  private readonly crowd: Crowd;
  /** What jumps when the bomb goes off: each with where it rests, and how far from the middle it stands (the farther, the later). */
  private readonly loose: { node: Object3D; rest: number; far: number }[] = [];
  /** The kitchen timer's hand: it goes once round the dial as a fuse burns down. */
  private readonly hand: Object3D | undefined;
  /** Seconds since the last blast, or null before any. */
  private sinceBlast: number | null = null;
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
    const shell = this.model.part('bomb');
    this.bomb = new Bomb(shell, this.model.own(shell, 'bomb'));
    this.world.scale.setScalar(FIT);
    this.world.add(this.model.scene);
    this.group.add(this.world, this.bomb.group, this.mark, this.reach);

    // Spectators stand wherever the model marks a seat (the lids of the tins, the pan's handle), facing the pan.
    const spots: Spot[] = [];
    for (let seat = this.model.node('seat_0'); seat; seat = this.model.node(`seat_${spots.length}`)) {
      spots.push({ x: seat.position.x * FIT, y: seat.position.y * FIT, z: seat.position.z * FIT, turn: Math.atan2(-seat.position.x, -seat.position.z) });
    }
    this.crowd = new Crowd(spots, { seed: 7 });
    this.group.add(this.crowd.group);
    for (const name of ['tin_0', 'tin_1', 'tin_2', 'tin_3', 'tin_4', 'timer', 'kettle', 'shaker', 'mill']) {
      const node = this.model.node(name);
      if (node) this.loose.push({ node, rest: node.position.y, far: Math.hypot(node.position.x, node.position.z) * FIT });
    }
    this.hand = this.model.node('timer_hand');

    // Flames lick up round the pan's edge, a tall one and a short hot one in turn.
    const count = 22;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const flame = this.model.part(index % 2 === 0 ? 'flame_hot' : 'flame');
      // In the model's own measure: they are scaled with the burner they come out of.
      flame.position.set(Math.sin(angle) * 7.2, -1.7, Math.cos(angle) * 7.2);
      flame.rotation.y = index * 2.4;
      this.flames.push(flame);
      this.world.add(flame);
    }
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
        this.crowd.gasp();
      } else {
        stars(holder.x, 1.2, holder.z, 6);
      }
      decals.shock(holder.x, holder.z, 1.6, color, 0.3);
    } else if (event.t === 'potatoBoom') {
      this.bomb.vanish();
      boom(event.x, 0.6, event.z, BLAST);
      // Everything standing on the stove jumps, and everyone watching with it.
      this.sinceBlast = 0;
      this.crowd.gasp();
    } else if (event.t === 'roundWinner') {
      this.crowd.cheer(3);
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

    // Everyone watching follows the bomb; with no bomb about they face the pan again.
    this.crowd.watch(holder ? { x: holder.x, z: holder.z } : null);
    this.crowd.update(dt);
    // The timer's hand goes once round, clockwise, as the fuse burns: at twelve again, it is over.
    if (this.hand) this.hand.rotation.y = -(1 - left) * Math.PI * 2;
    // After a blast the things on the stove hop, the nearest to the pan first, and settle.
    if (this.sinceBlast !== null) {
      this.sinceBlast += dt;
      for (const { node, rest, far } of this.loose) {
        const t = (this.sinceBlast - (far - RADIUS) * JOLT.spread) / JOLT.seconds;
        node.position.y = rest + (t > 0 && t < 1 ? Math.sin(t * Math.PI) * JOLT.height : 0);
      }
      if (this.sinceBlast > JOLT.seconds + 12 * JOLT.spread) this.sinceBlast = null;
    }
    // Fat spits at the pan's edge, more of it as a fuse runs out: small and pale, and never out where the pets are.
    if (field?.playing && Math.random() < (5 + (holder ? 1 - left : 0) * 14) * dt) {
      const angle = random(0, Math.PI * 2);
      const reach = RADIUS - random(0.1, 0.45);
      this.kit.particles.spark({ x: Math.sin(angle) * reach, y: 0.1, z: Math.cos(angle) * reach, vx: random(-0.4, 0.4), vy: random(1.6, 3.2), vz: random(-0.4, 0.4), life: random(0.25, 0.4), size: random(0.05, 0.09), gravity: 12, color: WHITE });
    }

    // The burner under the pan: each flame flickers at its own pace, and they stand taller as a fuse runs out.
    this.flames.forEach((flame, index) => {
      const flicker = 0.8 + 0.2 * Math.sin(time * (7 + (index % 3)) + index * 1.9);
      const lean = Math.sin(time * (3 + (index % 4)) + index) * 0.12;
      flame.scale.set(1 + lean * 0.4, flicker * (1 + (holder ? 1 - left : 0) * 0.5), 1 - lean * 0.4);
    });
    this.model.update(dt);
  }

  dispose(): void {
    this.crowd.dispose();
    this.bomb.dispose();
    this.mark.children.forEach(dash => (dash as Mesh).geometry.dispose());
    this.reach.geometry.dispose();
    this.danger.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }
}
