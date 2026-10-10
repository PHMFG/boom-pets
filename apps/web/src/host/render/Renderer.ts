// The WebGL renderer and its post-processing: glow, vignette, saturation and a colour-fringe kick.
// Every effect stays mounted and is animated to zero when idle, so nothing compiles mid-match.
import { BloomEffect, ChromaticAberrationEffect, EffectComposer, EffectPass, HueSaturationEffect, RenderPass, VignetteEffect } from 'postprocessing';
import { HalfFloatType, PCFShadowMap, Vector2, WebGLRenderer, type Camera, type Scene } from 'three';

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class Renderer {
  readonly three: WebGLRenderer;
  /** False for "Menos tremor e brilho": no colour fringe and a gentler glow. */
  fullEffects = true;
  private readonly composer: EffectComposer;
  private readonly bloom: BloomEffect;
  private readonly fringe: ChromaticAberrationEffect;
  private readonly color: HueSaturationEffect;
  private fringeAmount = 0;
  private glowKick = 0;
  private saturation = 0;
  private saturationGoal = 0;

  constructor(container: HTMLElement, scene: Scene, camera: Camera) {
    // Anti-aliasing is done by the composer's multisampling, so the canvas itself needs none.
    this.three = new WebGLRenderer({ antialias: false, stencil: false, depth: false, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = PCFShadowMap;
    container.append(this.three.domElement);

    this.composer = new EffectComposer(this.three, { frameBufferType: HalfFloatType, multisampling: 4 });
    // Only colours brighter than white glow: explosions, sparks and SUPER auras are drawn that bright on purpose.
    this.bloom = new BloomEffect({ luminanceThreshold: 1.15, luminanceSmoothing: 0.15, mipmapBlur: true, intensity: 0.9, radius: 0.75 });
    this.color = new HueSaturationEffect({ saturation: 0 });
    this.fringe = new ChromaticAberrationEffect({ offset: new Vector2(0, 0), radialModulation: true, modulationOffset: 0.2 });
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new EffectPass(camera, this.bloom, this.color, new VignetteEffect({ offset: 0.35, darkness: 0.42 })));
    // The fringe samples neighbouring pixels, so it cannot share a pass with the effects above.
    this.composer.addPass(new EffectPass(camera, this.fringe));
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  /** A burst of colour fringe and extra glow that dies away, for explosions. `amount` is 0 to 1. */
  kick(amount: number): void {
    if (!this.fullEffects) return;
    this.fringeAmount = Math.min(1, this.fringeAmount + amount);
    this.glowKick = Math.min(1, this.glowKick + amount);
  }

  /** 0 is normal colour; -1 is grey. The picture eases toward it. */
  setSaturation(goal: number): void {
    this.saturationGoal = goal;
  }

  render(dt: number): void {
    this.fringeAmount *= Math.exp(-7 * dt);
    this.glowKick *= Math.exp(-5 * dt);
    this.saturation += (this.saturationGoal - this.saturation) * damp(8, dt);
    this.fringe.offset.setScalar(this.fringeAmount * 0.006);
    this.bloom.intensity = (this.fullEffects ? 0.9 : 0.5) + this.glowKick * 1.4;
    this.color.saturation = this.saturation;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.three.dispose();
    this.three.domElement.remove();
  }
}
