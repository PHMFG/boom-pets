// The studio's 3D scene: every pet on a pedestal, playing whichever shipped clip is selected.
import {
  BoxGeometry,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { motion } from '../../shared/motion';
import { PET_IDS, type PetClip, type PetId } from '../../shared/pets';
import { strings } from '../../shared/strings.pt-BR';
import { colors } from '../../shared/tokens';
import { createPet, loadPets, type PetInstance } from '../render/assets';
import { Word3D } from '../render/Text3D';

const COLUMNS = 6;
const SPACING = 2.6;
const CROSSFADE = 0.12;
const OVERVIEW_TARGET = new Vector3(0, 0.9, 0);
const OVERVIEW_DIRECTION = new Vector3(0, 10.1, 20).normalize();
const OVERVIEW_MIN_DISTANCE = 22;
/** Half the width the overview must show: the pet grid plus a margin. */
const OVERVIEW_HALF_WIDTH = 8.6;

type StudioPet = { instance: PetInstance; pivot: Group; home: Vector3; clip: PetClip | null; appearAt: number };

const backOut = (t: number, strength: number) => 1 + (strength + 1) * (t - 1) ** 3 + strength * (t - 1) ** 2;
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class StudioStage {
  private readonly container: HTMLElement;
  private readonly renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly resize: ResizeObserver;
  private readonly pedestal = new BoxGeometry(2.2, 0.4, 2.2);
  private readonly pedestalMaterials = [
    new MeshStandardMaterial({ color: colors.cream, roughness: 0.9 }),
    new MeshStandardMaterial({ color: colors.creamDark, roughness: 0.9 }),
  ];
  private readonly words = new Group();
  private readonly wordList: Word3D[] = [];
  private readonly pets: StudioPet[] = [];
  private readonly overview = OVERVIEW_DIRECTION.clone().multiplyScalar(OVERVIEW_MIN_DISTANCE).add(OVERVIEW_TARGET);
  private readonly goal = { position: this.overview.clone(), target: OVERVIEW_TARGET.clone() };
  private focused: PetId | null = null;
  private leftInset = 0;
  private flying = false;
  private spin = false;
  private clip: PetClip = 'idle';
  private time = 0;
  private last = 0;
  private frame = 0;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.append(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(OVERVIEW_TARGET);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 90;
    // Grabbing the camera cancels any flight in progress, so the user always wins.
    this.controls.addEventListener('start', () => (this.flying = false));

    this.scene.add(new HemisphereLight(0xffffff, colors.creamDark, 1.7));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(6, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const reach = 12;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 50 });
    this.scene.add(sun);

    new TextureLoader().load('/skyboxes/skybox-day.png', sky => {
      if (this.disposed) return sky.dispose();
      sky.mapping = EquirectangularReflectionMapping;
      sky.colorSpace = SRGBColorSpace;
      this.scene.background = sky;
    });

    this.buildWords();
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
    this.camera.position.copy(this.overview);
    this.flying = false;
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Loads all pets. Resolves with how many are on stage; rejects if any model is missing or lacks a clip. */
  async load(): Promise<number> {
    const rows = Math.ceil(PET_IDS.length / COLUMNS);
    await loadPets();
    const instances = PET_IDS.map(id => createPet(id, colors.ink));
    if (this.disposed) {
      instances.forEach(instance => instance.dispose());
      return 0;
    }
    instances.forEach((instance, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const home = new Vector3((column - (COLUMNS - 1) / 2) * SPACING, 0, (row - (rows - 1) / 2) * SPACING);

      const base = new Mesh(this.pedestal, this.pedestalMaterials[(column + row) % 2]);
      base.position.set(home.x, -0.2, home.z);
      base.receiveShadow = true;
      this.scene.add(base);

      const pivot = new Group();
      pivot.position.copy(home);
      pivot.scale.setScalar(0);
      pivot.add(instance.model);
      this.scene.add(pivot);
      this.pets.push({ instance, pivot, home, clip: null, appearAt: this.time + (index * motion.staggerMs) / 1000 });
    });
    this.setClip(this.clip);
    this.report();
    return this.pets.length;
  }

  setClip(clip: PetClip): void {
    this.clip = clip;
    this.pets.forEach((pet, index) => {
      if (pet.clip === clip) return;
      const next = pet.instance.actions.get(clip);
      if (!next) return;
      const previous = pet.clip ? pet.instance.actions.get(pet.clip) : undefined;
      next.reset();
      // Offset each pet so two dozen of them never move in perfect unison.
      next.time = (index * 0.137) % next.getClip().duration;
      next.fadeIn(CROSSFADE).play();
      previous?.fadeOut(CROSSFADE);
      pet.clip = clip;
    });
    this.report();
  }

  /** Flies the camera to one pet, or back to the overview with null. */
  focus(id: PetId | null): void {
    const pet = id ? this.pets.find(candidate => candidate.instance.id === id) : undefined;
    this.focused = pet ? pet.instance.id : null;
    if (pet) {
      this.goal.target.copy(pet.home).setY(0.9);
      this.goal.position.copy(pet.home).add(new Vector3(0, 2.4, 6));
    } else {
      this.goal.target.copy(OVERVIEW_TARGET);
      this.goal.position.copy(this.overview);
    }
    this.flying = true;
  }

  /** Pixels on the left covered by UI. The view is centred in what remains. */
  setLeftInset(pixels: number): void {
    this.leftInset = pixels;
    this.fit();
  }

  setSpin(on: boolean): void {
    this.spin = on;
  }

  setWordsVisible(on: boolean): void {
    this.words.visible = on;
    if (on) this.wordList.forEach(word => word.slam());
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.pets.forEach(pet => pet.instance.dispose());
    this.pedestal.dispose();
    this.pedestalMaterials.forEach(material => material.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private buildWords(): void {
    const lines: { text: string; size: number; color: string }[] = [
      { text: strings.words3d.kaboom, size: 1.5, color: colors.danger },
      { text: strings.words3d.superPull, size: 1.1, color: colors.gold },
      { text: strings.words3d.underdog, size: 0.8, color: colors.cream },
      { text: strings.words3d.revenge, size: 0.8, color: colors.tierRare },
      { text: `${strings.words3d.go} +3 ×2`, size: 0.8, color: colors.tierCursedAccent },
    ];
    // Stacked in the band of sky the overview shows above the back row of pets.
    let y = 6.9;
    for (const line of lines) {
      const word = new Word3D(line.text, { size: line.size, color: line.color });
      y -= line.size * 1.2;
      word.group.position.set(0, y, -5.5);
      this.words.add(word.group);
      this.wordList.push(word);
    }
    this.words.visible = false;
    this.scene.add(this.words);
  }

  private fit(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    const free = Math.max(width - this.leftInset, 240);
    this.camera.setViewOffset(width, height, -(width - free) / 2, 0, width, height);

    // Pull the overview back until the whole grid fits the free width.
    const halfWidthPerUnit = Math.tan(MathUtils.degToRad(this.camera.fov / 2)) * (free / height);
    const distance = Math.max(OVERVIEW_MIN_DISTANCE, OVERVIEW_HALF_WIDTH / halfWidthPerUnit);
    this.overview.copy(OVERVIEW_DIRECTION).multiplyScalar(distance).add(OVERVIEW_TARGET);
    if (this.focused === null) {
      this.goal.position.copy(this.overview);
      this.flying = true;
    }
  }

  private readonly tick = (now: number): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min((now - (this.last || now)) / 1000, 0.1);
    this.last = now;
    this.time += dt;

    const popSeconds = motion.popIn.ms / 1000;
    for (const pet of this.pets) {
      const t = (this.time - pet.appearAt) / popSeconds;
      pet.pivot.scale.setScalar(t <= 0 ? 0 : t >= 1 ? 1 : backOut(t, 2.2));
      if (this.spin) pet.pivot.rotation.y += dt * 0.9;
      else pet.pivot.rotation.y += (0 - pet.pivot.rotation.y) * damp(8, dt);
      pet.instance.mixer.update(dt);
    }
    this.wordList.forEach(word => word.update(dt));

    if (this.flying) {
      const k = damp(5, dt);
      this.camera.position.lerp(this.goal.position, k);
      this.controls.target.lerp(this.goal.target, k);
      if (this.camera.position.distanceTo(this.goal.position) < 0.02) this.flying = false;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /** Lets tests and the browser console confirm what is on stage without reading pixels. */
  private report(): void {
    Object.assign(this.container.dataset, {
      pets: String(this.pets.length),
      clip: this.clip,
      clipsPerPet: String(Math.min(...this.pets.map(pet => pet.instance.actions.size))),
    });
  }
}
