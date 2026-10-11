// Sound. Impacts are recorded samples and the music is recorded tracks; everything else (whooshes,
// booms, jingles) is synthesised. Music and effects run on separate buses: music ducks under big
// moments and goes muffled in slow motion. If a track's file is missing, a synthesised tune stands in.
import type { Game, GameEvent } from '@boom/game';
import { tuning } from '@boom/game';
import { motion } from '../../shared/motion';
import { strings } from '../../shared/strings.pt-BR';

const SAMPLES = ['hit1', 'hit2', 'hit3', 'bump1', 'bump2', 'land1', 'land2', 'wood1', 'wood2', 'crack1', 'crack2', 'clang', 'lever', 'glass', 'ding', 'tick'] as const;
type Sample = (typeof SAMPLES)[number];
type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

const NOTE = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);
/** How many of a round's last seconds are ticked off out loud. */
const LAST_TICKS = 5;
/** The stand-in tunes: two eight-step bass lines and leads, in semitones from A4. Null is a rest. */
const SONGS = {
  lobby: { tempo: 104, bass: [-24, null, -17, null, -21, null, -17, -19], lead: [3, null, 7, 10, null, 7, 3, null, 2, null, 5, 8, null, 5, 2, null] },
  battle: { tempo: 148, bass: [-24, -24, -12, -24, -21, -21, -9, -21, -26, -26, -14, -26, -19, -19, -7, -19], lead: [0, 3, 7, 12, 10, 7, 3, 7, -2, 2, 5, 10, 8, 5, 2, 5] },
} as const;

/**
 * The soundtrack: one recorded track per moment of the game, in `public/music`. `synth` is the
 * stand-in tune that plays if the file cannot be loaded.
 */
const TRACKS = {
  title: { file: 'title', synth: 'lobby' },
  lobby: { file: 'lobby', synth: 'lobby' },
  battleA: { file: 'battle-a', synth: 'battle' },
  battleB: { file: 'battle-b', synth: 'battle' },
  /** The last round of a match, which counts double. */
  final: { file: 'rio-rumble', synth: 'battle' },
} as const satisfies Record<string, { file: string; synth: keyof typeof SONGS }>;
type TrackId = keyof typeof TRACKS;
export type Song = TrackId | null;
type Track = { element: HTMLAudioElement; gain: GainNode; broken: boolean };

/** The announcer's lines, recorded by `pnpm voice` into `public/voice`. */
export type Line = keyof typeof strings.announcer;
const LINES = Object.keys(strings.announcer) as Line[];
/** The countdown numbers give way to anything else being shouted. */
const QUIET_LINES: ReadonlySet<Line> = new Set(['three', 'two', 'one']);
/** Lines that land with a low boom under them. */
const BIG_LINES: ReadonlySet<Line> = new Set(['brand', 'go', 'finalRound', 'matchEnd', 'superPull', 'superCurse', 'kaboom', 'champion', 'gameBrawl', 'gameLava', 'gameGrow', 'gameRace', 'gameColor', 'gamePotato', 'gamePaint', 'gameFrita']);

/**
 * The announcer is a stadium voice: deeper than recorded, doubled, pushed into grit, squashed flat,
 * then thrown into a big hall with an echo bouncing after it, well above everything else.
 */
const ANNOUNCER = {
  /** Playback speed. Under 1 is deeper and slower. */
  depth: 0.9,
  /** A second copy a hair lower and later, which thickens one voice into two. */
  doubleDetune: 0.985,
  doubleDelay: 0.018,
  doubleLevel: 0.6,
  /** How hard the voice is pushed into the saturator. 1 is clean. */
  grit: 3,
  hallSeconds: 3.2,
  hallLevel: 0.6,
  echoSeconds: 0.24,
  echoFeedback: 0.4,
  echoLevel: 0.36,
  /**
   * Final level into the master limiter. Measured at this setting, the voice alone: a line's loudest
   * second averages -11 to -8 dB, against -18 dB for the hardest impact, so 7 to 10 dB hotter. The short
   * lines peak just under full scale and the longest just over (+0.9 dB), which the limiter catches.
   * The tail is 22 dB down half a second after the words end and rings for about two more.
   */
  level: 0.9,
} as const;

