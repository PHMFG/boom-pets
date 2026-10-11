// Batatinha Frita 1, 2, 3: a lane across a playground, with a giant cat sitting behind it. While the cat
// sings it has its back to the lane and the edges of the lane are green; it counts one, two, three, turns
// round, and the edges go red. Whoever is caught moving goes back to the start in a puff.
// The park round the lane (the cat's sandbox, the bushes and trees, the playground that keeps moving, the arch
// at the start and the flags at the finish) is modelled in Blender (tools/blender/maps/frita.py).
import type { AnyRound, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial } from 'three';
import { strings } from '../../../shared/strings.pt-BR';
import { colors, maps } from '../../../shared/tokens';
import { createPet, INK_LINE, OUTLINE, type PetInstance } from '../../render/assets';
import { Model } from '../../render/models';
import { DANGER, WHITE, type MapView, type SkyId, type StageKit } from '../kit';
import { TileField } from '../TileField';
import { disposeToys } from './toys';

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
  private readonly model = new Model('frita');
  /** What is painted on the lane: its lines and the chequered finish. */
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
    this.group.add(this.tiles.mesh, this.model.scene, this.scenery, this.catTurn);
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
    this.model.update(dt);
    this.tiles.update(dt, time);
  }

  dispose(): void {
    this.cat.dispose();
    this.lights.dispose();
    this.tiles.dispose();
    disposeToys(this.scenery);
    this.model.dispose();
    this.group.removeFromParent();
  }

  /** The lines of the lane, its chequered finish and the two strips of light. */
  private build(): void {
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

    // The lights: one long strip down each side of the lane, lying on the kerb.
    for (const z of [-ROWS / 2 - 0.22, ROWS / 2 + 0.22]) {
      const light = new Mesh(new BoxGeometry(COLUMNS, 0.16, 0.36), this.lights);
      light.position.set(0, 0.02, z);
      this.group.add(light);
    }
  }
}
