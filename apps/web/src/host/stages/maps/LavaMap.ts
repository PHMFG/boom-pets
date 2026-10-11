// O Chão é Lava: a slab of pale stone in the mouth of a volcano. Flat-topped rocks rise out of it for each wave,
// the sea of lava round it climbs while the alarm sounds, and then covers everything but the rocks.
// The crater, the rocks and what floats on the lava are modelled in Blender (tools/blender/maps/lava.py).
//
// The crater is alive, and it answers the round. Spectators stand on the columns at the back and the sides and
// follow the pets. Through the alarm the whole place shakes harder and harder: the volcano swells and smokes,
// lava wells up in its mouth, the cracks in the wall glow, the current behind the slab quickens, and the
// creatures of the lava duck under. When the lava comes the volcano goes off, and the dinosaur's skull clatters
// at whoever was caught.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, type MeshToonMaterial, type Object3D } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps } from '../../../shared/tokens';
import { Model } from '../../render/models';
import { HOT, random, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { Crowd, type Spot } from './crowd';

const COLUMNS = tuning.lava.columns;
const ROWS = tuning.lava.rows;
const palette = maps.lava;
const LAVA = new Color(palette.lava);
const LAVA_HOT = new Color(palette.lavaHot).multiplyScalar(1.6);
const SMOKE = new Color(colors.smoke);
/** How bright the lava's own colour is drawn where it only lies there, and how much brighter the cracks in the wall get at the height of the alarm. */
const GLOW = { rest: 1.35, alarm: 1.5 };
/** How high the lava stands: far below while it is calm, at the slab's lip when the alarm ends, over the floor in a flood. */
const LEVEL = { calm: -0.75, alarm: -0.06, flood: 0.14 };
/**
 * The rocks as they are modelled: how high their flat top is, and the radius of the game's rock they were drawn for.
 * On a pale floor a rock has to be the first thing anyone sees, so it is dark and drawn a little wider than it is.
 */
const STONE = { names: ['stone_a', 'stone_b', 'stone_c'], height: 0.3, radius: 0.5 };
/** Bubbles swelling out of the lava at any moment. */
const BUBBLES = 9;
/** Where the volcano stands and how high its mouth is, for what it throws. */
const VOLCANO = { x: -9.9, z: -6, mouth: 2.5 };
/** Spouts shooting out of the lava at any moment, how near the slab one may come (too far to look like a threat), and how high one stands as modelled. */
const SPOUTS = 3;
const SPOUT = { clear: 2.4, up: 0.16, hold: 0.3, down: 0.22, height: 2 };
/** Where the two lava falls meet the sea: they spit sparks there, more as the alarm climbs. */
const FALLS = [
  { x: -2.9, z: -9.5 },
  { x: 4.3, z: -9.55 },
];
/**
 * The current: the strip of open lava behind the slab, between it and the wall, runs from the volcano's side to
 * the dinosaur's. Rafts of crust ride it and its slivers slide along (they repeat every `step` metres).
 */
const CURRENT = { from: -6.3, to: 7.1, z: -7.8, speed: 0.45, rush: 2.2, step: 3, rafts: 3 };
/** Creatures of the lava that come up to watch: how many, how near the slab and how far, and how fast they come and go. */
const CRITTERS = 3;
const CRITTER = { clear: 2, reach: 4.8, up: 0.3, down: 0.18 };
/** The skull's clatter when someone burns: seconds, how many snaps (under 2.6 a second) and how wide, in radians. */
const CLATTER = { seconds: 1.25, snaps: 3, open: 0.42 };
/** The volcano going off when the lava comes: seconds its fountain stands, and how tall beside the model's. */
const ERUPTION = { seconds: 1.5, up: 0.22, down: 0.35, height: 1.15 };
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type RockView = { view: Object3D; x: number; z: number; age: number; leaving: number | null };
/** A bubble waits under the lava, swells for `life` seconds and bursts. */
type Bubble = { view: Object3D; wait: number; age: number; life: number; size: number; burst: number | null };
/** A spout waits under the lava, then shoots up, stands a moment and drops. */
type Spout = { view: Object3D; wait: number; age: number; size: number };
/** An open spot in the lava, clear of every rock, and how far it is from the slab's edge. */
type Vent = { x: number; z: number; off: number };
/** A creature waits under the lava, comes up at a vent, watches until `leaves` seconds have passed, and ducks. */
type Critter = { view: Object3D; wait: number; age: number; leaves: number; up: boolean; x: number; z: number };
type Raft = { view: Object3D; x: number; phase: number };

export class LavaMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'night';
  readonly light = { hemisphere: 1.05, sun: 1.4 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.stone, palette.stoneDark]);
  private readonly model = new Model('lava');
  private readonly sea: Mesh;
  private readonly crowd: Crowd;
  /** Where the crowd and the creatures look: the middle of the pets still in. */
  private readonly eye = { x: 0, z: 0 };
  /** Whatever rides on the lava and rises with it: the line round every rock, the rafts of crust, the slivers. */
  private readonly afloat: Object3D | undefined;
  private readonly swirl: Object3D | undefined;
  private readonly current: Object3D | undefined;
  private readonly volcano: Object3D | undefined;
  private readonly skull: Object3D | undefined;
  private readonly plume: Object3D;
  /** The boulders at either side, which tremble with the alarm. */
  private readonly shaken: Object3D[] = [];
  private readonly cracks: MeshToonMaterial | null = null;
  private readonly bubbles: Bubble[] = [];
  private readonly spouts: Spout[] = [];
  private readonly critters: Critter[] = [];
  private readonly rafts: Raft[] = [];
  private readonly vents: Vent[] = [];
  private rocks: RockView[] = [];
  private wave = 0;
  private level = LEVEL.calm;
  private phase: 'calm' | 'alarm' | 'flood' = 'calm';
  private phaseLeft = 0;
  private phaseTotal = 1;
  /** How hard the crater shakes, 0 to 1: it builds through the alarm and dies away after the flood. */
  private rumble = 0;
  private drift = 0;
  private clatter = 0;
  private eruption = 0;

  constructor(kit: StageKit) {
    this.kit = kit;
    // Brighter than white, so the glow picks it up. It is a flat colour: lava is the one thing here with no outline.
    this.sea = new Mesh(new CylinderGeometry(70, 70, 0.4, 48), new MeshBasicMaterial({ color: LAVA.clone().multiplyScalar(GLOW.rest) }));
    const { model } = this;
    this.afloat = model.node('afloat');
    this.swirl = model.node('swirl');
    this.current = model.node('current');
    this.volcano = model.node('volcano');
    this.skull = model.node('skull_top');
    for (const name of ['rocks_west', 'rocks_east']) {
      const rocks = model.node(name);
      if (rocks) this.shaken.push(rocks);
    }
    const cracks = model.node('cracks');
    if (cracks) this.cracks = model.own(cracks, 'lava');
    this.group.add(this.tiles.mesh, this.sea, model.scene);

    // The model says where its lava is open, three numbers a spot: x, how far back, and how far from the slab.
    // The strip the current runs along is left to the rafts.
    const numbers = (name: string) => (model.node(name)?.userData.spots ?? []) as number[];
    const open = numbers('vents');
    for (let index = 0; index + 2 < open.length; index += 3) {
      const vent = { x: open[index]!, z: -open[index + 1]!, off: open[index + 2]! };
      const inCurrent = Math.abs(vent.z - CURRENT.z) < 1.1 && vent.x > CURRENT.from - 1.5 && vent.x < CURRENT.to + 1.5;
      if (!inCurrent) this.vents.push(vent);
    }
    // And where its spectators stand: x, how far back, and how high. Each faces the middle of the slab.
    const perches = numbers('perches');
    const spots: Spot[] = [];
    for (let index = 0; index + 2 < perches.length; index += 3) {
      const [x, back, y] = [perches[index]!, perches[index + 1]!, perches[index + 2]!];
      spots.push({ x, y, z: -back, turn: Math.atan2(-x, back) });
    }
    this.crowd = new Crowd(spots, { seed: 7 });
    this.crowd.watch(this.eye);
    this.group.add(this.crowd.group);

    // Not drawn at all until their turn comes: things waiting under the lava are things drawn for nothing.
    const hidden = (name: string) => {
      const view = model.part(name);
      view.visible = false;
      this.group.add(view);
      return view;
    };
    for (let index = 0; index < BUBBLES; index++) this.bubbles.push({ view: hidden('bubble'), wait: random(0, 3), age: 0, life: 1, size: 1, burst: null });
    for (let index = 0; index < SPOUTS; index++) this.spouts.push({ view: hidden('spout'), wait: random(1, 5), age: 0, size: 1 });
    for (let index = 0; index < CRITTERS; index++) this.critters.push({ view: hidden('critter'), wait: random(1.5, 4) + index * 1.5, age: 0, leaves: 0, up: false, x: 0, z: 0 });
    for (let index = 0; index < CURRENT.rafts; index++) {
      const view = model.part('raft');
      this.group.add(view);
      this.rafts.push({ view, x: CURRENT.from + ((index + 0.4) / CURRENT.rafts) * (CURRENT.to - CURRENT.from), phase: index * 2.1 });
    }
    this.plume = hidden('plume');
    this.plume.position.set(VOLCANO.x, VOLCANO.mouth - 0.35, VOLCANO.z);
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
        this.eruption = ERUPTION.seconds;
        this.crowd.gasp();
      } else if (event.wave > 1) {
        // The lava has gone down again: a hand for whoever is still standing.
        this.crowd.clap();
      }
    } else if (event.t === 'roundWinner') {
      this.crowd.cheer(3);
      this.erupt(14);
    }
    if (event.t === 'eliminated' && event.cause === 'lava') {
      // Burnt: a burst of sparks where it stood, and the skull has its laugh.
      for (let index = 0; index < 18; index++) {
        const angle = random(0, Math.PI * 2);
        particles.spark({ x: event.x, y: 0.4, z: event.z, vx: Math.sin(angle) * random(1, 4), vy: random(4, 9), vz: Math.cos(angle) * random(1, 4), life: random(0.4, 0.8), size: random(0.12, 0.24), gravity: 12, spin: 10, color: HOT });
      }
      this.clatter = CLATTER.seconds;
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

    // The crater shakes harder as the alarm runs out, and settles slowly once the lava is up.
    const wanted = this.phase === 'alarm' ? 0.25 + 0.75 * progress : this.phase === 'flood' ? 0.55 : 0;
    this.rumble += (wanted - this.rumble) * (1 - Math.exp(-(wanted > this.rumble ? 7 : 2.2) * dt));

    // Everyone watching looks at the middle of the pets still in.
    if (field) {
      let count = 0;
      let x = 0;
      let z = 0;
      for (const pet of field.pets) {
        if (!pet.alive) continue;
        count++;
        x += pet.x;
        z += pet.z;
      }
      this.eye.x = count > 0 ? x / count : 0;
      this.eye.z = count > 0 ? z / count : 0;
    }
    this.crowd.update(dt);

    this.shake(dt, time);
    this.flow(dt, time);
    this.boil(dt);
    this.surface(dt, time);
    this.weather(dt);
    this.tiles.update(dt, time);
    this.model.update(dt);
  }

  dispose(): void {
    this.sea.geometry.dispose();
    (this.sea.material as MeshBasicMaterial).dispose();
    this.tiles.dispose();
    this.crowd.dispose();
    this.model.dispose();
    this.group.removeFromParent();
  }

  /** What the alarm does to the scenery: the volcano, the boulders, the cracks in the wall and the old skull. */
  private shake(dt: number, time: number): void {
    const { rumble } = this;
    if (this.volcano) {
      this.volcano.position.x = VOLCANO.x + Math.sin(time * 43) * rumble * 0.045;
      this.volcano.position.z = VOLCANO.z + Math.cos(time * 37) * rumble * 0.045;
      // It swells with each breath, slower than anything in the game may pulse.
      this.volcano.scale.y = 1 + rumble * 0.06 * Math.sin(time * Math.PI * 2 * 1.8);
    }
    this.shaken.forEach((rocks, index) => {
      rocks.position.y = Math.sin(time * (41 + index * 9) + index) * rumble * 0.05;
    });
    this.cracks?.color.copy(LAVA).multiplyScalar(GLOW.rest + rumble * GLOW.alarm);

    // Lava wells up in the volcano's mouth through the alarm; when the flood comes it stands up as a fountain and drops back.
    this.eruption = Math.max(0, this.eruption - dt);
    const spent = ERUPTION.seconds - this.eruption;
    const fountain = this.eruption > 0 ? backOut(clamp01(spent / ERUPTION.up)) * clamp01(this.eruption / ERUPTION.down) * ERUPTION.height : 0;
    const tall = Math.max(fountain, rumble * (0.2 + 0.05 * Math.sin(time * 11)));
    this.plume.visible = tall > 0.02;
    this.plume.scale.set(0.75 + 0.25 * clamp01(tall), Math.max(0.001, tall), 0.75 + 0.25 * clamp01(tall));

    // The skull snaps a few times, each a little less wide than the last.
    this.clatter = Math.max(0, this.clatter - dt);
    if (this.skull) {
      const through = 1 - this.clatter / CLATTER.seconds;
      this.skull.rotation.z = this.clatter > 0 ? Math.abs(Math.sin(through * Math.PI * CLATTER.snaps)) * CLATTER.open * (1 - through * 0.5) : 0;
    }
  }

  /** The current behind the slab: its slivers slide along and its rafts ride it, all of it quicker while the crater shakes. */
  private flow(dt: number, time: number): void {
    const speed = CURRENT.speed * (1 + this.rumble * CURRENT.rush);
    this.drift = (this.drift + speed * dt) % CURRENT.step;
    if (this.current) this.current.position.x = this.drift;
    if (this.swirl) this.swirl.rotation.y += 0.035 * (1 + this.rumble * CURRENT.rush) * dt;
    this.rafts.forEach((raft, index) => {
      raft.x += speed * dt;
      // At the end of the strip it goes under, and a new one comes up where the strip begins.
      if (raft.x > CURRENT.to) raft.x = CURRENT.from;
      const shown = backOut(clamp01((raft.x - CURRENT.from) / 0.7)) * clamp01((CURRENT.to - raft.x) / 0.5);
      // It rides the lava, rocking a little, long side on to the current: the strip is too narrow for it to turn in.
      raft.view.position.set(raft.x, this.level + Math.sin(time * 1.9 + raft.phase) * 0.04, CURRENT.z + Math.sin(index * 4.3) * 0.12);
      raft.view.rotation.y = Math.sin(time * 0.7 + raft.phase) * 0.14;
      raft.view.scale.setScalar(Math.max(0.001, shown));
    });
  }

  /** The volcano throws sparks: at the alarm, more when the lava comes, and for the winner. They fly away from the slab: an ember landing on the floor would look like something to dodge. */
  private erupt(count: number): void {
    const { particles } = this.kit;
    const away = Math.atan2(VOLCANO.x, VOLCANO.z);
    for (let index = 0; index < count; index++) {
      const angle = away + random(-1.2, 1.2);
      particles.spark({ x: VOLCANO.x, y: VOLCANO.mouth, z: VOLCANO.z, vx: Math.sin(angle) * random(1, 4.5), vy: random(6, 12), vz: Math.cos(angle) * random(1, 4.5), life: random(0.6, 1.1), size: random(0.16, 0.3), gravity: 14, spin: 9, color: LAVA_HOT });
    }
  }

  /** An open spot in the lava between `least` and `most` metres from the slab with nothing else up near it, or null. */
  private vent(least: number, most = Infinity): Vent | null {
    for (let tries = 0; tries < 10; tries++) {
      const vent = this.vents[Math.floor(Math.random() * this.vents.length)];
      if (!vent || vent.off < least || vent.off > most) continue;
      if (!this.critters.some(critter => critter.up && Math.hypot(critter.x - vent.x, critter.z - vent.z) < 1.6)) return vent;
    }
    return null;
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
        const vent = this.vent(SPOUT.clear);
        if (!vent) continue;
        const { x, z } = vent;
        view.position.set(x, this.level, z);
        view.rotation.y = random(0, Math.PI * 2);
        view.visible = true;
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
      const down = clamp01((spout.age - SPOUT.up - SPOUT.hold) / SPOUT.down);
      view.scale.set(spout.size * (1 - 0.5 * down), Math.max(0.001, spout.size * up * (1 - down)), spout.size * (1 - 0.5 * down));
      if (down >= 1) {
        view.visible = false;
        spout.wait = random(2.5, 6);
      }
    }
    for (const bubble of this.bubbles) {
      const { view } = bubble;
      if (bubble.wait > 0) {
        bubble.wait -= dt * hurry;
        if (bubble.wait > 0) continue;
        const vent = this.vent(0);
        if (!vent) continue;
        view.position.set(vent.x + random(-0.25, 0.25), this.level, vent.z + random(-0.25, 0.25));
        view.visible = true;
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
          view.visible = false;
          bubble.wait = random(0.4, 2.6);
        }
      }
    }
  }

  /** The creatures of the lava: one comes up near the slab, turns to watch the pets for a while and goes under again. They all duck the moment the alarm sounds, and stay down until the lava has gone. */
  private surface(dt: number, time: number): void {
    this.critters.forEach((critter, index) => {
      const { view } = critter;
      if (!critter.up) {
        critter.wait -= dt;
        if (critter.wait > 0 || this.phase !== 'calm') return;
        const vent = this.vent(CRITTER.clear, CRITTER.reach);
        if (!vent) return;
        Object.assign(critter, { up: true, age: 0, leaves: random(4, 8), x: vent.x, z: vent.z });
        view.rotation.y = Math.atan2(this.eye.x - vent.x, this.eye.z - vent.z);
        view.visible = true;
      }
      critter.age += dt;
      if (this.phase !== 'calm') critter.leaves = Math.min(critter.leaves, critter.age);
      const shown = backOut(clamp01(critter.age / CRITTER.up)) * (1 - clamp01((critter.age - critter.leaves) / CRITTER.down));
      // It bobs in the lava, and turns to keep the pets in sight, by the short way round.
      view.position.set(critter.x, this.level - 0.12 + Math.sin(time * 2.3 + index * 1.7) * 0.04 - (1 - Math.min(1, shown)) * 0.4, critter.z);
      const wanted = Math.atan2(this.eye.x - critter.x, this.eye.z - critter.z);
      view.rotation.y += Math.atan2(Math.sin(wanted - view.rotation.y), Math.cos(wanted - view.rotation.y)) * (1 - Math.exp(-3 * dt));
      view.scale.set(1, Math.max(0.001, shown), 1);
      if (critter.age >= critter.leaves + CRITTER.down) {
        critter.up = false;
        critter.wait = random(1.5, 5);
        view.visible = false;
      }
    });
  }

  /** What is in the air: embers off the sea, sparks where the falls land, smoke from the volcano and ash coming down. None of it over the floor, where it would only hide pets. */
  private weather(dt: number): void {
    const { particles } = this.kit;
    const { rumble } = this;
    const chance = (perSecond: number) => Math.random() < perSecond * dt;
    // Embers drift up from the sea all the time, and it spits when it is rising.
    if (chance(this.phase === 'calm' ? 6 : 26)) {
      const angle = random(0, Math.PI * 2);
      const reach = random(Math.max(COLUMNS, ROWS) / 2 + 0.5, 15);
      particles.spark({ x: Math.sin(angle) * reach, y: this.level + 0.1, z: Math.cos(angle) * reach, vx: random(-0.5, 0.5), vy: random(2, 5), vz: random(-0.5, 0.5), life: random(0.6, 1.2), size: random(0.1, 0.22), gravity: -1, color: LAVA_HOT });
    }
    if (this.phase === 'flood' && chance(30)) {
      particles.puff({ x: random(-COLUMNS / 2, COLUMNS / 2), y: this.level + 0.1, z: random(-ROWS / 2, ROWS / 2), vy: random(1, 2.5), life: 0.5, size: 0.25, sizeEnd: 0.6, color: LAVA_HOT });
    }
    for (const fall of FALLS) {
      if (!chance(3 + rumble * 16)) continue;
      particles.spark({ x: fall.x + random(-0.5, 0.5), y: this.level + 0.15, z: fall.z + random(0, 0.5), vx: random(-1.2, 1.2), vy: random(1.5, 3.5) * (1 + rumble), vz: random(0, 1.2), life: random(0.35, 0.6), size: random(0.08, 0.16), gravity: 9, spin: 7, color: LAVA_HOT });
    }
    // The volcano smokes, thick and fast while the crater shakes.
    if (chance(1.2 + rumble * 9)) {
      particles.puff({ x: VOLCANO.x + random(-0.4, 0.4), y: VOLCANO.mouth + 0.2, z: VOLCANO.z + random(-0.4, 0.4), vx: random(-0.5, 0.1), vy: random(1.6, 3) * (1 + rumble), vz: random(-0.5, 0), life: random(1, 1.6), size: 0.3, sizeEnd: random(0.7, 1.1), drag: 0.4, color: SMOKE });
    }
    // Ash comes down over the lava at the sides and the back, drifting away from the slab as it falls.
    if (chance(5 + rumble * 10)) {
      const side = Math.random() < 0.6;
      const x = side ? (Math.random() < 0.5 ? -1 : 1) * random(COLUMNS / 2 + 1.5, 15) : random(-15, 15);
      const z = side ? random(-12, 8) : random(-13, -ROWS / 2 - 1.5);
      particles.cube({ x, y: random(4, 7), z, vx: side ? Math.sign(x) * random(0.1, 0.5) : random(-0.3, 0.3), vy: random(-1.3, -0.7), vz: side ? random(-0.2, 0.2) : random(-0.4, 0), life: random(4, 6), size: random(0.06, 0.1), spin: random(1, 4), color: SMOKE });
    }
  }
}