/** Seconds one track takes to fade into the next. */
const MUSIC_FADE = 0.7;
/** How loud a recorded track sits on the music bus. The bus itself is kept low so effects stay on top. */
const TRACK_LEVEL = 2;

export class AudioEngine {
  muted = false;
  private context: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private music!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private readonly buffers = new Map<Sample, AudioBuffer>();
  private readonly lines = new Map<Line, AudioBuffer>();
  /** Lines whose recording could not be loaded at all. */
  private readonly missing = new Set<Line>();
  /** Where a line goes in: the head of the announcer's effects. */
  private announcer!: GainNode;
  private announcerBusyUntil = 0;
  private song: Song = null;
  private readonly tracks = new Map<TrackId, Track>();
  /** The stand-in tune playing because the wanted track has no file. */
  private synth: keyof typeof SONGS | null = null;
  private step = 0;
  private nextNoteAt = 0;
  private scheduler = 0;
  private whine: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private lastBoom = 0;
  /** When the bomb of Batata Quente ticks next, on the audio clock. */
  private nextTick = 0;
  /** How many players are in the match: the list of a round's places has that many rows to count out. */
  private rows = 4;
  /** The whole seconds left of the round when last looked at, to tick once as each of the last ones starts. */
  private lastSecond = 0;

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

