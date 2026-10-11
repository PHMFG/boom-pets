// Batatinha Frita 1, 2, 3: a lane across a playground, with a giant cat sitting behind it. While the cat
// sings it has its back to the lane and the edges of the lane are green; it counts one, two, three, turns
// round, and the edges go red. Whoever is caught moving goes back to the start in a puff.
// The park round the lane (the cat's sandbox, the bushes and trees, the playground that keeps moving, the arch
// at the start, the flags at the finish and the street beyond the fence) is modelled in Blender
// (tools/blender/maps/frita.py). The park plays the game too: while the cat looks, every swing, bird and petal
// in it stops dead, and so does everyone who came to watch.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps } from '../../../shared/tokens';
import { createPet, INK_LINE, OUTLINE, type PetInstance } from '../../render/assets';
import { Model } from '../../render/models';
import { DANGER, fitScenery, WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { Crowd, type Spot } from './crowd';

const COLUMNS = tuning.frita.columns;
const ROWS = tuning.frita.rows;
/** The park was laid out round a lane of 26 by 9, and the lane has grown: see `fitScenery`. */
const BUILT = { columns: 26, rows: 9 };
const FIT = fitScenery(BUILT, COLUMNS, ROWS);
const START_X = -COLUMNS / 2 + 1.9;
const FINISH_X = COLUMNS / 2 - tuning.frita.finish;
const palette = maps.frita;
const GO = new Color(colors.go);
/** The cat: how big, where it sits (in its sandbox, which is the model's) and how deep in the sand. Behind the middle of the lane, so it is on screen wherever the pets are. */
const CAT = { scale: 2.5 * FIT.y, x: 0, y: -0.3 * FIT.y, z: (-BUILT.rows / 2 - 3.4) * FIT.z };
/** Where the count and the cat's shout appear: at its feet, over the far edge of the lane, so its face stays clear. */
const SHOUT = { x: CAT.x, y: 1.5, z: -ROWS / 2 - 0.9 };
/** Facing away from the lane, and facing it. It turns by way of the finish line. */
const BACK = Math.PI;
const FRONT = 0;
/** Seconds for the cat to come round. Shorter than the grace the rules give before anyone is judged. */
const TURN = 0.22;
/** How far through the song each of "1, 2, 3" is counted. */
const COUNTS = [0.4, 0.6, 0.8];
/** Who came to watch, and from where: two on the bench, one up the slide's tower, three on crates behind the fence. */
const FANS: Spot[] = [
  { x: 16.18, y: 0.04, z: -7.26, turn: -0.24 },
  { x: 15.02, y: 0.04, z: -7.55, turn: -0.24 },
  { x: 12.4, y: 1.44, z: -9.7 },
  { x: -8.8, y: 0.14, z: -15.5 },
  { x: -2.9, y: 0.14, z: -15.5 },
  { x: 6.6, y: 0.14, z: -15.5 },
].map(spot => ({ ...spot, ...FIT.at(spot) }));
/** Who is riding what: the piece of the model each sits on, and where on that piece. They go where it goes. */
const RIDERS: { on: string; spots: Spot[] }[] = [
  { on: 'swing_seat_0', spots: [{ x: 0, y: -2.23, z: 0 }] },
  { on: 'roundabout', spots: [{ x: 1, y: 0.6, z: 0, turn: Math.PI / 2 }, { x: -1, y: 0.6, z: 0, turn: -Math.PI / 2 }] },
  { on: 'spring_horse', spots: [{ x: -0.1, y: 1.43, z: 0, turn: Math.PI / 2 }] },
];
/** How fast the park stops when the cat looks and picks up again when it sings (a second), and how much faster it whirls for a moment of joy. */
const PARK = { stop: 22, start: 6, joy: 0.8, joySeconds: 1.4 };

export class FritaMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'day';
  readonly light = { hemisphere: 1.15, sun: 1.5 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.grass, palette.grassDark]);
  private readonly model = new Model('frita');
  /** The park as it was modelled, scaled by `FIT`. */
  private readonly world = new Group();
  /** What is painted on the lane: its lines and the chequered finish, every mark of them drawn in one go. */
  private readonly paint: InstancedMesh;
  /** One strip of light, laid along each edge of the lane. */
  private readonly strip = new BoxGeometry(COLUMNS, 0.16, 0.36);
  private readonly cat: PetInstance;
  private readonly catTurn = new Group();
  /** The strips along both edges of the lane: green to run, red to freeze. */
  private readonly lights = new MeshBasicMaterial({ color: colors.go });
  /** Those watching from a place of their own, and those riding something that moves. */
  private readonly fans = new Crowd(FANS, { seed: 5, leave: ['cat'] });
  private readonly riders: Crowd[] = [];
  private readonly leader = { x: 0, z: 0 };
  /** How fast the park's own life runs: 1 while the cat sings, 0 while it looks. */
  private pace = 1;
  /** A moment of joy, 1 to 0: the park whirls a little faster. */
  private joy = 0;
  /** The round has its winner: nobody need stand still any more. */
  private over = false;
  private watching = false;
  private turn = BACK;
  private counted = 0;
  private hop = 0;

  constructor(kit: StageKit) {
    this.kit = kit;
    this.cat = createPet('cat', colors.white);
    this.cat.model.scale.setScalar(CAT.scale);
    // An outline is as thick as the model is big, so a giant's is thinned: a line twice a pet's, not a slab.
    this.cat.outline.uniforms.thickness!.value = (OUTLINE * 1.5) / CAT.scale;
    this.cat.ink.uniforms.thickness!.value = ((OUTLINE + INK_LINE) * 1.5) / CAT.scale;
    this.cat.actions.get('dance')?.play();
    this.catTurn.add(this.cat.model);
    this.catTurn.position.set(CAT.x, CAT.y, CAT.z);
    this.catTurn.rotation.y = this.turn;
    this.paint = this.painted();
    this.world.scale.set(FIT.x, FIT.y, FIT.z);
    this.world.add(this.model.scene);
    this.group.add(this.tiles.mesh, this.world, this.paint, this.catTurn, this.fans.group);
    RIDERS.forEach((ride, index) => {
      const piece = this.model.node(ride.on);
      if (!piece) return;
      // They ride a piece that is scaled, and are not to be: their places are spread by `FIT` and the group shrunk by it.
      const riders = new Crowd(ride.spots.map(spot => ({ ...spot, ...FIT.at({ x: spot.x, y: spot.y ?? 0, z: spot.z }) })), { seed: 11 + index * 7, leave: ['cat'] });
      riders.group.scale.setScalar(1 / FIT.y);
      piece.add(riders.group);
      this.riders.push(riders);
    });
    this.tiles.reset(true);
    this.build();
  }

  handle(event: GameEvent): void {
    const { words, rig, particles, stars } = this.kit;
    if (event.t === 'watch') {
      this.watching = event.phase === 'watch';
      this.counted = 0;
      const still = this.cat.actions.get('idle');
      const song = this.cat.actions.get('dance');
      if (this.watching) {
        // It has turned: the word, a thump, and the cat stops dead.
        song?.stop();
        still?.play();
        this.hop = 1;
        words.pop(strings.words3d.stop, SHOUT.x, SHOUT.y, SHOUT.z, { size: 1.5, color: colors.danger, seconds: 0.8 });
        rig.shake(0.22);
      } else {
        still?.stop();
        song?.play();
      }
    } else if (event.t === 'caught') {
      // Those watching wince, but not yet: they are standing still too, and it waits for the song.
      this.fans.gasp();
      // Seen moving: a red puff where it stood. The puff where it lands is the stage's.
      words.pop(strings.words3d.moved, event.x, 2.6, event.z - 0.4, { size: 0.8, color: colors.danger, seconds: 0.8 });
      particles.puff({ x: event.x, y: 0.8, z: event.z, life: 0.35, size: 0.6, sizeEnd: 1.3, color: DANGER });
      stars(event.x, 1, event.z, 6);
      rig.shake(0.15);
    } else if (event.t === 'finish') {
      const { confetti } = this.kit;
      confetti(FINISH_X + 1, 0.5, 0, [new Color(colors.gold), WHITE, GO], event.place === 1 ? 60 : 24);
      this.everyone(crowd => crowd.cheer(1.6));
      if (event.place === 1) this.joy = 1;
    } else if (event.t === 'roundWinner') {
      this.over = true;
      this.joy = 1;
      this.everyone(crowd => crowd.cheer(4));
    }
  }

  private everyone(act: (crowd: Crowd) => void): void {
    act(this.fans);
    this.riders.forEach(act);
  }

  /** The cat is what a player has to watch, so it is kept in the picture, and so is a stretch of lane ahead of each pet. */
  focus(round: AnyRound, points: { x: number; z: number }[]): void {
    points.push({ x: CAT.x, z: CAT.z - 2.5 });
    for (const pet of round.pets) points.push({ x: Math.min(pet.x + 5, COLUMNS / 2), z: pet.z });
  }

  frame(round: AnyRound | null, dt: number, time: number): void {
    const field = round?.gameMode === 'frita' ? round : null;
    const rules = field?.rules;
    // One, two, three over the cat's head: the song is a different length each time, and this is how to hear its end coming.
    if (rules && field.playing && rules.phase === 'sing') {
      const sung = 1 - rules.left / rules.total;
      while (this.counted < COUNTS.length && sung >= COUNTS[this.counted]!) {
        this.counted++;
        this.kit.words.pop(String(this.counted), SHOUT.x, SHOUT.y, SHOUT.z, { size: 1.3 + this.counted * 0.3, color: colors.gold, seconds: 0.3 });
      }
    }

    // Round to face the lane fast, and back to the song at its ease.
    const goal = this.watching ? FRONT : BACK;
    const step = (Math.PI / (this.watching ? TURN : 0.4)) * dt;
    this.turn += Math.max(-step, Math.min(step, goal - this.turn));
    this.hop = Math.max(0, this.hop - dt / 0.3);
    this.catTurn.rotation.y = this.turn;
    this.catTurn.position.y = CAT.y + Math.sin(this.hop * Math.PI) * 0.4;
    // Singing, it sways; looking, it leans in over the lane.
    this.catTurn.rotation.z = this.watching ? 0 : Math.sin(time * 5) * 0.06;
    this.catTurn.rotation.x = this.watching ? 0.12 * Math.sin((1 - this.hop) * Math.PI * 0.5) : 0;
    this.cat.mixer.update(dt);

    this.lights.color.lerp(this.watching ? DANGER : GO, 1 - Math.exp(-30 * dt));

    // The park plays too. While the cat looks, everything in it holds still, wherever it had got to; it is the
    // rule shown a second time, by the swings. Those watching follow whoever is nearest the line.
    const still = this.watching && !this.over;
    this.pace += ((still ? 0 : 1 + this.joy * PARK.joy) - this.pace) * (1 - Math.exp(-(still ? PARK.stop : PARK.start) * dt));
    if (still && this.pace < 0.02) this.pace = 0;
    this.joy = Math.max(0, this.joy - dt / PARK.joySeconds);
    if (field && field.playing && field.pets.length > 0) {
      const ahead = field.pets.reduce((best, pet) => (pet.x > best.x ? pet : best));
      this.leader.x = ahead.x;
      this.leader.z = ahead.z;
      this.fans.watch(this.leader);
    }
    const life = dt * this.pace;
    this.model.update(life);
    this.everyone(crowd => crowd.update(life));
    this.tiles.update(dt, time);
  }

  dispose(): void {
    this.cat.dispose();
    this.lights.dispose();
    this.tiles.dispose();
    this.paint.geometry.dispose();
    (this.paint.material as MeshBasicMaterial).dispose();
    this.paint.dispose();
    this.strip.dispose();
    this.everyone(crowd => crowd.dispose());
    this.model.dispose();
    this.group.removeFromParent();
  }

  /** The lines of the lane and its chequered finish: one flat slab, stretched and coloured for each mark. */
  private painted(): InstancedMesh {
    const marks: { x: number; z: number; width: number; depth: number; color: string }[] = [];
    // The start, and two lines along the lane.
    marks.push({ x: START_X, z: 0, width: 0.3, depth: ROWS, color: palette.line });
    for (const z of [-ROWS / 6, ROWS / 6]) marks.push({ x: (START_X + FINISH_X) / 2, z, width: FINISH_X - START_X, depth: 0.1, color: palette.line });
    // The finish: two rows of squares, dark and white.
    const squares = Math.round(ROWS / 0.5);
    for (let column = 0; column < 2; column++) {
      for (let row = 0; row < squares; row++) {
        marks.push({ x: FINISH_X + 0.25 + column * 0.5, z: -ROWS / 2 + 0.25 + row * 0.5, width: 0.5, depth: 0.5, color: (column + row) % 2 === 0 ? colors.ink : palette.line });
      }
    }
    const paint = new InstancedMesh(new BoxGeometry(1, 0.04, 1), new MeshBasicMaterial(), marks.length);
    const matrix = new Matrix4();
    const upright = new Quaternion();
    const color = new Color();
    marks.forEach((mark, index) => {
      paint.setMatrixAt(index, matrix.compose(new Vector3(mark.x, 0.005, mark.z), upright, new Vector3(mark.width, 1, mark.depth)));
      paint.setColorAt(index, color.set(mark.color));
    });
    paint.frustumCulled = false;
    return paint;
  }

  /** The lights: one long strip down each side of the lane, lying on the kerb. */
  private build(): void {
    for (const z of [-ROWS / 2 - 0.22, ROWS / 2 + 0.22]) {
      const light = new Mesh(this.strip, this.lights);
      light.position.set(0, 0.02, z);
      this.group.add(light);
    }
  }
}
