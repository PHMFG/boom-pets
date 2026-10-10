// Sound. Impacts are recorded samples; everything else (whooshes, booms, jingles, the music) is
// synthesised, so the game needs no audio files beyond a handful of hits. Music and effects run on
// separate buses: music ducks under big moments and goes muffled in slow motion.
import type { Game, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';

const SAMPLES = ['hit1', 'hit2', 'hit3', 'bump1', 'bump2', 'land1', 'land2', 'wood1', 'wood2', 'crack1', 'crack2', 'clang', 'lever', 'glass', 'ding', 'tick'] as const;
type Sample = (typeof SAMPLES)[number];
type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

const NOTE = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);
/** Two eight-step bass lines and leads, in semitones from A4. Null is a rest. */
const SONGS = {
  lobby: { tempo: 104, bass: [-24, null, -17, null, -21, null, -17, -19], lead: [3, null, 7, 10, null, 7, 3, null, 2, null, 5, 8, null, 5, 2, null] },
  battle: { tempo: 148, bass: [-24, -24, -12, -24, -21, -21, -9, -21, -26, -26, -14, -26, -19, -19, -7, -19], lead: [0, 3, 7, 12, 10, 7, 3, 7, -2, 2, 5, 10, 8, 5, 2, 5] },
} as const;
export type Song = keyof typeof SONGS | null;

export class AudioEngine {
  muted = false;
  private context: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private music!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private readonly buffers = new Map<Sample, AudioBuffer>();
  private song: Song = null;
  private step = 0;
  private nextNoteAt = 0;
  private scheduler = 0;
  private whine: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private lastBoom = 0;

  get running(): boolean {
    return this.context?.state === 'running';
  }

  /** Browsers only allow sound after a key press or click. Call this from one. */
  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    // A limiter, so six explosions at once get louder but never clip.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 12;
    this.master.connect(limiter).connect(context.destination);
    this.effects = context.createGain();
    this.effects.gain.value = 0.9;
    this.effects.connect(this.master);
    this.musicFilter = context.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.music = context.createGain();
    this.music.gain.value = 0.16;
    this.music.connect(this.musicFilter).connect(this.master);