    this.buildAnnouncer(context);
    for (const line of LINES) {
      void fetch(`/voice/${line}.m4a`)
        .then(response => response.arrayBuffer())
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => this.lines.set(line, buffer))
        .catch(() => this.missing.add(line));
    }
    for (const name of SAMPLES) {
      void fetch(`/sounds/${name}.m4a`)
        .then(response => response.arrayBuffer())
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => this.buffers.set(name, buffer))
        .catch(() => undefined);
    }
    for (const id of Object.keys(TRACKS) as TrackId[]) {
      const element = new Audio(`/music/${TRACKS[id].file}.mp3`);
      element.loop = true;
      element.preload = 'auto';
      const gain = context.createGain();
      gain.gain.value = 0;
      context.createMediaElementSource(element).connect(gain).connect(this.music);
      const track: Track = { element, gain, broken: false };
      element.addEventListener('error', () => {
        track.broken = true;
        if (this.song === id) this.playSong(false);
      });
      this.tracks.set(id, track);
    }
    // A song may have been asked for before the first key press allowed any sound.
    this.playSong(false);
    this.voice = speechSynthesis.getVoices().find(voice => voice.lang.startsWith('pt')) ?? null;
    speechSynthesis.addEventListener('voiceschanged', () => (this.voice = speechSynthesis.getVoices().find(voice => voice.lang.startsWith('pt')) ?? this.voice));
    this.scheduler = window.setInterval(() => this.schedule(), 60);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.context) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.05);
    if (muted) speechSynthesis.cancel();
  }

  /** Fades to another track. A track picks up where it was left, unless `restart` sends it back to its beginning. */
  setSong(song: Song, restart = false): void {
    if (song === this.song && !restart) return;
    this.song = song;
    this.playSong(restart);
  }

  private playSong(restart: boolean): void {
    const context = this.context;
    if (!context) return;
    for (const [id, track] of this.tracks) {
      const wanted = id === this.song && !track.broken;
      track.gain.gain.cancelScheduledValues(context.currentTime);
      track.gain.gain.setTargetAtTime(wanted ? TRACK_LEVEL : 0, context.currentTime, MUSIC_FADE / 3);
      if (wanted) {
        if (restart) track.element.currentTime = 0;
        // Refused only before the first key press; unlocking calls this again.
        void track.element.play().catch(() => undefined);
      } else if (!track.element.paused) {
        // Paused once it has faded out, so it resumes from the same bar next time.
        window.setTimeout(() => this.song !== id && track.element.pause(), MUSIC_FADE * 1000);
      }
    }
    const current = this.song ? this.tracks.get(this.song) : undefined;
    const synth = this.song && current?.broken ? TRACKS[this.song].synth : null;
    if (synth !== this.synth) {
      this.synth = synth;
      this.step = 0;
      this.nextNoteAt = context.currentTime + 0.1;
    }
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
    this.rows = game.seats.length;
    // The last seconds of any round are counted out loud, each tick higher than the one before.
    const left = game.phase === 'play' && Number.isFinite(game.timeLeft) ? Math.ceil(game.timeLeft) : 0;
    if (left !== this.lastSecond) {
      this.lastSecond = left;
      if (left >= 1 && left <= LAST_TICKS) this.tone(NOTE(12 + (LAST_TICKS - left) * 2), 0.09, 'square', 0.11);
    }
    // Batata Quente: the bomb ticks, faster and higher as its fuse burns down.
    const round = game.round;
    if (game.phase === 'play' && round.gameMode === 'potato' && round.rules.holder !== null && context.currentTime >= this.nextTick) {
      const heat = 1 - Math.max(0, round.rules.fuse / round.rules.fuseTotal);
      this.tone(900 + heat * 700, 0.04, 'square', 0.06 + heat * 0.06);
      // In step with the bomb's beat on screen: never faster than the alarm.
      this.nextTick = context.currentTime + 1 / (1 + heat * (1000 / motion.alarm.ms - 1));
    }
  }

  /** The sound of one thing the simulation says just happened. */
  handle(event: GameEvent): void {
    switch (event.t) {
      case 'countdown':
        if (event.n === 0) {
          this.tone(880, 0.35, 'square', 0.2, 1320);
          return this.announce('go');
        }
        this.tone(440, 0.14, 'square', 0.16);
        return this.announce(event.n === 3 ? 'three' : event.n === 2 ? 'two' : 'one');
      case 'dash':
        // Even a tap is heard: it is the brawl's one verb, and a press with no sound feels like a press that did not count.
        return this.whoosh(0.16 + event.charge * 0.14, 0.27 + event.charge * 0.2);
      case 'dashHit':
        this.sample(['hit1', 'hit2', 'hit3'], 0.5 + event.charge * 0.5);
        return;
      case 'land':
        return this.sample(['land1', 'land2'], Math.min(0.6, event.speed / 30));
      case 'tired':
        return this.tone(180, 0.07, 'triangle', 0.11, 140);
      case 'grabMiss':
        return this.whoosh(0.1, 0.2);
      case 'grab':
        if (event.kind === 'pet') this.sample(['hit1', 'hit2'], 0.35);
        return this.tone(300, 0.1, 'triangle', 0.15, 520);
      case 'throw':
        return this.whoosh(0.22, event.kind === 'pet' ? 0.3 : 0.2);
      case 'throwHit':
        return this.sample(['hit1', 'hit2', 'hit3'], 0.8);
      case 'powerReady':
        return this.arpeggio([12, 19], 0.06, 'triangle', 0.1);
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
        return this.announce('superPull');
      case 'gachaLever':
        return this.sample(['lever'], 0.7);
      case 'gachaJinx':
        return this.tone(180 + event.total * 12, 0.06, 'sawtooth', 0.08);
      case 'gachaReveal':
        this.sample(['glass'], 0.7);
        if (event.cursed) {
          // The sad trombone.
          [0, -1, -2, -3].forEach((semitone, index) => window.setTimeout(() => this.tone(NOTE(semitone - 12), index === 3 ? 0.6 : 0.24, 'sawtooth', 0.16, index === 3 ? NOTE(semitone - 14) : undefined), index * 260));
          return this.announce('superCurse');
        }
        return this.arpeggio([0, 4, 7, 12, 16, 19, 24, 28], 0.06, 'square', 0.16);
      case 'meteorCall':
        return this.tone(1500, event.delay, 'sine', 0.07, 300);
      case 'revengeSwap':
        this.arpeggio([12, 7, 12, 19], 0.07, 'sawtooth', 0.14);
        return this.announce('swap');
      case 'score':
        return this.tone(NOTE(12 + Math.min(12, event.points)), 0.1, 'triangle', 0.12);
      case 'roundWinner':
        this.countRows(this.rows);
        return this.arpeggio([0, 4, 7, 12, 7, 12, 16], 0.11, 'square', 0.16);
      case 'phase':
        if (event.phase === 'roundEnd') this.announce('roundOver');
        else if (event.phase === 'intro') this.roulette(tuning.match.introRoulette);
        else if (event.phase === 'finale') {
          this.announce('matchEnd');
          this.drumRoll(tuning.match.finaleReveal.at(-1)!);
        }
        return;
      case 'lava': {
        const context = this.context;
        if (!context) return;
        if (event.phase === 'alarm') {
          // A siren for as long as the alarm lasts: one rising sweep a second.
          this.duck(event.seconds);
          for (let at = 0; at < event.seconds - 0.2; at += 0.62) this.tone(430, 0.55, 'sawtooth', 0.14, 860, undefined, context.currentTime + at);
        } else if (event.phase === 'flood') {
          // The lava arrives: a low surge and a hiss.
          this.noise(1.1, 0.4, 300, 2600, 'bandpass');
          this.tone(70, 0.9, 'sine', 0.45, 45);
        }
        return;
      }
      case 'colorShow':
        return this.arpeggio([12, 16, 19], 0.05, 'triangle', 0.1);
      case 'colorCall':
        return this.arpeggio([0, 12, 7, 12], 0.07, 'square', 0.15);
      case 'colorDrop':
        this.sample(['crack1', 'crack2'], 0.8);
        return this.tone(140, 0.5, 'sine', 0.4, 50);
      case 'eat':
        // A pop, higher for a bigger mouthful; a pepper goes down instead of up.
        if (event.kind === 'pepper') return this.tone(520, 0.22, 'sawtooth', 0.11, 180);
        return this.tone(event.kind === 'melon' ? 880 : event.kind === 'donut' ? 740 : 620, 0.08, 'triangle', 0.1, event.kind === 'melon' ? 1320 : 990);
      case 'bite':
        this.noise(0.12, 0.35, 3200, 900, 'highpass');
        return this.sample(['hit1', 'hit2', 'hit3'], 0.7);
      case 'jump':
        return this.tone(420, 0.14, 'triangle', 0.1, 760);
      case 'finish':
        return this.arpeggio(event.place === 1 ? [0, 4, 7, 12, 16, 19, 24] : [0, 7, 12], 0.08, 'square', 0.16);
      case 'swept':
        return this.sample(['hit1', 'hit2', 'hit3'], 0.7);
      case 'respawn':
        return this.tone(880, 0.12, 'triangle', 0.09, 520);
      case 'bucket':
        return this.tone(1300, event.delay, 'sine', 0.06, 420);
      case 'splash':
        this.noise(0.35, 0.3, 2600, 500, 'lowpass');
        return this.arpeggio([7, 12, 19], 0.05, 'triangle', 0.14);
      case 'potato':
        // A new bomb hisses as its fuse is lit; a pass is a quick blip up.
        if (event.from === null) {
          this.noise(0.45, 0.22, 6000, 1800, 'highpass');
          return this.tone(180, 0.3, 'triangle', 0.2, 360);
        }
        return this.tone(700, 0.09, 'square', 0.1, 1050);
      case 'potatoBoom':
        return this.boom(tuning.potato.blastRadius, 1);
      case 'watch': {
        const context = this.context;
        if (!context) return;
        if (event.phase === 'watch') {
          // The cat has turned: one hard, low note.
          this.sample(['hit1', 'hit2'], 0.5);
          return this.tone(NOTE(-5), 0.35, 'square', 0.18, NOTE(-12));
        }
        // The song: a patter of notes for its words, then one, two, three, each higher, in step with the count on screen.
        const patter = [0, 0, 4, 4, 7, 4];
        patter.forEach((semitone, index) => this.tone(NOTE(semitone), 0.09, 'triangle', 0.1, undefined, undefined, context.currentTime + (index / patter.length) * event.seconds * 0.36));
        [0.4, 0.6, 0.8].forEach((share, index) => this.tone(NOTE(7 + index * 2 + (index === 2 ? 1 : 0)), 0.16, 'square', 0.14, undefined, undefined, context.currentTime + share * event.seconds));
        return;
      }
      case 'caught':
        return this.tone(330, 0.32, 'sawtooth', 0.13, 110);
      case 'reveal':
        // The reel stops: a bright rising run. The announcer names the game over it.
        this.duck(1.2);
        return this.arpeggio([0, 7, 12, 16, 19, 24], 0.07, 'square', 0.17);
      case 'finale':
        if (event.place !== 1) {
          this.sample(['hit1', 'hit2'], 0.6);
          return this.arpeggio(event.place === 3 ? [0, 4, 7] : [4, 7, 12], 0.09, 'square', 0.16);
        }
        // The winner: a thump, a long fanfare, and the announcer.
        this.noise(0.7, 0.45, 2400, 90, 'lowpass');
        this.tone(98, 0.6, 'sine', 0.5, 40);
        this.arpeggio([0, 4, 7, 12, 7, 12, 16, 19, 16, 19, 24, 28, 31, 36], 0.1, 'square', 0.19);
        return this.announce('champion');
      default:
        return;
    }
  }

  /** The roulette between games: ticks that start fast and slow to a stop as the reel does. */
  private roulette(seconds: number): void {
    const context = this.context;
    if (!context) return;
    // The reel stops a moment before the card: each tick's gap is longer than the last, and together they fill the spin up to there.
    const landing = motion.landing.ms / 1000;
    const spin = seconds - landing;
    const ticks = 16;
    const total = (ticks * (ticks + 1)) / 2;
    const start = context.currentTime;
    let at = start;
    for (let index = 1; index <= ticks; index++) {
      this.tone(1100 - index * 22, 0.04, 'square', 0.08, undefined, undefined, at);
      at += (spin * index) / total;
    }
    // It lands: a bright note on the picture it stopped on, and the curtain closing over the old world with a rush of air.
    this.tone(NOTE(19), 0.22, 'triangle', 0.16, NOTE(24), undefined, start + spin);
    this.noise(motion.iris.ms / 1000, 0.16, 500, 2600, 'bandpass', undefined, start + seconds - motion.iris.ms / 1000);
  }

  /** The places of a round coming up one after another: a tick each, rising, in step with the list on screen. */
  private countRows(rows: number): void {
    const context = this.context;
    if (!context) return;
    const first = context.currentTime + (motion.roundResults.delayMs + motion.popIn.ms) / 1000;
    for (let index = 0; index < rows; index++) this.tone(NOTE(7 + index * 2), 0.08, 'triangle', 0.1, undefined, undefined, first + (index * motion.roundResults.staggerMs) / 1000);
  }

  /** A snare roll that swells for as long as the winner is kept secret. */
  private drumRoll(seconds: number): void {
    const context = this.context;
    if (!context) return;
    this.duck(seconds);
    const gap = 0.055;
    for (let index = 0; index * gap < seconds; index++) {
      const progress = (index * gap) / seconds;
      this.noise(0.05, 0.08 + progress * 0.22, 1800, 700, 'bandpass', undefined, context.currentTime + index * gap);
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
    if (chain >= 2) this.announce('kaboom');
  }

  /** Pulls the music down for a moment so the important sound cuts through. */
  private duck(seconds: number): void {
    const context = this.context;
    if (!context) return;
    this.music.gain.cancelScheduledValues(context.currentTime);
    this.music.gain.setTargetAtTime(0.04, context.currentTime, 0.03);
    this.music.gain.setTargetAtTime(0.16, context.currentTime + seconds, 0.25);
  }

  /**
   * The announcer shouts a line. The countdown numbers stay quiet while another line is still being
   * said; everything else is said at once, over whatever is ringing.
   */
  announce(line: Line): void {
    const context = this.context;
    if (!context || this.muted) return;
    const now = context.currentTime;
    if (QUIET_LINES.has(line) && now < this.announcerBusyUntil) return;
    const buffer = this.lines.get(line);
    // No recording yet. If the file is missing for good the computer's own voice says the line, dry. If it is
    // only still loading (a match started the moment sound was allowed) the line is skipped: the announcer
    // has one voice, and a first line in another, a moment before his own arrives, sounds like a fault.
    if (!buffer) {
      if (this.missing.has(line)) this.say(strings.announcer[line]);
      return;
    }

    const seconds = buffer.duration / ANNOUNCER.depth;
    this.announcerBusyUntil = now + seconds;
    for (const [rate, delay, level] of [[ANNOUNCER.depth, 0, 1], [ANNOUNCER.depth * ANNOUNCER.doubleDetune, ANNOUNCER.doubleDelay, ANNOUNCER.doubleLevel]] as const) {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      gain.gain.value = level;
      source.connect(gain).connect(this.announcer);
      source.start(now + delay);
    }
    if (BIG_LINES.has(line)) {
      // A drop into the floor and a burst of air under the first syllable.
      this.tone(70, 0.7, 'sine', 0.6, 28);
      this.noise(0.35, 0.25, 900, 120, 'lowpass');
    }
    // The music gets out of the way for the line and most of its tail.
    this.duck(seconds + 0.8);
  }

  /** Builds the chain every announcer line runs through. See ANNOUNCER for what each stage is for. */
  private buildAnnouncer(context: AudioContext): void {
    this.announcer = context.createGain();
    const rumbleCut = context.createBiquadFilter();
    rumbleCut.type = 'highpass';
    rumbleCut.frequency.value = 90;
    const body = context.createBiquadFilter();
    body.type = 'lowshelf';
    body.frequency.value = 190;
    body.gain.value = 6;
    const presence = context.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2800;
    presence.Q.value = 0.9;
    presence.gain.value = 5;

    // Grit: a soft clip, the same curve a megaphone or an overdriven desk gives.
    const drive = context.createGain();
    drive.gain.value = ANNOUNCER.grit;
    const saturator = context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let index = 0; index < curve.length; index++) curve[index] = Math.tanh((index / (curve.length - 1)) * 2 - 1);
    saturator.curve = curve;
    saturator.oversample = '4x';
    const squash = context.createDynamicsCompressor();
    squash.threshold.value = -26;
    squash.ratio.value = 9;
    squash.attack.value = 0.003;
    squash.release.value = 0.14;

    // The hall: three seconds of decaying noise, different in each ear, heard after a short gap.
    const hall = context.createConvolver();
    const length = Math.floor(context.sampleRate * ANNOUNCER.hallSeconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    const gap = Math.floor(context.sampleRate * 0.025);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let index = gap; index < length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2.6;
    }
    hall.buffer = impulse;
    const hallLevel = context.createGain();
    hallLevel.gain.value = ANNOUNCER.hallLevel;

    // The echo: the line bounces back, darker each time.
    const echo = context.createDelay(1);
    echo.delayTime.value = ANNOUNCER.echoSeconds;
    const echoBack = context.createGain();
    echoBack.gain.value = ANNOUNCER.echoFeedback;
    const echoDull = context.createBiquadFilter();
    echoDull.type = 'lowpass';
    echoDull.frequency.value = 2400;
    const echoLevel = context.createGain();
    echoLevel.gain.value = ANNOUNCER.echoLevel;

    const out = context.createGain();
    out.gain.value = ANNOUNCER.level;
    this.announcer.connect(rumbleCut).connect(body).connect(presence).connect(drive).connect(saturator).connect(squash);
    squash.connect(out);
    squash.connect(hall).connect(hallLevel).connect(out);
    squash.connect(echo).connect(echoDull).connect(echoLevel).connect(out);
    echoDull.connect(echoBack).connect(echo);
    out.connect(this.master);
  }

  /** The computer's own Portuguese voice, with no effects: only for a line that has no recording. */
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
    if (!context || !this.synth || context.state !== 'running') return;
    const song = SONGS[this.synth];
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
      if (this.synth === 'battle' && count === 4) this.noise(0.13, 0.55, 2400, 1100, 'bandpass', this.music, this.nextNoteAt);
      this.nextNoteAt += beat;
      this.step++;
    }
  }

  dispose(): void {
    clearInterval(this.scheduler);
    for (const track of this.tracks.values()) track.element.pause();
    speechSynthesis.cancel();
    void this.context?.close();
  }
}
