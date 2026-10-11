// Batatinha Frita 1, 2, 3: a lane across a playground, with a giant cat sitting behind it. While the cat
// sings it has its back to the lane and the edges of the lane are green; it counts one, two, three, turns
// round, and the edges go red. Whoever is caught moving goes back to the start in a puff.
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps } from '../../../shared/tokens';
import { createPet, INK_LINE, OUTLINE, type PetInstance } from '../../render/assets';
import { DANGER, WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { disposeToys, toy } from './toys';

const COLUMNS = tuning.frita.columns;
const ROWS = tuning.frita.rows;
const START_X = -COLUMNS / 2 + 1.9;
const FINISH_X = COLUMNS / 2 - tuning.frita.finish;
const palette = maps.frita;
const GO = new Color(colors.go);
/** The cat: how big, and where it sits. Behind the middle of the lane, so it is on screen wherever the pets are. */
const CAT = { scale: 2.5, x: 0, z: -ROWS / 2 - 3.4 };
/** Where the count and the cat's shout appear: at its feet, over the far edge of the lane, so its face stays clear. */
const SHOUT = { x: CAT.x, y: 1.5, z: -ROWS / 2 - 0.9 };
/** Facing away from the lane, and facing it. It turns by way of the finish line. */
const BACK = Math.PI;
const FRONT = 0;
/** Seconds for the cat to come round. Shorter than the grace the rules give before anyone is judged. */
const TURN = 0.22;
/** How far through the song each of "1, 2, 3" is counted. */
const COUNTS = [0.4, 0.6, 0.8];

export class FritaMap implements MapView {
  readonly group = new Group();
  readonly sky: SkyId = 'day';
  readonly light = { hemisphere: 1.15, sun: 1.5 };
  readonly bounds = { minX: -COLUMNS / 2, maxX: COLUMNS / 2, minZ: -ROWS / 2, maxZ: ROWS / 2 };

  private readonly kit: StageKit;
  private readonly tiles = new TileField(COLUMNS, ROWS, [palette.grass, palette.grassDark]);
  private readonly scenery = new Group();
  private readonly cat: PetInstance;
  private readonly catTurn = new Group();
  /** The strips along both edges of the lane: green to run, red to freeze. */
  private readonly lights = new MeshBasicMaterial({ color: colors.go });
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
    this.catTurn.position.set(CAT.x, -0.3, CAT.z);
    this.catTurn.rotation.y = this.turn;
    this.group.add(this.tiles.mesh, this.scenery, this.catTurn);
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
      // Seen moving: a red puff where it stood. The puff where it lands is the stage's.
      words.pop(strings.words3d.moved, event.x, 2.6, event.z - 0.4, { size: 0.8, color: colors.danger, seconds: 0.8 });
      particles.puff({ x: event.x, y: 0.8, z: event.z, life: 0.35, size: 0.6, sizeEnd: 1.3, color: DANGER });
      stars(event.x, 1, event.z, 6);
      rig.shake(0.15);
    } else if (event.t === 'finish') {
      const { confetti } = this.kit;
      confetti(FINISH_X + 1, 0.5, 0, [new Color(colors.gold), WHITE, GO], event.place === 1 ? 60 : 24);
    }
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
    this.catTurn.position.y = -0.3 + Math.sin(this.hop * Math.PI) * 0.4;
    // Singing, it sways; looking, it leans in over the lane.
    this.catTurn.rotation.z = this.watching ? 0 : Math.sin(time * 5) * 0.06;
    this.catTurn.rotation.x = this.watching ? 0.12 * Math.sin((1 - this.hop) * Math.PI * 0.5) : 0;
    this.cat.mixer.update(dt);

    this.lights.color.lerp(this.watching ? DANGER : GO, 1 - Math.exp(-30 * dt));
    this.tiles.update(dt, time);
  }

  dispose(): void {
    this.cat.dispose();
    this.lights.dispose();
    this.tiles.dispose();
    disposeToys(this.scenery);
    this.group.removeFromParent();
  }

  /** The lawn, the lines of the lane, the hedges and what is left of a playground. */
  private build(): void {
    const lawn = toy(new BoxGeometry(COLUMNS + 40, 1, ROWS + 40), palette.lawn, 1);
    lawn.position.y = -1.06;
    lawn.castShadow = false;
    lawn.receiveShadow = true;
    this.scenery.add(lawn);

    const strip = (x: number, z: number, width: number, depth: number, color: string) => {
      const mesh = new Mesh(new BoxGeometry(width, 0.04, depth), new MeshBasicMaterial({ color }));
      mesh.position.set(x, 0.005, z);
      this.scenery.add(mesh);
    };
    // The start, and two lines along the lane.
    strip(START_X, 0, 0.3, ROWS, palette.line);
    for (const z of [-ROWS / 6, ROWS / 6]) strip((START_X + FINISH_X) / 2, z, FINISH_X - START_X, 0.1, palette.line);
    // The finish: two rows of squares, dark and white.
    const squares = Math.round(ROWS / 0.5);
    for (let column = 0; column < 2; column++) {
      for (let row = 0; row < squares; row++) strip(FINISH_X + 0.25 + column * 0.5, -ROWS / 2 + 0.25 + row * 0.5, 0.5, 0.5, (column + row) % 2 === 0 ? colors.ink : palette.line);
    }
    for (const z of [-ROWS / 2 - 0.5, ROWS / 2 + 0.5]) {
      const post = toy(new CylinderGeometry(0.1, 0.1, 2.6, 6), palette.metal, 1.2);
      post.position.set(FINISH_X + 0.5, 1, z);
      const flag = toy(new BoxGeometry(1, 0.7, 0.08), colors.ink, 1.05);
      flag.position.set(FINISH_X + 1.05, 1.95, z);
      this.scenery.add(post, flag);
    }

    // The lights: one long strip down each side of the lane.
    for (const z of [-ROWS / 2 - 0.22, ROWS / 2 + 0.22]) {
      const light = new Mesh(new BoxGeometry(COLUMNS, 0.16, 0.36), this.lights);
      light.position.set(0, 0.02, z);
      this.group.add(light);
    }

    // Hedges: tall behind, low in front, so the near one hides nobody. The far one leaves room for the cat.
    const hedge = (x: number, z: number, width: number, height: number) => {
      const box = toy(new BoxGeometry(width, height, 1.4), (Math.round(x) & 1) === 0 ? palette.hedge : palette.hedgeDark, 1.03);
      box.position.set(x, height / 2 - 0.5, z);
      this.scenery.add(box);
    };
    for (let x = -COLUMNS / 2 + 2; x <= COLUMNS / 2 - 2; x += 4) {
      hedge(x, ROWS / 2 + 1.6, 3.7, 0.9);
      if (Math.abs(x - CAT.x) > 4) hedge(x, -ROWS / 2 - 1.8, 3.7, 1.9);
    }

    // A sandpit for the cat to sit in.
    const sand = toy(new CylinderGeometry(3.6, 3.8, 0.3, 24), palette.sand, 1.02);
    sand.position.set(CAT.x, -0.45, CAT.z);
    sand.receiveShadow = true;
    sand.castShadow = false;
    this.scenery.add(sand);

    // A slide beyond the finish.
    const slide = new Group();
    const ramp = toy(new BoxGeometry(1.6, 0.2, 6), palette.slide, 1.04);
    ramp.rotation.x = 0.5;
    ramp.position.set(0, 1.5, 0);
    const deck = toy(new BoxGeometry(1.8, 0.2, 1.6), palette.wood, 1.04);
    deck.position.set(0, 2.95, -3.3);
    slide.add(ramp, deck);
    for (const [x, z] of [[-0.8, -2.6], [0.8, -2.6], [-0.8, -4], [0.8, -4]] as const) {
      const leg = toy(new CylinderGeometry(0.1, 0.1, 3.4, 6), palette.metal, 1.2);
      leg.position.set(x, 1.2, z);
      slide.add(leg);
    }
    slide.position.set(COLUMNS / 2 - 3, -0.5, -ROWS / 2 - 7);
    slide.rotation.y = -0.5;
    this.scenery.add(slide);

    // A swing behind the start.
    const swing = new Group();
    const bar = toy(new CylinderGeometry(0.12, 0.12, 4.4, 6), palette.metal, 1.2);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 3.6;
    swing.add(bar);
    for (const x of [-2.1, 2.1]) {
      for (const lean of [-0.3, 0.3]) {
        const leg = toy(new CylinderGeometry(0.1, 0.1, 4.3, 6), palette.metal, 1.2);
        leg.position.set(x, 1.6, lean * 2);
        leg.rotation.x = lean;
        swing.add(leg);
      }
    }
    for (const x of [-0.9, 0.9]) {
      const rope = toy(new CylinderGeometry(0.04, 0.04, 2.6, 5), colors.ink, 1);
      rope.position.set(x * 0.6, 2.3, 0);
      swing.add(rope);
    }
    const seat = toy(new BoxGeometry(1.3, 0.14, 0.5), palette.wood, 1.06);
    seat.position.y = 1;
    swing.add(seat);
    swing.position.set(-COLUMNS / 2 + 4, -0.5, -ROWS / 2 - 7);
    swing.rotation.y = 0.35;
    this.scenery.add(swing);

    // A ball someone left behind.
    const ball = toy(new SphereGeometry(0.9, 14, 10), palette.slide, 1.05);
    ball.position.set(-COLUMNS / 2 - 3, 0.3, 3);
    this.scenery.add(ball);
  }
}
