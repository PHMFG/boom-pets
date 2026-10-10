// Draws the game. It reads the simulation every frame and turns its events into motion, particles,
// camera moves and pop-up words. It never changes the simulation.
import type { Game, GameEvent, Pet } from '@boom/game';
import { POWERS, tuning } from '@boom/game';
import type { SeatInfo } from '@boom/protocol';
import {
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderTarget,
  type Texture,
} from 'three';
import type { PetId } from '../../shared/pets';
import { POWER_ICON, TIER_COLOR } from '../../shared/powers';
import { strings } from '../../shared/strings.pt-BR';
import { colors } from '../../shared/tokens';
import { Decals } from '../fx/Decals';
import { Particles } from '../fx/Particles';
import type { Nameplates } from '../hud/Nameplates';
import { PetView, type PetContext } from '../pets/PetView';
import { createPet, isPetId, petPalette } from '../render/assets';
import { CameraRig } from '../render/CameraRig';
import { toonMaterial } from '../render/materials';
import { Renderer } from '../render/Renderer';
import { Word3D } from '../render/Text3D';
import { BarrelView, CubeView, GachaMachine, GhostView, MeteorView, Podium, seatColor, SlotReels, Words } from './Props';
import { TileField } from './TileField';

const HALF = tuning.arena.size / 2;
const CORNERS = [{ x: -HALF, z: -HALF }, { x: HALF, z: -HALF }, { x: -HALF, z: HALF }, { x: HALF, z: HALF }];
const WHITE = new Color(colors.white);
const HOT = new Color(colors.gold).multiplyScalar(2.6);
const FLASH = new Color(colors.white).multiplyScalar(3);
const SMOKE = [new Color(colors.cream), new Color(colors.smoke), new Color(colors.danger), new Color(colors.gold)];
const INK = new Color(colors.ink);
const DANGER = new Color(colors.danger);
const DUST = new Color(colors.creamDark);
/** Light levels. Kept low enough that the cream floor does not burn out to white. */
const DAY = { hemisphere: 1.15, sun: 1.55 };
const NIGHT = { hemisphere: 0.95, sun: 1.3 };
const random = (low: number, high: number) => low + Math.random() * (high - low);

export class GameStage {
  /** Called twice a second with the measured frame rate. */
  onStats: ((fps: number) => void) | null = null;

  private readonly container: HTMLElement;
  private readonly nameplates: Nameplates;
  private readonly scene = new Scene();
  private readonly rig = new CameraRig();
  private readonly renderer: Renderer;
  private readonly resize: ResizeObserver;
  private readonly tiles = new TileField();
  private readonly particles = new Particles();
  private readonly decals = new Decals();
  private readonly words = new Words();
  private readonly machine = new GachaMachine();
  private readonly hemisphere = new HemisphereLight(0xffffff, colors.creamDark, DAY.hemisphere);
  private readonly sun = new DirectionalLight(0xffffff, DAY.sun);
  private readonly pets = new Map<number, PetView>();
  private readonly barrels = new Map<number, BarrelView>();
  private readonly meteors = new Map<number, MeteorView>();
  private readonly ghosts = new Map<number, GhostView>();
  private readonly reels = new Map<number, SlotReels>();
  private readonly portraits = new Map<PetId, string>();
  private readonly point = new Vector3();
  private cube: CubeView | null = null;
  private cubeLanded = false;
  private title = false;
  private roomWord: Word3D | null = null;
  private podium: Podium | null = null;
  private game: Game | null = null;
  private winners = new Set<number>();
  private asleep = new Set<number>();
  private skies: { day: Texture | null; night: Texture | null } = { day: null, night: null };
  private insets = { left: 0, bottom: 0 };
  private size = { width: 1, height: 1 };
  private time = 0;
  private lastWord = -10;
  private fireworkIn = 0;
  private frames = 0;
  private statsAt = 0;