    for (const name of SAMPLES) {
      void fetch(`/sounds/${name}.m4a`)
        .then(response => response.arrayBuffer())
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => this.buffers.set(name, buffer))
        .catch(() => undefined);
    }
    this.voice = speechSynthesis.getVoices().find(voice => voice.lang.startsWith('pt')) ?? null;
    speechSynthesis.addEventListener('voiceschanged', () => (this.voice = speechSynthesis.getVoices().find(voice => voice.lang.startsWith('pt')) ?? this.voice));
    this.scheduler = window.setInterval(() => this.schedule(), 60);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.context) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.05);
    if (muted) speechSynthesis.cancel();
  }

  setSong(song: Song): void {
    if (song === this.song) return;
    this.song = song;
    this.step = 0;
    this.nextNoteAt = (this.context?.currentTime ?? 0) + 0.1;
  }

  /** Per frame: muffles the music in slow motion and plays one rising whine for the strongest charge on the platform. */
  update(game: Game): void {
    const context = this.context;
    if (!context) return;
    this.musicFilter.frequency.setTargetAtTime(game.dilation < 0.9 ? 500 : 18000, context.currentTime, 0.08);
    let charge = 0;
    for (const pet of game.round.pets) charge = Math.max(charge, Math.min(1, pet.chargeTime / tuning.dash.overchargeAt));
    if (charge > 0 && !this.whine) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sawtooth';
      gain.gain.value = 0;
      oscillator.connect(gain).connect(this.effects);
      oscillator.start();
      this.whine = { oscillator, gain };
    }
    if (this.whine) {
      this.whine.oscillator.frequency.setTargetAtTime(160 + charge * 760, context.currentTime, 0.03);
      this.whine.gain.gain.setTargetAtTime(charge > 0 ? 0.03 + charge * 0.06 : 0, context.currentTime, 0.03);
    }
  }

  /** The sound of one thing the simulation says just happened. */
  handle(event: GameEvent): void {
    switch (event.t) {
      case 'countdown':
        return event.n === 0 ? (this.tone(880, 0.35, 'square', 0.2, 1320), this.say('Já!')) : this.tone(440, 0.14, 'square', 0.16);
      case 'dash':
        return this.whoosh(0.16 + event.charge * 0.14, 0.12 + event.charge * 0.16);
      case 'dashHit':
        this.sample(['hit1', 'hit2', 'hit3'], 0.5 + event.charge * 0.5);
        return;
      case 'land':
        return this.sample(['land1', 'land2'], Math.min(0.6, event.speed / 30));
      case 'grab':
        return this.tone(300, 0.1, 'triangle', 0.15, 520);
      case 'throw':
        return this.whoosh(0.22, 0.2);
      case 'escape':
        return this.tone(500, 0.12, 'triangle', 0.15, 900);
      case 'fall':
        // The falling whistle.
        return this.tone(1300, 0.9, 'sine', 0.12, 180);
      case 'eliminated':
        this.tone(220, 0.12, 'square', 0.16, 660);
        return this.sample(['glass'], 0.35);
      case 'explosion':
        return this.boom(event.radius, event.chain);
      case 'barrelArmed':
        return this.tone(700, tuning.barrel.chainDelay, 'square', 0.1, 1400);
      case 'tileWarn':
        return this.sample(['crack1', 'crack2'], 0.12);
      case 'tileFall':
        return this.sample(['wood1', 'wood2'], 0.14);
      case 'cubeSpawn':
        return this.arpeggio([12, 16, 19], 0.07, 'triangle', 0.12);
      case 'cubeCollected':
        return this.arpeggio([7, 12, 19, 24], 0.05, 'square', 0.12);
      case 'roll':
        // Three reel stops, then the sting for the tier.
        [0.5, 0.75, 1].forEach(delay => window.setTimeout(() => this.sample(['tick'], 0.5), delay * 1000));
        window.setTimeout(() => (event.tier === 'cursed' ? this.arpeggio([3, 0, -4], 0.12, 'sawtooth', 0.14) : this.sample(['ding'], 0.5)), 1000);
        return;
      case 'powerStart':
        return this.arpeggio([0, 4, 7, 12], 0.05, 'square', 0.1);
      case 'honk':
        return this.tone(233, 0.18, 'square', 0.16, 220);
      case 'gachaStart':
        this.duck(tuning.gacha.duration);
        this.arpeggio([0, 4, 7, 12, 16, 19, 24], 0.045, 'square', 0.14);
        return this.say('Super sorte!');
      case 'gachaLever':
        return this.sample(['lever'], 0.7);
      case 'gachaJinx':
        return this.tone(180 + event.total * 12, 0.06, 'sawtooth', 0.08);
      case 'gachaReveal':
        this.sample(['glass'], 0.7);
        if (event.cursed) {
          // The sad trombone.
          [0, -1, -2, -3].forEach((semitone, index) => window.setTimeout(() => this.tone(NOTE(semitone - 12), index === 3 ? 0.6 : 0.24, 'sawtooth', 0.16, index === 3 ? NOTE(semitone - 14) : undefined), index * 260));
          return this.say('Super zica!');
        }
        return this.arpeggio([0, 4, 7, 12, 16, 19, 24, 28], 0.06, 'square', 0.16);
      case 'meteorCall':
        return this.tone(1500, event.delay, 'sine', 0.07, 300);
      case 'revengeSwap':
        this.arpeggio([12, 7, 12, 19], 0.07, 'sawtooth', 0.14);
        return this.say('Troca!');
      case 'score':
        return this.tone(NOTE(12 + Math.min(12, event.points)), 0.1, 'triangle', 0.12);
      case 'roundWinner':
        return this.arpeggio([0, 4, 7, 12, 7, 12, 16], 0.11, 'square', 0.16);
      case 'phase':
        if (event.phase === 'roundEnd') this.say('Fim!');
        if (event.phase === 'matchEnd') this.arpeggio([0, 4, 7, 12, 16, 12, 16, 19, 24], 0.12, 'square', 0.18);
        return;
      default:
        return;
    }
  }

  /** A button or menu sound for the HUD. */
  click(): void {
    this.tone(660, 0.06, 'triangle', 0.1, 880);
  }

  // ── Building blocks ────────────────────────────────────────────────────────

  private sample(names: Sample[], volume: number): void {
    const context = this.context;
    const buffer = this.buffers.get(names[Math.floor(Math.random() * names.length)]!);
    if (!context || !buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    // A different pitch every time, so repeated hits never sound identical.
    source.playbackRate.value = 0.9 + Math.random() * 0.25;
    gain.gain.value = volume;
    source.connect(gain).connect(this.effects);
    source.start();
  }

  private tone(frequency: number, seconds: number, wave: Wave, volume: number, slideTo?: number, bus?: AudioNode, at?: number): void {
    const context = this.context;
    if (!context) return;
    const start = at ?? context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + seconds);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain).connect(bus ?? this.effects);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  }

  private arpeggio(semitones: number[], gap: number, wave: Wave, volume: number): void {
    const context = this.context;
    if (!context) return;
    semitones.forEach((semitone, index) => this.tone(NOTE(semitone), gap * 2.2, wave, volume, undefined, undefined, context.currentTime + index * gap));
  }

  private noise(seconds: number, volume: number, from: number, to: number, type: BiquadFilterType, bus?: AudioNode, at?: number): void {
    const context = this.context;
    if (!context) return;
    const start = at ?? context.currentTime;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter).connect(gain).connect(bus ?? this.effects);
    source.start(start);
  }

  private whoosh(seconds: number, volume: number): void {
    this.noise(seconds, volume, 500, 3200, 'bandpass');
  }

  private boom(radius: number, chain: number): void {
    const context = this.context;
    if (!context) return;
    // Explosions in the same instant are layered once, not stacked into a wall of noise.
    if (context.currentTime - this.lastBoom < 0.04) return;
    this.lastBoom = context.currentTime;
    const size = Math.min(1, radius / 3.5);
    this.noise(0.5 + size * 0.4, 0.35 + size * 0.3, 2400, 90, 'lowpass');
    // The thump rises in pitch along a chain reaction.
    this.tone(110 * 2 ** (Math.min(chain, 6) / 12), 0.45, 'sine', 0.5, 38);
    this.duck(0.5);
    if (chain >= 2) this.say('Kabum!');
  }

  /** Pulls the music down for a moment so the important sound cuts through. */
  private duck(seconds: number): void {
    const context = this.context;
    if (!context) return;
    this.music.gain.cancelScheduledValues(context.currentTime);
    this.music.gain.setTargetAtTime(0.04, context.currentTime, 0.03);
    this.music.gain.setTargetAtTime(0.16, context.currentTime + seconds, 0.25);
  }

  /** The announcer: the computer's own Portuguese voice, until real lines are recorded. */
  private say(text: string): void {
    if (this.muted || !this.context || speechSynthesis.speaking) return;
    const line = new SpeechSynthesisUtterance(text);
    line.lang = 'pt-BR';
    if (this.voice) line.voice = this.voice;
    line.rate = 1.15;
    line.pitch = 1.35;
    line.volume = 0.9;
    speechSynthesis.speak(line);
  }

  /** Queues the music's next notes a little ahead of time, so it stays on the beat however the frames fall. */
  private schedule(): void {
    const context = this.context;
    if (!context || !this.song || context.state !== 'running') return;
    const song = SONGS[this.song];
    const beat = 60 / song.tempo / 2;
    while (this.nextNoteAt < context.currentTime + 0.2) {
      const bass = song.bass[this.step % song.bass.length];
      const lead = song.lead[this.step % song.lead.length];
      if (bass !== null && bass !== undefined) this.tone(NOTE(bass), beat * 0.9, 'triangle', 0.9, undefined, this.music, this.nextNoteAt);
      if (lead !== null && lead !== undefined) this.tone(NOTE(lead), beat * 0.7, 'square', 0.28, undefined, this.music, this.nextNoteAt);
      // Drums: a kick on the beat, a hat between, and in battle a snare on the back beat.
      const count = this.step % 8;
      if (count % 4 === 0) this.tone(130, 0.14, 'sine', 1.2, 42, this.music, this.nextNoteAt);
      if (count % 2 === 1) this.noise(0.04, 0.3, 9000, 7000, 'highpass', this.music, this.nextNoteAt);
      if (this.song === 'battle' && count === 4) this.noise(0.13, 0.55, 2400, 1100, 'bandpass', this.music, this.nextNoteAt);
      this.nextNoteAt += beat;
      this.step++;
    }
  }

  dispose(): void {
    clearInterval(this.scheduler);
    speechSynthesis.cancel();
    void this.context?.close();
  }
}