  constructor(container: HTMLElement, nameplates: Nameplates) {
    this.container = container;
    this.nameplates = nameplates;
    this.renderer = new Renderer(container, this.scene, this.rig.camera);

    // Nearly overhead, so a shadow sits under its owner and shows how high it is.
    this.sun.position.set(3, 24, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
    this.scene.add(this.hemisphere, this.sun, this.tiles.mesh, this.particles.group, this.decals.mesh, this.words.group, this.machine.group, this.clouds());
    this.machine.onLand = () => {
      const { x, z } = this.machine.group.position;
      this.dust(x, z, 14);
      this.decals.shock(x, z, 2.4, WHITE);
      this.rig.shake(0.5);
    };

    const loader = new TextureLoader();
    for (const name of ['day', 'night'] as const) {
      loader.load(`/skyboxes/skybox-${name}.png`, sky => {
        sky.mapping = EquirectangularReflectionMapping;
        sky.colorSpace = SRGBColorSpace;
        this.skies[name] = sky;
        if (name === 'day' && !this.scene.background) this.scene.background = sky;
      });
    }

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  setGame(game: Game): void {
    this.game = game;
  }

  /** Shows the room code as big letters standing at the back of the platform while in the lobby. */
  setRoom(code: string | null): void {
    this.roomWord?.group.removeFromParent();
    this.roomWord = null;
    if (!code) return;
    this.roomWord = new Word3D(code, { size: 2.6, color: colors.gold });
    this.roomWord.group.position.set(0, 0, -HALF + 1.1);
    // Leaned back toward the camera so the letters read from the tilted view.
    this.roomWord.group.rotation.x = -0.5;
    this.roomWord.slam();
    this.scene.add(this.roomWord.group);
  }

  /** Pixels covered by HUD on the left and bottom. The action is framed in what remains. */
  setInsets(left: number, bottom: number): void {
    this.insets = { left, bottom };
    this.fit();
  }

  /** The title screen: the camera circles the platform slowly while the bots brawl. */
  setTitle(on: boolean): void {
    // Leaving the title, the room code slams in with the rest of the lobby.
    if (this.title && !on) this.roomWord?.slam();
    this.title = on;
    if (!on) this.rig.release();
  }

  /** A happy little jump with a speech bubble, for a player who just said they are ready. */
  cheer(seat: number, emoji: string): void {
    const pet = this.game?.round.petOfSeat(seat);
    const view = pet ? this.pets.get(pet.id) : undefined;
    view?.bounce(1.2);
    view?.emote(emoji, 1.2);
  }

  /** "Menos tremor e brilho": much less shake, no colour fringe. */
  setReduced(reduced: boolean): void {
    this.rig.shakeScale = reduced ? 0.3 : 1;
    this.renderer.fullEffects = !reduced;
  }

  /** Seats whose phone dropped: their pets sleep where they stand. */
  setAsleep(seats: Iterable<number>): void {
    this.asleep = new Set(seats);
    for (const view of this.pets.values()) {
      if (this.asleep.has(view.seat)) view.emote('💤', 0, true);
      else view.clearEmote();
    }
  }

  setNames(seats: SeatInfo[], rosterAt: number): void {
    this.nameplates.sync(seats, rosterAt);
  }

  /** A player's emote: a speech bubble over their pet, or over their ghost. */
  emote(seat: number, emoji: string): void {
    const game = this.game;
    const pet = game?.round.petOfSeat(seat);
    if (pet) this.pets.get(pet.id)?.emote(emoji, 1.6);
  }

  /** A small picture of a pet for the HUD, rendered once and kept. */
  portrait(model: PetId): string {
    const known = this.portraits.get(model);
    if (known) return known;
    const size = 128;
    const target = new WebGLRenderTarget(size, size);
    target.texture.colorSpace = SRGBColorSpace;
    const scene = new Scene();
    const pet = createPet(model, colors.ink);
    pet.model.rotation.y = 0.5;
    scene.add(pet.model, new HemisphereLight(0xffffff, colors.creamDark, 1.6), this.sun.clone());
    const camera = new OrthographicCamera(-1.25, 1.25, 2.2, -0.3, 0.1, 20);
    camera.position.set(0, 1.4, 6);
    camera.lookAt(0, 0.9, 0);
    const three = this.renderer.three;
    three.setRenderTarget(target);
    three.setClearColor(0x000000, 0);
    three.clear();
    three.render(scene, camera);
    const pixels = new Uint8Array(size * size * 4);
    three.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    three.setRenderTarget(null);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(size, size);
    // WebGL rows run bottom to top; canvas rows run top to bottom.
    for (let row = 0; row < size; row++) image.data.set(pixels.subarray((size - 1 - row) * size * 4, (size - row) * size * 4), row * size * 4);
    context.putImageData(image, 0, 0);
    const url = canvas.toDataURL('image/png');
    pet.dispose();
    target.dispose();
    this.portraits.set(model, url);
    return url;
  }

  dispose(): void {
    this.resize.disconnect();
    [...this.pets.values(), ...this.barrels.values(), ...this.meteors.values(), ...this.ghosts.values(), ...this.reels.values()].forEach(view => view.dispose());
    this.cube?.dispose();
    this.podium?.dispose();
    this.tiles.dispose();
    this.particles.dispose();
    this.decals.dispose();
    this.renderer.dispose();
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /** Shows one thing the simulation says just happened. */
  handle(event: GameEvent): void {
    const game = this.game;
    if (!game) return;
    switch (event.t) {
      case 'phase':
        return this.onPhase(event.phase, game);
      case 'countdown':
        this.words.pop(event.n === 0 ? strings.words3d.go : String(event.n), 0, 3.2, 0, { size: event.n === 0 ? 3.4 : 2.8, color: event.n === 0 ? colors.gold : colors.cream, seconds: 0.55 });
        if (event.n === 0) this.rig.punchIn(0.5);
        return;
      case 'roundWinner':
        this.winners = new Set(event.seats);
        return;
      case 'dash': {
        this.dust(event.x, event.z, 5 + Math.round(event.charge * 6));
        this.decals.shock(event.x, event.z, 0.9 + event.charge * 0.9, new Color(seatColor(this.pets.get(event.pet)?.seat ?? 0)), 0.3);
        return;
      }
      case 'dashHit': {
        if (event.radius === 0) {
          // A shove: a puff and a nudge. It must not look like a hit, or tapping would look worth it.
          this.dust(event.x, event.z, 3);
          for (const id of event.victims) this.pets.get(id)?.hit(0.15);
          return;
        }
        const power = 0.3 + event.charge * 0.7;
        this.decals.shock(event.x, event.z, event.radius, WHITE, 0.35);
        this.stars(event.x, event.y + 0.3, event.z, 6 + Math.round(event.charge * 10));
        this.rig.shake(0.12 + event.charge * 0.4);
        if (event.charge > 0.7) this.renderer.kick(0.35);
        this.pets.get(event.pet)?.hitStop(0.08);
        for (const id of event.victims) {
          const victim = this.pets.get(id);
          victim?.hit(power);
          victim?.hitStop(0.08);
          if (event.charge > 0.5) victim?.emote('😵', 0.9);
        }
        return;
      }
      case 'explosion':
        return this.boom(event.x, event.y, event.z, event.radius, event.cause === 'barrel' || event.cause === 'overcharge', event.chain);
      case 'barrelArmed': {
        const barrel = game.round.barrels.find(candidate => candidate.id === event.barrel);
        if (barrel) this.decals.warning(barrel.x, barrel.z, tuning.barrel.blastRadius, Math.max(event.delay, 0.12), DANGER);
        return;
      }
      case 'dashEnd':
        // A dash that hit nothing leaves the pet winded for a moment.
        if (!event.hit) this.pets.get(event.pet)?.emote('😓', 0.7);
        return;
      case 'tired':
        this.pets.get(event.pet)?.bounce(0.35);
        return;
      case 'reach':
        this.pets.get(event.pet)?.emote('✋', 0.5);
        return;
      case 'grabMiss': {
        const view = this.pets.get(event.pet);
        view?.emote('✋', 0.3);
        view?.bounce(0.5);
        return;
      }
      case 'grab': {
        const view = this.pets.get(event.pet);
        view?.bounce(0.8);
        if (event.kind !== 'pet' || !view) return;
        // Catching a rival is a moment: both freeze for a beat and the word says it.
        const caught = this.pets.get(event.target);
        caught?.emote('😨', 1);
        caught?.hitStop(0.1);
        view.hitStop(0.1);
        this.rig.shake(0.18);
        this.stars(view.feet.x, view.feet.y + 1.4, view.feet.z, 8);
        this.words.pop(strings.words3d.grabbed, view.feet.x, 3, view.feet.z - 0.6, { size: 0.7, color: seatColor(view.seat), seconds: 0.8 });
        return;
      }
      case 'throw': {
        const view = this.pets.get(event.pet);
        if (!view) return;
        this.dust(view.feet.x, view.feet.z, event.kind === 'pet' ? 8 : 4);
        if (event.kind !== 'pet') return;
        view.bounce(1);
        this.rig.shake(0.15);
        this.words.pop(strings.words3d.thrown, view.feet.x, 3, view.feet.z - 0.6, { size: 0.7, color: seatColor(view.seat), seconds: 0.7 });
        return;
      }
      case 'throwHit': {
        this.decals.shock(event.x, event.z, 1.8, WHITE, 0.35);
        this.stars(event.x, 0.9, event.z, 12);
        this.rig.shake(0.3);
        for (const id of [event.pet, event.victim]) {
          const view = this.pets.get(id);
          view?.hit(0.7);
          view?.hitStop(0.08);
        }
        this.pets.get(event.victim)?.emote('😵', 0.9);
        return;
      }
      case 'escape': {
        const view = this.pets.get(event.pet);
        view?.emote('💨', 0.9);
        if (view) this.poof(view.feet.x, view.feet.y + 0.5, view.feet.z);
        return;
      }
      case 'land': {
        const view = this.pets.get(event.pet);
        if (view) this.dust(view.feet.x, view.feet.z, Math.min(10, 2 + Math.round(event.speed / 3)));
        if (event.speed > 12) this.rig.shake(0.1);
        return;
      }
      case 'fall':
        this.pets.get(event.pet)?.emote('😱', 1.5);
        return;
      case 'eliminated':
        return this.onEliminated(event);
      case 'tileWarn':
        return this.tiles.warn(event.index);
      case 'tileFall': {
        this.tiles.drop(event.index, event.broken);
        const { x, z } = this.tiles.centre(event.index);
        for (let index = 0; index < (event.broken ? 4 : 2); index++) {
          this.particles.cube({ x: x + random(-0.4, 0.4), y: 0.1, z: z + random(-0.4, 0.4), vx: random(-2, 2), vy: random(1, 5), vz: random(-2, 2), life: random(0.5, 1), size: random(0.1, 0.22), gravity: 22, spin: random(-8, 8), color: DUST });
        }
        return;
      }
      case 'cubeSpawn':
        this.decals.warning(event.x, event.z, 0.9, tuning.cube.dropTime, new Color(colors.gold));
        return;
      case 'cubeCollected':
        this.confetti(event.x, 0.8, event.z, [new Color(colors.gold), WHITE], 18);
        this.decals.shock(event.x, event.z, 1.6, new Color(colors.gold));
        return;
      case 'roll': {
        const view = this.pets.get(event.pet);
        if (!view) return;
        if (event.instant) return view.emote(POWER_ICON[event.power], 1.4);
        this.reels.get(event.pet)?.dispose();
        const reels = new SlotReels(event.tier, event.power);
        reels.onStop = index => {
          if (index === 2) this.decals.shock(view.feet.x, view.feet.z, 1.8, new Color(TIER_COLOR[event.tier]));
        };
        this.scene.add(reels.group);
        this.reels.set(event.pet, reels);
        return;
      }
      case 'powerReady': {
        const view = this.pets.get(event.pet);
        if (!view) return;
        // The power is in the pet's pocket now: a ring in its tier colour, and the name tag grows its badge.
        view.bounce(0.9);
        this.decals.shock(view.feet.x, view.feet.z, 1.5, new Color(TIER_COLOR[POWERS[event.power].tier]), 0.4);
        return;
      }
      case 'powerStart': {
        const view = this.pets.get(event.pet);
        if (!view) return;
        view.bounce(1.2);
        view.emote(POWER_ICON[event.power], 1.6);
        this.confetti(view.feet.x, view.feet.y + 1, view.feet.z, [new Color(TIER_COLOR[POWERS[event.power].tier]), WHITE], 10);
        return;
      }
      case 'powerEnd': {
        const view = this.pets.get(event.pet);
        if (view) this.poof(view.feet.x, view.feet.y + 0.6, view.feet.z);
        return;
      }
      case 'honk': {
        const view = this.pets.get(event.pet);
        if (!view) return;
        view.bounce(0.9);
        view.emote('📯', 0.4);
        this.decals.shock(view.feet.x, view.feet.z, 1.3, new Color(colors.tierCursed), 0.3);
        return;
      }
      case 'gachaStart': {
        const view = this.pets.get(event.pet);
        this.renderer.setSaturation(-0.75);
        if (view) {
          this.rig.focus(view.feet.x + 0.8, view.feet.z, 15, tuning.gacha.duration);
          this.words.pop(strings.words3d.superPull, view.feet.x + 0.8, 3.6, view.feet.z - 2.6, { size: 0.85, color: colors.gold, seconds: 1.3 });
        }
        this.rig.shake(0.4);
        return;
      }
      case 'gachaLever':
        this.rig.shake(0.25);
        return;
      case 'gachaJinx': {
        // Each ZICA tap throws a little curse from that player into the machine.
        const from = [...this.pets.values()].find(view => view.seat === event.seat)?.feet ?? this.ghosts.get(event.seat)?.group.position;
        const to = this.machine.capsulePosition;
        if (from) this.particles.spark({ x: from.x, y: from.y + 1.4, z: from.z, vx: (to.x - from.x) * 3, vy: 5, vz: (to.z - from.z) * 3, life: 0.33, size: 0.28, gravity: 20, spin: 12, color: new Color(colors.tierCursedAccent).multiplyScalar(2) });
        return;
      }
      case 'gachaReveal': {
        const at = this.machine.capsulePosition;
        this.renderer.setSaturation(0);
        this.renderer.kick(0.7);
        this.rig.shake(0.6);
        this.decals.shock(at.x, at.z, 4, new Color(event.cursed ? colors.tierCursedAccent : colors.gold));
        this.confetti(at.x, at.y, at.z, event.cursed ? [new Color(colors.tierCursed), new Color(colors.tierCursedAccent)] : [new Color(colors.gold), WHITE, new Color(colors.tierRare)], 46);
        const text = event.cursed ? strings.words3d.superCurse : strings.powers[event.power].toUpperCase();
        this.words.pop(text, at.x - 0.6, 3.4, at.z - 2.4, { size: 0.8, color: event.cursed ? colors.tierCursedAccent : colors.gold, seconds: 1.3 });
        for (const view of this.pets.values()) if (view.seat !== event.seat) view.emote(event.cursed ? '😂' : '😱', 1.4);
        return;
      }
      case 'gachaEnd':
        this.renderer.setSaturation(0);
        this.rig.release();
        return;
      case 'meteorCall':
        this.decals.warning(event.x, event.z, event.radius, event.delay, DANGER);
        return;
      case 'ghost':
        this.poof(event.x, 1.5, event.z);
        return;
      case 'revengeSwap': {
        const ghost = this.ghosts.get(event.ghost);
        if (ghost) this.confetti(ghost.group.position.x, 2.5, ghost.group.position.z, [new Color(seatColor(event.ghost)), WHITE], 24);
        this.popWord(strings.words3d.swap, 0, 4.2, 0, 1.8, seatColor(event.ghost));
        this.renderer.kick(0.4);
        return;
      }
      case 'score': {
        const view = [...this.pets.values()].find(candidate => candidate.seat === event.seat);
        const x = event.x ?? view?.feet.x ?? 0;
        const z = event.z ?? view?.feet.z ?? 0;
        this.words.pop(`+${event.points}`, x, event.reason === 'place' ? 2.8 : 2, z, { size: event.reason === 'place' ? 1.5 : 1.1, color: seatColor(event.seat), seconds: 0.9, rise: 1.6 });
        return;
      }
      default:
        return;
    }
  }

  // ── Frame ──────────────────────────────────────────────────────────────────

  /** Draws one frame. `alpha` is how far between the last two physics steps this moment falls. */
  frame(dt: number, alpha: number, now: number): void {
    const game = this.game;
    if (!game) return;
    this.time += dt;
    // Things that live in the world slow down with it; the camera and the words do not.
    const worldDt = dt * game.dilation;
    const round = game.round;
    const context: PetContext = {
      dt: worldDt,
      time: this.time,
      alpha,
      isFloor: (x, z) => round.isFloor(x, z),
      winner: false,
      asleep: false,
      dust: (x, z, count) => this.dust(x, z, count),
      steam: (x, y, z) => this.particles.puff({ x: x + random(-0.3, 0.3), y, z: z + random(-0.3, 0.3), vy: random(1.5, 3), life: 0.45, size: 0.16, sizeEnd: 0.34, color: WHITE }),
      poof: (x, y, z) => this.poof(x, y, z),
    };

    // Once the match is over the platform is cleared for the podium.
    const staged = game.phase !== 'matchEnd';
    const alive = new Set<number>();
    for (const pet of staged ? round.pets : []) {
      alive.add(pet.id);
      let view = this.pets.get(pet.id);
      if (!view) {
        view = new PetView(pet, seatColor(pet.seat));
        this.pets.set(pet.id, view);
        this.scene.add(view.root);
        if (this.asleep.has(pet.seat)) view.emote('💤', 0, true);
        // A player who has just joined the lobby waves hello.
        else if (game.phase === 'lobby' && !this.title && !pet.decoy) view.emote('👋', 1.3);
      }
      context.winner = game.phase === 'roundEnd' && this.winners.has(pet.seat);
      context.asleep = this.asleep.has(pet.seat) && !pet.decoy;
      view.update(pet, context);
      this.petExtras(pet, view, worldDt, context.winner);
    }
    // A pet that left without being knocked out (a seat freed, a round swapped) goes in a puff of smoke.
    for (const [id, view] of this.pets) {
      if (alive.has(id)) continue;
      this.poof(view.feet.x, view.feet.y + 0.6, view.feet.z);
      this.removePet(id);
    }

    this.sync(this.barrels, staged ? round.barrels : [], () => new BarrelView(), (view, barrel) => {
      view.update(barrel, alpha, worldDt, this.time);
      const { x, y, z } = view.group.position;
      // A lit fuse spits sparks; a thrown barrel leaves a trail of smoke.
      if (barrel.fuse !== null) this.particles.spark({ x: x + random(-0.2, 0.2), y: y + 0.6, z: z + random(-0.2, 0.2), vx: random(-2, 2), vy: random(2, 5), vz: random(-2, 2), life: 0.25, size: 0.1, gravity: 12, color: HOT });
      if (barrel.thrown && Math.random() < 0.5) this.particles.puff({ x, y, z, life: 0.35, size: 0.3, sizeEnd: 0.1, color: SMOKE[0]! });
    });
    this.sync(this.meteors, round.meteors, () => new MeteorView(), (view, meteor) => {
      view.update(meteor, this.time);
      const { x, y, z } = view.group.position;
      this.particles.spark({ x, y, z, vx: random(-1, 1), vy: random(0, 2), vz: random(-1, 1), life: 0.3, size: 0.3, color: HOT });
    });
    this.sync(
      this.ghosts,
      (staged ? round.ghosts : []).map(ghost => ({ ...ghost, id: ghost.seat })),
      ghost => new GhostView(ghost.seat, this.modelOf(game, ghost.seat)),
      (view, ghost) => view.update(ghost, worldDt, this.time),
    );

    if (round.cube && !this.cube) {
      this.cube = new CubeView();
      this.scene.add(this.cube.group);
    } else if (!round.cube && this.cube) {
      this.cube.dispose();
      this.cube = null;
    }
    if (round.cube) this.cube?.update(round.cube, worldDt, this.time);
    if (round.cube?.landed && !this.cubeLanded) {
      this.dust(round.cube.x, round.cube.z, 8);
      this.decals.shock(round.cube.x, round.cube.z, 1.4, new Color(colors.gold), 0.35);
    }
    this.cubeLanded = round.cube?.landed ?? false;

    for (const [id, reels] of this.reels) {
      const view = this.pets.get(id);
      if (view) reels.group.position.set(view.feet.x, view.feet.y + view.height + 0.75, view.feet.z);
      reels.update(dt, this.rig.camera);
      if (reels.done || !view) {
        reels.dispose();
        this.reels.delete(id);
      }
    }

    const gachaPet = game.gacha ? [...this.pets.values()].find(view => view.seat === game.gacha!.seat) : undefined;
    this.machine.update(game.gacha, Math.min(HALF - 2, (gachaPet?.feet.x ?? 0) + 2), gachaPet?.feet.z ?? 0, this.time);

    this.tiles.update(worldDt, this.time);
    this.particles.update(worldDt);
    this.decals.update(worldDt);
    this.words.update(dt, this.rig.camera);
    this.podium?.update(dt);
    if (this.podium) this.fireworks(dt);
    if (this.roomWord) {
      this.roomWord.group.visible = game.phase === 'lobby' && !this.title;
      this.roomWord.update(dt);
    }

    if (this.title) {
      // Behind the title the camera circles the brawl itself, wherever on the platform it wanders.
      let x = 0;
      let z = 0;
      for (const view of this.pets.values()) {
        x += view.feet.x / this.pets.size;
        z += view.feet.z / this.pets.size;
      }
      this.rig.focus(x * 0.8, z * 0.8, 21, Infinity, 0.16);
    }
    this.rig.frame(this.focusPoints(game), dt);
    this.placeNames(game);
    this.nameplates.tick(now);
    this.renderer.render(dt);

    this.frames++;
    if (now - this.statsAt >= 500) {
      this.onStats?.(Math.round((this.frames * 1000) / (now - this.statsAt)));
      this.frames = 0;
      this.statsAt = now;
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Keeps a map of views in step with a list of simulation objects: new ones appear, missing ones are removed. */
  private sync<Item extends { id: number }, View extends { group: Group; dispose(): void }>(
    views: Map<number, View>, items: readonly Item[], create: (item: Item) => View, update: (view: View, item: Item) => void,
  ): void {
    const present = new Set<number>();
    for (const item of items) {
      present.add(item.id);
      let view = views.get(item.id);
      if (!view) {
        view = create(item);
        views.set(item.id, view);
        this.scene.add(view.group);
      }
      update(view, item);
    }
    for (const [id, view] of views) {
      if (present.has(id)) continue;
      view.dispose();
      views.delete(id);
    }
  }

  private modelOf(game: Game, seat: number): PetId {
    const model = game.seats.find(candidate => candidate.seat === seat)?.pet ?? '';
    return isPetId(model) ? model : 'fox';
  }

  private removePet(id: number): void {
    this.pets.get(id)?.dispose();
    this.pets.delete(id);
    this.reels.get(id)?.dispose();
    this.reels.delete(id);
  }

  /** Per-frame trails and auras: the dash afterimage, and each power's own particles and tint. */
  private petExtras(pet: Pet, view: PetView, dt: number, winner: boolean): void {
    const seat = new Color(seatColor(pet.seat));
    const x = view.feet.x;
    const y = view.feet.y;
    const z = view.feet.z;
    if (pet.thrown && Math.random() < 0.5) this.particles.puff({ x, y: y + 0.5, z, life: 0.35, size: 0.3, sizeEnd: 0.1, color: SMOKE[0]! });
    // The round's winner stands in a trickle of confetti in their own colour.
    if (winner && Math.random() < 8 * dt) this.confetti(x, y + 2.2, z, [seat.clone(), WHITE], 2);
    if (pet.dashTime > 0) {
      this.particles.spark({ x, y: y + 0.65 * pet.scale, z, life: 0.2, size: 0.75 * pet.scale, sizeEnd: 0.3, color: seat.multiplyScalar(1.5) });
    }
    const chance = (perSecond: number) => Math.random() < perSecond * dt;
    view.aura.setScalar(0);
    switch (pet.power) {
      case 'rocket':
        if (chance(40)) this.particles.spark({ x: x - Math.sin(pet.facing) * 0.4, y: y + 0.2, z: z - Math.cos(pet.facing) * 0.4, vx: random(-1, 1), vy: random(0, 2), vz: random(-1, 1), life: 0.3, size: 0.24, sizeEnd: 0.05, color: HOT });
        break;
      case 'megaDash':
        view.aura.set(colors.gold).multiplyScalar(0.35 + 0.25 * Math.sin(this.time * 9));
        if (chance(14)) this.particles.spark({ x: x + random(-0.6, 0.6), y: y + random(0.2, 1.4), z: z + random(-0.6, 0.6), vy: 1.5, life: 0.4, size: 0.12, color: HOT });
        break;
      case 'jelly':
        view.aura.set(colors.tierCursedAccent).multiplyScalar(0.35);
        break;
      case 'reversed':
        view.aura.set(colors.tierCursed).multiplyScalar(0.45);
        if (chance(10)) this.particles.spark({ x: x + Math.sin(this.time * 9) * 0.6, y: y + view.height, z: z + Math.cos(this.time * 9) * 0.6, life: 0.4, size: 0.14, color: new Color(colors.tierCursed).multiplyScalar(2) });
        break;
      case 'kaiju':
        view.aura.set(colors.danger).multiplyScalar(0.3 + 0.2 * Math.sin(this.time * 6));
        if (chance(24)) this.particles.spark({ x: x + random(-1.2, 1.2), y: y + 0.1, z: z + random(-1.2, 1.2), vy: random(2, 5), life: 0.5, size: 0.2, gravity: 6, color: HOT });
        break;
      case 'meteorShower':
        view.aura.set(colors.gold).multiplyScalar(0.4);
        break;
      case 'pinata':
        view.aura.setHSL((this.time * 0.9) % 1, 1, 0.5).multiplyScalar(0.5);
        if (chance(16)) this.confetti(x, y + 1.2, z, [new Color().setHSL(Math.random(), 1, 0.6)], 1);
        break;
      default:
        break;
    }
  }

  private onPhase(phase: Game['phase'], game: Game): void {
    this.podium?.dispose();
    this.podium = null;
    this.rig.release();
    this.renderer.setSaturation(0);
    if (phase === 'countdown') {
      this.winners.clear();
      this.words.clear();
      this.tiles.reset(true);
      // The final round is played at night.
      const night = game.isFinalRound;
      this.scene.background = (night ? this.skies.night : this.skies.day) ?? this.scene.background;
      this.hemisphere.intensity = night ? NIGHT.hemisphere : DAY.hemisphere;
      this.sun.intensity = night ? NIGHT.sun : DAY.sun;
      if (night) this.popWord(strings.words3d.doubleRound, 0, 5.6, -2, 1.6, colors.gold);
    } else if (phase === 'roundEnd') {
      this.popWord(strings.words3d.roundOver, 0, 4.4, 0, 2.6, colors.cream);
      const winner = [...this.pets.values()].find(view => this.winners.has(view.seat));
      if (winner) {
        this.rig.focus(winner.feet.x, winner.feet.z, 16, tuning.match.roundEnd - 0.5, 0.5);
        this.confetti(winner.feet.x, 3.5, winner.feet.z, [new Color(seatColor(winner.seat)), WHITE, new Color(colors.gold)], 60);
      }
    } else if (phase === 'matchEnd') {
      const top = game.standings.slice(0, 3).map(entry => ({ seat: entry.seat, model: this.modelOf(game, entry.seat) }));
      // The whole platform comes back as a clean stage for the podium.
      this.tiles.reset(false);
      this.podium = new Podium(top);
      this.scene.add(this.podium.group);
      this.rig.focus(0, 0.5, 15, 3600, 0.12);
      this.confetti(0, 6, 0, [new Color(colors.gold), WHITE, new Color(seatColor(top[0]?.seat ?? 0))], 90);
    } else if (phase === 'lobby') {
      this.words.clear();
      this.tiles.reset(true);
      this.scene.background = this.skies.day ?? this.scene.background;
      this.hemisphere.intensity = DAY.hemisphere;
      this.sun.intensity = DAY.sun;
    }
  }

  private onEliminated(event: Extract<GameEvent, { t: 'eliminated' }>): void {
    const view = this.pets.get(event.pet);
    const x = view?.feet.x ?? event.x;
    const z = view?.feet.z ?? event.z;
    // A pet that fell is far below by now; the pieces fly up from the edge it went over.
    const y = Math.max(view?.feet.y ?? 0, -1.5) + 0.6;
    const palette = petPalette(view?.model ?? 'fox');
    for (let index = 0; index < 22; index++) {
      const angle = random(0, Math.PI * 2);
      const speed = random(2, 7);
      this.particles.cube({ x, y, z, vx: Math.sin(angle) * speed, vy: random(5, 12), vz: Math.cos(angle) * speed, life: random(1.1, 1.9), size: random(0.14, 0.3), gravity: 24, spin: random(-12, 12), bounce: true, color: palette[index % palette.length]! });
    }
    this.poof(x, y, z);
    this.removePet(event.pet);
    if (event.decoy) return;
    if (event.killer !== null) this.confetti(x, y + 0.5, z, [new Color(seatColor(event.killer)), WHITE], 16);
    this.rig.punchIn(0.35);
    this.rig.shake(0.2);
  }

  private boom(x: number, y: number, z: number, radius: number, big: boolean, chain: number): void {
    const count = Math.round(8 + radius * 7);
    this.particles.glow({ x, y: y + 0.4, z, life: 0.2, size: radius * 0.9, sizeEnd: radius * 1.7, color: FLASH });
    for (let index = 0; index < count; index++) {
      const angle = random(0, Math.PI * 2);
      const reach = random(0.3, 1) * radius;
      this.particles.puff({ x: x + Math.sin(angle) * 0.3, y: y + 0.3, z: z + Math.cos(angle) * 0.3, vx: Math.sin(angle) * reach * 3, vy: random(1, 4), vz: Math.cos(angle) * reach * 3, life: random(0.45, 0.85), size: random(0.4, 0.8), sizeEnd: random(0.9, 1.5), drag: 3.5, color: SMOKE[index % SMOKE.length]! });
      this.particles.spark({ x, y: y + 0.4, z, vx: Math.sin(angle) * reach * 7, vy: random(3, 9), vz: Math.cos(angle) * reach * 7, life: random(0.3, 0.6), size: random(0.08, 0.16), gravity: 16, spin: 10, color: HOT });
      if (index % 2 === 0) this.particles.cube({ x, y: y + 0.3, z, vx: Math.sin(angle) * reach * 5, vy: random(4, 10), vz: Math.cos(angle) * reach * 5, life: random(0.8, 1.4), size: random(0.1, 0.2), gravity: 24, spin: random(-10, 10), bounce: true, color: INK });
    }
    this.decals.shock(x, z, radius, WHITE, 0.4);
    this.decals.shock(x, z, radius * 0.7, DANGER, 0.3);
    this.rig.shake(0.2 + radius * 0.13);
    this.renderer.kick(radius * 0.16);
    // The big word is for blasts worth shouting about, and never twice in a row.
    if (big && (chain >= 1 || radius > 3)) this.popWord(strings.words3d.kaboom, x, 3.6, z, 1.4 + Math.min(chain, 3) * 0.3, colors.danger);
  }

  /** While the podium is up, bursts of colour keep going off in the sky around it. */
  private fireworks(dt: number): void {
    this.fireworkIn -= dt;
    if (this.fireworkIn > 0) return;
    this.fireworkIn = random(0.35, 0.8);
    const x = random(-6, 6);
    const y = random(4, 8);
    const z = random(-5, 3);
    const color = new Color().setHSL(Math.random(), 1, 0.6);
    this.particles.glow({ x, y, z, life: 0.18, size: 0.5, sizeEnd: 1.6, color: color.clone().multiplyScalar(2.5) });
    for (let index = 0; index < 22; index++) {
      const angle = random(0, Math.PI * 2);
      const lift = random(-1, 1);
      const speed = random(4, 7) * Math.sqrt(1 - lift * lift);
      this.particles.spark({ x, y, z, vx: Math.sin(angle) * speed, vy: lift * 6, vz: Math.cos(angle) * speed, life: random(0.6, 1), size: 0.14, gravity: 5, drag: 1.8, spin: 8, color: color.clone().multiplyScalar(2) });
    }
  }

  private popWord(text: string, x: number, y: number, z: number, size: number, color: string): void {
    if (this.time - this.lastWord < 0.9) return;
    this.lastWord = this.time;
    this.words.pop(text, x, y, z, { size, color });
  }

  private dust(x: number, z: number, count: number): void {
    for (let index = 0; index < count; index++) {
      const angle = random(0, Math.PI * 2);
      this.particles.puff({ x: x + Math.sin(angle) * 0.25, y: 0.12, z: z + Math.cos(angle) * 0.25, vx: Math.sin(angle) * random(0.8, 2.4), vy: random(0.3, 1.2), vz: Math.cos(angle) * random(0.8, 2.4), life: random(0.3, 0.55), size: random(0.14, 0.26), sizeEnd: 0.4, drag: 4, color: WHITE });
    }
  }

  private poof(x: number, y: number, z: number): void {
    for (let index = 0; index < 9; index++) {
      const angle = (index / 9) * Math.PI * 2;
      this.particles.puff({ x, y, z, vx: Math.sin(angle) * 2.6, vy: random(0.5, 2.5), vz: Math.cos(angle) * 2.6, life: 0.45, size: 0.4, sizeEnd: 0.7, drag: 4, color: WHITE });
    }
  }

  private stars(x: number, y: number, z: number, count: number): void {
    for (let index = 0; index < count; index++) {
      const angle = random(0, Math.PI * 2);
      this.particles.spark({ x, y, z, vx: Math.sin(angle) * random(3, 8), vy: random(2, 7), vz: Math.cos(angle) * random(3, 8), life: random(0.25, 0.5), size: random(0.1, 0.2), gravity: 14, spin: 14, color: HOT });
    }
  }

  private confetti(x: number, y: number, z: number, palette: Color[], count: number): void {
    for (let index = 0; index < count; index++) {
      const angle = random(0, Math.PI * 2);
      const speed = random(1, 5);
      this.particles.cube({ x, y, z, vx: Math.sin(angle) * speed, vy: random(4, 10), vz: Math.cos(angle) * speed, life: random(1, 1.8), size: random(0.09, 0.16), gravity: 11, drag: 1.2, spin: random(-14, 14), bounce: true, color: palette[index % palette.length]! });
    }
  }

  /** What the camera should keep in view right now. */
  private focusPoints(game: Game): { x: number; z: number }[] {
    if (game.phase !== 'play') return CORNERS;
    const points: { x: number; z: number }[] = [];
    for (const view of this.pets.values()) if (view.feet.y > -3) points.push({ x: view.feet.x, z: view.feet.z });
    for (const ghost of game.round.ghosts) points.push({ x: ghost.x * 0.6, z: ghost.z * 0.6 });
    if (game.round.cube) points.push(game.round.cube);
    // Never tighter than the middle of the platform, so a lone survivor is not filmed in close-up.
    points.push({ x: -2.5, z: -2.5 }, { x: 2.5, z: 2.5 });
    return points;
  }

  private placeNames(game: Game): void {
    const placed = new Set<number>();
    const project = (seat: number, x: number, y: number, z: number) => {
      this.point.set(x, y, z).project(this.rig.camera);
      this.nameplates.place(seat, (this.point.x * 0.5 + 0.5) * this.size.width, (-this.point.y * 0.5 + 0.5) * this.size.height);
      placed.add(seat);
    };
    // Who is within a player's reach right now. Bots do not get the hint; they do not need it.
    const reached = new Map<number, number>();
    for (const pet of game.phase === 'matchEnd' ? [] : game.round.pets) {
      const view = this.pets.get(pet.id);
      if (view && !pet.decoy && view.feet.y > -2) project(pet.seat, view.feet.x, view.feet.y + view.height + 0.15, view.feet.z);
      if (pet.decoy || pet.grabTarget?.kind !== 'pet' || game.seats.find(seat => seat.seat === pet.seat)?.bot !== null) continue;
      const target = game.round.petById(pet.grabTarget.id);
      if (target && !target.decoy) reached.set(target.seat, pet.seat);
    }
    for (const seat of game.seats) {
      const held = game.phase === 'matchEnd' ? null : (game.round.petOfSeat(seat.seat)?.held ?? null);
      this.nameplates.setHeld(seat.seat, held ? POWER_ICON[held] : null, held ? TIER_COLOR[POWERS[held].tier] : '');
      this.nameplates.setReach(seat.seat, reached.get(seat.seat) ?? null);
    }
    for (const [seat, view] of this.ghosts) project(seat, view.group.position.x, view.headHeight, view.group.position.z);
    // A seat with nothing on screen (between a fall and coming back) has its tag parked out of sight.
    for (const seat of game.seats) if (!placed.has(seat.seat)) this.nameplates.place(seat.seat, -9999, -9999);
  }

  private fit(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.size = { width, height };
    this.renderer.setSize(width, height);
    this.rig.setViewport(width, height, this.insets);
  }

  /** A slow sea of clouds far below, so the platform reads as high up. */
  private clouds(): Group {
    const group = new Group();
    const geometry = new IcosahedronGeometry(1, 1);
    const material = toonMaterial({ color: colors.white });
    for (let index = 0; index < 16; index++) {
      const cloud = new Mesh(geometry, material);
      const angle = (index / 16) * Math.PI * 2;
      const reach = 14 + (index % 4) * 6;
      cloud.position.set(Math.sin(angle) * reach, -13 - (index % 3) * 2, Math.cos(angle) * reach - 4);
      cloud.scale.set(5 + (index % 3) * 2, 2.2, 4 + (index % 2) * 2);
      group.add(cloud);
    }
    return group;
  }
}
