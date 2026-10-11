// Runs the game on the host: the fixed-rate loop, who sits where, when a match starts and ends,
// and keeping the stage, the sound, the HUD and every phone in step with the simulation.
import { Game, initPhysics, InputBuffer, PLAYABLE_MODES, POWERS, tuning, type BotStyle, type GameEvent, type GameMode, type SeatSetup } from '@boom/game';
import { MAX_SEATS, type PadButton, type PhoneMode, type PhoneStatus, type PowerCard, type SeatInfo } from '@boom/protocol';
import { motion } from '../../shared/motion';
import { PET_IDS, type PetId } from '../../shared/pets';
import { AWARD_ICON, CAUSE_ICON, EMOTES, POWER_ICON, TIER_COLOR } from '../../shared/powers';
import { CALL_ICON, COUNT_SUFFIX, FLAVORS, GAME_A, GAME_ICON, GAME_LINE } from '../../shared/games';
import { strings } from '../../shared/strings.pt-BR';
import { colors, seats } from '../../shared/tokens';
import { AudioEngine } from '../audio/AudioEngine';
import type { Nameplates } from '../hud/Nameplates';
import { hud, type FeedItem, type FeedWho, type Options, type PlayerCard, type PowerNote } from '../hud/store';
import { HostSocket, type PhoneRequest } from '../net/HostSocket';
import { isPetId, loadPets } from '../render/assets';
import { loadModels } from '../render/models';
import { GameStage } from '../stages/GameStage';
import { PlaytestLog } from './PlaytestLog';

const STEP = tuning.STEP;
const OPTIONS_KEY = 'boom.options';
// The number goes up when the controls change, so everyone sees the hints once more.
const TUTORIAL_KEY = 'boom.tutorialSeen.2';
const TIP_MS = 7000;
/** What a bot behind the title does when the menu selection moves. */
const MENU_LOOKS = ['👀', '👋', '😎', '🤔'];
const POWER_NOTE_MS = 4500;
/** Seconds between "everyone is ready" and the match starting, so a slip of the thumb can be undone. */
const AUTO_START = 3;
/** Seconds into a round of a simple game that the phone still shows the game's one line. */
const REMIND_SECONDS = 4;
const HUD_EVERY_MS = 180;
/** How long a line stays in the event feed. Matches the feed's enter-and-leave animation. */
const FEED_MS = motion.feed.ms;
const FEED_LINES = 4;
/** The bots that brawl behind the title screen. */
const DEMO_STYLES: readonly BotStyle[] = ['kamikaze', 'thrower', 'coward', 'kamikaze'];

type Choice = { pet: PetId; ready: boolean };

function stored<Value>(key: string, fallback: Value): Value {
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Value>) };
  } catch {
    return fallback;
  }
}

export class Session {
  readonly audio = new AudioEngine();
  private readonly input = new InputBuffer();
  private readonly socket: HostSocket | null;
  private readonly stage: GameStage;
  private readonly nameplates: Nameplates;
  private readonly log = new PlaytestLog();
  private readonly choices = new Map<number, Choice>();
  private readonly sent = new Map<number, string>();
  private game: Game | null = null;
  private seed = (Date.now() & 0x7fffffff) || 1;
  private frameHandle = 0;
  private last = 0;
  private pending = 0;
  private hudAt = 0;
  private latencyAt = 0;
  private autoStartAt: number | null = null;
  private tipUntil = 0;
  private disposed = false;
  private readonly unsubscribe: () => void;
  private roster: SeatInfo[] = [];
  private room: string | null = null;
  private readonly demoPets = [...PET_IDS].sort(() => Math.random() - 0.5).slice(0, DEMO_STYLES.length);
  private feed: (FeedItem & { until: number })[] = [];
  private feedId = 0;
  private banner: { seat: number; text: string } | null = null;
  /** Points each seat has made in the round being played, for the list at its end. */
  private readonly gained = new Map<number, number>();
  /** The curtain is being kept shut for something started by a key (back to the lobby, a rematch). */
  private curtainHeld = false;
  private powerNote: (PowerNote & { until: number }) | null = null;
  private matchesStarted = 0;
  /** The seats that won the match, once the finale has named them. */
  private champions = new Set<number>();
  /** The games to play, in order, when the address bar names them (`?modes=lava,race`). For tests and for trying one game. */
  private readonly forcedModes: GameMode[] | undefined;

  /** `solo` runs without phones (bots only) and never touches the relay, for testing beside a real session. */
  constructor(stageHost: HTMLElement, nameplates: Nameplates, options: { autostart: boolean; solo: boolean; modes?: string[] }) {
    this.nameplates = nameplates;
    const modes = (options.modes ?? []).filter((mode): mode is GameMode => (PLAYABLE_MODES as readonly string[]).includes(mode));
    this.forcedModes = modes.length > 0 ? modes : undefined;
    this.socket = options.solo ? null : new HostSocket(this.input);
    if (options.solo) hud.set({ connection: 'solo' });
    this.stage = new GameStage(stageHost, nameplates);
    hud.set({ options: stored<Options>(OPTIONS_KEY, hud.get().options) });
    this.applyOptions();
    if (this.socket) this.socket.onRequest = request => this.onRequest(request);
    this.unsubscribe = hud.subscribe(() => {
      const state = hud.get();
      if (state.seats !== this.roster) this.onRoster(state.seats);
      if (state.room !== this.room) {
        this.room = state.room;
        this.stage.setRoom(state.room);
      }
    });

    // The bar fills with whichever of the two lots of models is further behind.
    const loaded = { pets: 0, models: 0 };
    const progress = (part: keyof typeof loaded) => (done: number) => {
      loaded[part] = done;
      hud.set({ loadProgress: Math.min(loaded.pets, loaded.models) });
    };
    void Promise.all([initPhysics(), loadPets(progress('pets')), loadModels(progress('models'))]).then(() => {
      if (this.disposed) return;
      this.game = new Game(this.seed);
      this.stage.setGame(this.game);
      this.stage.setTitle(hud.get().title);
      // It starts with the first key press, which is when the browser allows sound.
      if (hud.get().title) this.audio.setSong('title');
      // For tests and the browser console.
      if (import.meta.env.DEV) Object.assign(window, { __BOOM__: { game: this.game, session: this, skip: (seconds: number) => this.skip(seconds) } });
      hud.set({ loading: false });
      this.onRoster(hud.get().seats);
      if (options.autostart) {
        this.dismissTitle();
        this.startMatch();
      }
      this.frameHandle = requestAnimationFrame(this.frame);
    });
  }

  /** Called twice a second with the measured frame rate. */
  set onStats(listener: (fps: number) => void) {
    this.stage.onStats = listener;
  }

  // ── Commands from the HUD and keyboard ─────────────────────────────────────

  /** Browsers keep sound off until the first key or click. Any of them on the title screen counts. */
  wake(): void {
    this.audio.unlock();
  }

  /** The selection moved in the main menu: a click, and one of the bots brawling behind it looks up. */
  menuMoved(): void {
    this.audio.click();
    const bots = this.game?.seats.filter(seat => seat.bot !== null) ?? [];
    const bot = bots[Math.floor(Math.random() * bots.length)];
    if (bot) this.stage.emote(bot.seat, MENU_LOOKS[Math.floor(Math.random() * MENU_LOOKS.length)]!);
  }

  /** "Jogar" in the main menu: leaves the title screen for the lobby. */
  dismissTitle(): void {
    this.audio.unlock();
    if (!hud.get().title || !this.game) return;
    hud.set({ title: false });
    this.audio.setSong('lobby');
    this.audio.click();
    this.audio.announce('brand');
    // The demo bots leave in puffs of smoke and the camera settles on the lobby.
    this.stage.setTitle(false);
    this.game.setLobbySeats(this.lobbySeats());
    this.refreshNames();
  }

  setOptions(change: Partial<Options>): void {
    const options = { ...hud.get().options, ...change };
    hud.set({ options });
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    } catch {
      // Private browsing: the options just are not remembered.
    }
    this.applyOptions();
    this.audio.click();
  }

  startMatch(): void {
    const game = this.game;
    if (!game || (game.phase !== 'lobby' && game.phase !== 'matchEnd')) return;
    // A rematch: the podium's stage is cleared away behind the curtain first.
    if (game.phase === 'matchEnd' && !this.curtainHeld) return this.behindCurtain(() => this.startMatch());
    if (game.phase === 'matchEnd') game.returnToLobby();
    const options = hud.get().options;
    // With nobody on a phone there is nothing to play unless bots fill in.
    if (this.roster.length === 0 && !options.bots) return;
    game.setLobbySeats(this.lobbySeats());
    this.autoStartAt = null;
    for (const choice of this.choices.values()) choice.ready = false;
    this.seed = (this.seed * 48271) % 0x7fffffff || 1;
    // A list of games in the address bar is played once through, whatever the rounds option says.
    game.startMatch({ rounds: this.forcedModes?.length ?? options.rounds, bots: options.bots, petPool: PET_IDS, botName: index => `Robô ${index + 1}`, modes: this.forcedModes });
    this.log.begin(game, this.seed);
    // Starting a match already says something (the first intro) before any tick, and it must be heard.
    for (const event of game.events) this.onEvent(event);
    // The two battle themes take turns, one match each, from the top.
    this.audio.setSong(this.matchesStarted++ % 2 === 0 ? 'battleA' : 'battleB', true);
    this.refreshNames();
  }

  backToLobby(): void {
    const game = this.game;
    if (!game || game.phase === 'lobby') return;
    if (!this.curtainHeld) return this.behindCurtain(() => this.backToLobby());
    game.returnToLobby();
    for (const event of game.events) this.onEvent(event);
    game.setLobbySeats(this.lobbySeats());
    this.audio.setSong('lobby');
    this.refreshNames();
  }

  /** Keys 1 to 6 buzz that seat's phone: a quick way to check which phone is which. */
  buzz(seat: number): void {
    this.socket?.send(seat, { t: 'haptic', pattern: 'hit' });
  }

  setInsets(left: number, bottom: number, top: number): void {
    this.stage.setInsets(left, bottom, top);
  }

  portrait(model: string): string {
    return this.game && isPetId(model) ? this.stage.portrait(model) : '';
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.unsubscribe();
    this.socket?.close();
    this.audio.dispose();
    this.game?.round.free();
    this.stage.dispose();
  }

  // ── Seats ──────────────────────────────────────────────────────────────────

  private applyOptions(): void {
    const options = hud.get().options;
    this.stage.setReduced(options.reduced);
    this.audio.setMuted(options.muted);
  }

  private onRoster(roster: SeatInfo[]): void {
    const game = this.game;
    const before = new Set(this.roster.map(seat => seat.seat));
    const wasConnected = new Set(this.roster.filter(seat => seat.connected).map(seat => seat.seat));
    this.roster = roster;
    // A phone that just (re)connected knows nothing yet: forget what was last sent so it gets its screen again.
    for (const seat of roster) if (seat.connected && !wasConnected.has(seat.seat)) this.sent.delete(seat.seat);
    const present = new Set(roster.map(seat => seat.seat));
    for (const seat of [...this.choices.keys()]) if (!present.has(seat)) this.choices.delete(seat);
    for (const seat of roster) {
      if (!this.choices.has(seat.seat)) this.choices.set(seat.seat, { pet: this.freePet(null), ready: false });
    }
    if (!game) return;
    if (game.phase === 'lobby') game.setLobbySeats(this.lobbySeats());
    // A seat that timed out mid-match is played by a bot from here on.
    else for (const seat of before) if (!present.has(seat)) game.handToBot(seat);
    this.stage.setAsleep(roster.filter(seat => !seat.connected).map(seat => seat.seat));
    this.refreshNames();
    this.checkAutoStart();
  }

  private lobbySeats(): SeatSetup[] {
    const humans: SeatSetup[] = this.roster.map(seat => ({ seat: seat.seat, pet: this.choices.get(seat.seat)?.pet ?? 'fox', name: seat.name, bot: null }));
    // Bots brawl behind the title, and two stay to keep the lobby alive until the first player joins.
    // They take the seats nobody has, highest first (phones fill from the lowest).
    const wanted = hud.get().title ? DEMO_STYLES.length : humans.length === 0 ? 2 : 0;
    const demo: SeatSetup[] = [];
    for (let seat = MAX_SEATS - 1; seat >= 0 && demo.length < wanted; seat--) {
      if (humans.some(human => human.seat === seat)) continue;
      demo.push({ seat, pet: this.demoPets[demo.length]!, name: '', bot: DEMO_STYLES[demo.length]! });
    }
    return [...humans, ...demo];
  }

  /** A pet nobody else has. With `after`, the next free one in that direction, for the phone's arrows. */
  private freePet(current: PetId | null, direction: -1 | 1 = 1): PetId {
    const taken = new Set([...this.choices.values()].map(choice => choice.pet));
    if (current === null) {
      const free = PET_IDS.filter(pet => !taken.has(pet));
      return free[Math.floor(Math.random() * free.length)] ?? 'fox';
    }
    let index = PET_IDS.indexOf(current);
    for (let tries = 0; tries < PET_IDS.length; tries++) {
      index = (index + direction + PET_IDS.length) % PET_IDS.length;
      if (!taken.has(PET_IDS[index]!)) return PET_IDS[index]!;
    }
    return current;
  }

  private onRequest(request: PhoneRequest): void {
    const game = this.game;
    const choice = this.choices.get(request.seat);
    if (!game || !choice) return;
    if (request.t === 'emote') {
      const emoji = EMOTES[request.id];
      if (emoji) this.stage.emote(request.seat, emoji);
      return;
    }
    if (game.phase !== 'lobby' && game.phase !== 'matchEnd') return;
    if (request.t === 'pet' && game.phase === 'lobby') {
      choice.pet = this.freePet(choice.pet, request.dir);
      game.setLobbySeats(this.lobbySeats());
      this.audio.click();
    } else if (request.t === 'ready') {
      choice.ready = request.ready;
      this.audio.click();
      if (request.ready) this.stage.cheer(request.seat, '👍');
      this.checkAutoStart();
    }
  }

  /** When every connected player is ready, the match starts by itself after a short count. */
  private checkAutoStart(): void {
    const connected = this.roster.filter(seat => seat.connected);
    const allReady = connected.length > 0 && connected.every(seat => this.choices.get(seat.seat)?.ready);
    const waiting = this.game?.phase === 'lobby' || this.game?.phase === 'matchEnd';
    if (allReady && waiting) this.autoStartAt ??= performance.now() + AUTO_START * 1000;
    else this.autoStartAt = null;
  }

  private refreshNames(): void {
    const game = this.game;
    // Demo bots (behind the title and in an empty lobby) have no name tags.
    const bots: SeatInfo[] = (game?.phase === 'lobby' ? [] : (game?.seats ?? [])).filter(seat => seat.bot !== null && !this.roster.some(human => human.seat === seat.seat)).map(seat => ({ seat: seat.seat, name: seat.name, connected: true, rtt: null, holdMsLeft: null }));
    this.stage.setNames([...this.roster, ...bots], hud.get().rosterAt);
    this.nameplates.setCrown(game?.bounty ?? null);
  }

  // ── The loop ───────────────────────────────────────────────────────────────

  private readonly frame = (now: number): void => {
    this.frameHandle = requestAnimationFrame(this.frame);
    const game = this.game;
    if (!game) return;
    // After a hidden tab or a hitch, catch up by at most a tenth of a second rather than fast-forwarding.
    const dt = Math.min((now - (this.last || now)) / 1000, 0.1);
    this.last = now;
    this.pending += dt;

    if (this.autoStartAt !== null && now >= this.autoStartAt) this.startMatch();

    let ticks = 0;
    while (this.pending >= STEP && ticks < 6) {
      this.pending -= STEP;
      ticks++;
      game.tick(seat => {
        const input = this.input.sample(seat, now);
        if (game.phase === 'play') this.log.sampleInput(seat, input, game.round.gameMode === 'frita' && game.round.rules.phase === 'watch');
        return input;
      });
      for (const event of game.events) this.onEvent(event);
    }
    if (ticks === 6) this.pending = 0;

    // How far into the next physics step this frame is drawn.
    const alpha = Math.min(1, game.stepFraction + (this.pending / STEP) * game.dilation);
    this.audio.update(game);
    this.stage.frame(dt, alpha, now);
    this.syncCurtain(game);

    if (now - this.hudAt >= HUD_EVERY_MS) {
      this.hudAt = now;
      this.syncHud(now);
      this.syncPhones();
    }
    if (now - this.latencyAt >= 2000) {
      this.latencyAt = now;
      if (game.phase === 'play') this.log.sampleLatency(this.roster);
    }
  };

  /** Development only: plays `seconds` of game at once, to reach a later moment quickly. */
  private skip(seconds: number): void {
    const game = this.game!;
    for (let tick = 0; tick < seconds * 60; tick++) {
      game.tick(seat => this.input.sample(seat, performance.now()));
      for (const event of game.events) this.onEvent(event);
    }
  }

  /** Shuts the curtain, does something that changes the world, and lets the curtain open again once the new world is drawn. */
  private behindCurtain(action: () => void): void {
    if (this.curtainHeld) return;
    this.curtainHeld = true;
    hud.set({ curtain: true });
    window.setTimeout(() => {
      if (this.disposed) return;
      action();
      this.curtainHeld = false;
    }, motion.iris.ms);
  }

  /**
   * The curtain shuts just before the world changes behind it (as the roulette stops, and as the last round's
   * end gives way to the podium), on the simulation's clock, and opens only once the new world has been drawn.
   */
  private syncCurtain(game: Game): void {
    const changing = (game.phase === 'intro' && !game.revealed) || (game.phase === 'roundEnd' && game.isFinalRound);
    const shutting = changing && game.phaseLeft <= motion.iris.ms / 1000;
    const shut = this.curtainHeld || shutting || (hud.get().curtain && !this.stage.settled);
    if (shut !== hud.get().curtain) hud.set({ curtain: shut });
  }

  private onEvent(event: GameEvent): void {
    const game = this.game!;
    this.stage.handle(event);
    this.audio.handle(event);
    this.log.handle(event, game);

    switch (event.t) {
      case 'score':
        this.gained.set(event.seat, (this.gained.get(event.seat) ?? 0) + event.points);
        break;
      case 'dashHit':
        this.socket?.send(event.seat, { t: 'haptic', pattern: 'tap' });
        for (const id of event.victims) {
          const seat = game.round.petById(id)?.seat;
          if (seat !== undefined) this.socket?.send(seat, { t: 'haptic', pattern: 'hit' });
        }
        break;
      case 'dash':
      case 'dashEnd':
      case 'throw':
        // The phone shows A resting after a dash and what B would do, so it hears of these at once, not at the next refresh.
        this.syncPhones();
        break;
      case 'grab':
        if (event.kind === 'pet') {
          const grabber = game.round.petById(event.pet)?.seat;
          const grabbed = game.round.petById(event.target)?.seat;
          if (grabber !== undefined) this.socket?.send(grabber, { t: 'haptic', pattern: 'tap' });
          if (grabbed !== undefined) this.socket?.send(grabbed, { t: 'haptic', pattern: 'hit' });
        }
        this.syncPhones();
        break;
      case 'powerReady':
        this.socket?.send(event.seat, { t: 'haptic', pattern: 'warn' });
        this.notePower(event.seat, event.power, 'ready');
        this.syncPhones();
        break;
      case 'powerStart': {
        // A power someone chose to use was explained when they got it. One that starts by itself is explained now.
        const tier = POWERS[event.power].tier;
        if (tier === 'cursed' || tier === 'superCurse') this.notePower(event.seat, event.power, 'cursed');
        else if (tier === 'super') this.notePower(event.seat, event.power, 'on');
        this.syncPhones();
        break;
      }
      case 'eliminated':
        if (event.decoy) break;
        this.socket?.send(event.seat, { t: 'haptic', pattern: 'boom' });
        // Who knocked out whom, and how. A fall of one's own making has no "by".
        // The round may already have ended on this very knockout, so "in a match" is the test, not "still playing".
        if (game.phase === 'play' || game.phase === 'roundEnd') this.pushFeed(event.killer === null ? null : this.who(event.killer), CAUSE_ICON[event.cause], this.who(event.seat), null);
        break;
      case 'gachaStart':
        this.socket?.send(event.seat, { t: 'haptic', pattern: 'warn' });
        break;
      case 'roundWinner': {
        for (const seat of event.seats) this.socket?.send(seat, { t: 'haptic', pattern: 'win' });
        const first = event.seats[0];
        this.banner = first === undefined ? null : { seat: first, text: event.seats.length === 1 ? strings.hud.roundTo(this.who(first).name) : strings.hud.roundTie };
        // The places of the round, best first, with what the round paid each player. Seats that tied share a place.
        let place = 1;
        const rows = game.round.ranking().flatMap(group => {
          const shared = place;
          place += group.length;
          return group.map(seat => {
            const count = game.round.metric(seat);
            return { seat, name: this.who(seat).name, place: shared, points: this.gained.get(seat) ?? 0, count: typeof count === 'number' ? count : null };
          });
        });
        hud.set({ roundResult: { mode: game.gameMode, double: game.isFinalRound && game.rounds > 1, rows } });
        this.syncPhones();
        break;
      }
      case 'bounty':
        this.nameplates.setCrown(event.seat);
        break;
      case 'colorCall':
        // The colour is named aloud, and every pad shows it at once.
        this.audio.announce(FLAVORS[event.color]!.line);
        hud.set({ call: { icon: FLAVORS[event.color]!.icon, name: strings.alerts.flavors[event.color]!, color: FLAVORS[event.color]!.color } });
        this.syncPhones();
        break;
      case 'colorDrop':
      case 'colorShow':
        hud.set({ call: null });
        this.syncPhones();
        break;
      case 'potato':
        // The bomb changed hands: the new holder feels it, and the screen names them.
        this.socket?.send(event.holder, { t: 'haptic', pattern: 'warn' });
        hud.set({ call: { icon: CALL_ICON.bomb, name: this.who(event.holder).name, color: seats[event.holder % seats.length]!.color, seat: event.holder } });
        this.syncPhones();
        break;
      case 'potatoBoom':
        hud.set({ call: null });
        this.syncPhones();
        break;
      case 'watch':
        // The cat turned, one way or the other: every pad says so at once.
        if (event.phase === 'watch') this.socket?.send('all', { t: 'haptic', pattern: 'tap' });
        hud.set({ call: event.phase === 'sing' ? { icon: CALL_ICON.sing, name: strings.alerts.fritaGo, color: colors.go } : { icon: CALL_ICON.watch, name: strings.alerts.fritaStop, color: colors.danger } });
        this.syncPhones();
        break;
      case 'caught':
        this.socket?.send(event.seat, { t: 'haptic', pattern: 'hit' });
        break;
      case 'finish':
        this.socket?.send(event.seat, { t: 'haptic', pattern: 'win' });
        this.pushFeed(this.who(event.seat), '🏁', null, strings.hud.place(event.place));
        break;
      case 'swept': {
        const swept = game.round.petById(event.pet)?.seat;
        if (swept !== undefined) this.socket?.send(swept, { t: 'haptic', pattern: 'hit' });
        break;
      }
      case 'bite': {
        const bitten = game.round.petById(event.victim)?.seat;
        this.socket?.send(event.seat, { t: 'haptic', pattern: 'tap' });
        if (bitten !== undefined) this.socket?.send(bitten, { t: 'haptic', pattern: 'hit' });
        break;
      }
      case 'lava':
        // The alarm is felt in every hand, and the pad says what to do at once, not at the next refresh.
        if (event.phase === 'alarm') {
          this.socket?.send('all', { t: 'haptic', pattern: 'warn' });
          this.audio.announce('lavaWarn');
        }
        // The same card that names a called colour or what the cat is doing says where the lava is.
        hud.set({ call: event.phase === 'calm' ? null : event.phase === 'alarm' ? { icon: CALL_ICON.lavaWarn, name: strings.words3d.lavaWarn, color: colors.gold } : { icon: CALL_ICON.lava, name: strings.words3d.lava, color: colors.danger } });
        this.syncPhones();
        break;
      case 'reveal':
        // The roulette has stopped: the card, the phones and the announcer all name the game.
        hud.set({ gameMode: event.mode, intro: { mode: event.mode, upcoming: null, final: event.final } });
        this.audio.announce(GAME_LINE[event.mode]);
        this.refreshNames();
        this.syncHud(performance.now());
        this.syncPhones();
        break;
      case 'finale':
        if (event.place !== 1) break;
        hud.set({ finale: { winners: event.seats.map(seat => this.who(seat)) } });
        this.champions = new Set(event.seats);
        this.syncPhones();
        for (const seat of event.seats) this.socket?.send(seat, { t: 'haptic', pattern: 'win' });
        // The game's own theme is the victory lap.
        this.audio.setSong('title', true);
        break;
      case 'revengeSwap':
        this.pushFeed(this.who(event.ghost), '👻', this.who(event.victim), null);
        break;
      case 'gachaReveal':
        this.pushFeed(this.who(event.seat), POWER_ICON[event.power], null, event.cursed ? strings.tiers.superCurse : strings.powers[event.power]);
        break;
      case 'phase':
        if (event.phase !== 'play') hud.set({ call: null });
        if (event.phase === 'play') this.gained.clear();
        if (event.phase !== 'roundEnd') hud.set({ roundResult: null });
        if (event.phase === 'intro') {
          hud.set({ intro: { mode: null, upcoming: game.upcoming, final: game.isFinalRound } });
          // The last round counts double, and gets its own track from here on.
          if (game.isFinalRound && game.rounds > 1) {
            this.audio.setSong('final', true);
            this.audio.announce('finalRound');
          } else this.audio.announce('nextGame');
        } else if (event.phase === 'countdown') hud.set({ intro: null });
        else if (event.phase === 'finale') {
          hud.set({ finale: { winners: [] } });
          this.champions = new Set();
          this.audio.setSong(null);
        }
        if (event.phase === 'play' && event.round === 1 && game.gameMode === 'brawl' && !localStorage.getItem(TUTORIAL_KEY)) {
          // First ever match: three short hints, one after the other.
          localStorage.setItem(TUTORIAL_KEY, '1');
          this.tipUntil = performance.now() + TIP_MS * 3;
        }
        if (event.phase === 'matchEnd') {
          hud.set({ finale: null });
          // A solo run is a test beside a real session: its bot matches do not belong among the playtests.
          if (this.socket) this.log.save(game);
        } else if (event.phase === 'lobby') hud.set({ intro: null, finale: null, gameMode: 'brawl' });
        this.refreshNames();
        this.syncHud(performance.now());
        this.syncPhones();
        break;
      default:
        break;
    }
  }

  private who(seat: number): FeedWho {
    return { seat, name: this.game?.seats.find(candidate => candidate.seat === seat)?.name ?? '' };
  }

  private powerCard(power: keyof typeof POWERS): PowerCard {
    return { icon: POWER_ICON[power], name: strings.powers[power], hint: strings.powerHints[power], color: TIER_COLOR[POWERS[power].tier] };
  }

  private notePower(seat: number, power: keyof typeof POWERS, state: PowerNote['state']): void {
    if (this.game?.phase !== 'play') return;
    this.powerNote = { id: this.feedId++, who: this.who(seat), state, ...this.powerCard(power), until: performance.now() + POWER_NOTE_MS };
    hud.set({ powerNote: this.powerNote });
  }

  private pushFeed(by: FeedWho | null, icon: string, target: FeedWho | null, text: string | null): void {
    // A new array each time, so the HUD sees the change.
    this.feed = [...this.feed, { id: this.feedId++, by, icon, target, text, until: performance.now() + FEED_MS }].slice(-FEED_LINES);
    hud.set({ feed: this.feed });
  }

  // ── HUD and phones ─────────────────────────────────────────────────────────

  private syncHud(now: number): void {
    const game = this.game!;
    const connected = new Map(this.roster.map(seat => [seat.seat, seat.connected]));
    const inRound = game.phase === 'countdown' || game.phase === 'play' || game.phase === 'roundEnd';
    const players: PlayerCard[] = game.seats.filter(seat => game.phase !== 'lobby' || seat.bot === null).map(seat => {
      const pet = game.round.petOfSeat(seat.seat);
      const metric = game.round.metric(seat.seat);
      return {
        seat: seat.seat,
        name: seat.name,
        portrait: this.portrait(seat.pet),
        bot: seat.bot !== null,
        connected: seat.bot !== null || (connected.get(seat.seat) ?? false),
        ready: this.choices.get(seat.seat)?.ready ?? false,
        score: game.scores.get(seat.seat) ?? 0,
        pity: game.pity.get(seat.seat) ?? 0,
        power: pet?.power ? { icon: POWER_ICON[pet.power], color: TIER_COLOR[POWERS[pet.power].tier], left: pet.powerTotal > 0 ? pet.powerLeft / pet.powerTotal : 0 } : null,
        held: pet?.held ? { icon: POWER_ICON[pet.held], color: TIER_COLOR[POWERS[pet.held].tier] } : null,
        bounty: game.bounty === seat.seat,
        ghost: game.round.ghosts.some(ghost => ghost.seat === seat.seat),
        metric: inRound && metric !== null ? { icon: GAME_ICON[game.gameMode], text: metric === 'hidden' ? '?' : `${metric}${COUNT_SUFFIX[game.gameMode] ?? ''}` } : null,
      };
    });
    const names = new Map(game.seats.map(seat => [seat.seat, seat]));
    const tipLeft = this.tipUntil - now;
    if (this.feed.some(item => item.until <= now)) this.feed = this.feed.filter(item => item.until > now);
    if (game.phase !== 'roundEnd') this.banner = null;
    if (this.powerNote && (this.powerNote.until <= now || game.phase !== 'play')) this.powerNote = null;
    hud.set({
      powerNote: this.powerNote,
      feed: this.feed,
      banner: this.banner,
      phase: game.phase,
      round: game.roundIndex,
      rounds: game.rounds,
      timeLeft: Number.isFinite(game.timeLeft) ? Math.ceil(game.timeLeft) : 0,
      roundCap: Number.isFinite(game.round.cap) ? game.round.cap : 0,
      players,
      startIn: this.autoStartAt === null ? null : Math.max(0, Math.ceil((this.autoStartAt - now) / 1000)),
      tip: game.phase === 'play' && tipLeft > 0 ? (tipLeft > TIP_MS * 2 ? 'dash' : tipLeft > TIP_MS ? 'grab' : 'power') : null,
      results: game.standings.map(entry => ({
        seat: entry.seat,
        name: names.get(entry.seat)?.name ?? '',
        portrait: this.portrait(names.get(entry.seat)?.pet ?? ''),
        score: entry.score,
        place: entry.place,
        award: entry.award ? { icon: AWARD_ICON[entry.award], name: strings.awards[entry.award] } : null,
      })),
    });
  }

  /** What A is on a phone right now. The brawl (and the lobby, which is one) has its dash and its ghost's meteor; every other game says its own. */
  private padA(game: Game, alive: boolean, ghost: boolean): PadButton | null {
    if (game.phase === 'lobby') return { icon: 'A', label: '', charge: true };
    if (game.gameMode === 'brawl') return ghost ? { icon: '☄️', label: strings.controls.meteor, charge: false } : { icon: 'A', label: strings.controls.dash, charge: true };
    const button = GAME_A[game.gameMode];
    return button && alive ? { icon: button.icon, label: strings.controls[button.text], charge: false } : null;
  }

  /** A word across the pad for a moment of the game. Every simple game starts by repeating its one line: there may be no button to read. */
  private padAlert(game: Game, seat: number): PhoneStatus['alert'] {
    // As a round ends every phone says how its own player did: nobody has to find their row on the TV.
    if (game.phase === 'roundEnd') {
      const row = hud.get().roundResult?.rows.find(candidate => candidate.seat === seat);
      return row ? { text: strings.alerts.roundPlace(row.place, row.points), tone: row.place === 1 ? 'go' : 'info', color: null } : null;
    }
    if (game.gameMode === 'brawl' || (game.phase !== 'countdown' && game.phase !== 'play')) return null;
    const round = game.round;
    // Two games cannot wait for the reminder to pass: who has the bomb, and whether the cat is looking.
    if (round.gameMode === 'potato' && round.rules.holder === seat) return { text: strings.alerts.potatoHold, tone: 'danger', color: null };
    if (round.gameMode === 'frita' && game.phase === 'play') {
      if (round.rules.finishers.some(entry => entry.seat === seat)) return null;
      return round.rules.phase === 'sing' ? { text: strings.alerts.fritaGo, tone: 'go', color: null } : { text: strings.alerts.fritaStop, tone: 'stop', color: null };
    }
    if (game.phase === 'countdown' || round.time < REMIND_SECONDS) return { text: strings.games[game.gameMode].line, tone: 'info', color: null };
    if (round.gameMode === 'color' && round.rules.phase !== 'show') {
      const flavor = FLAVORS[round.rules.called]!;
      return { text: `${flavor.icon} ${strings.alerts.flavors[round.rules.called]!}`, tone: 'info', color: flavor.color };
    }
    if (round.gameMode === 'lava' && round.rules.phase !== 'calm') return { text: round.rules.phase === 'alarm' ? strings.alerts.lavaWarn : strings.alerts.lava, tone: 'danger', color: null };
    return null;
  }

  /** The card over a phone's pad between games and before the winner is named. */
  private padCard(game: Game, seat: number): PhoneStatus['card'] {
    if (game.phase === 'intro') {
      if (!game.revealed) return { icon: '🎲', name: strings.intro.next, line: '' };
      return { icon: GAME_ICON[game.gameMode], name: strings.games[game.gameMode].name, line: strings.games[game.gameMode].line };
    }
    if (game.phase !== 'finale') return null;
    if (this.champions.size === 0) return { icon: '🥁', name: strings.finale.drum, line: '' };
    return this.champions.has(seat) ? { icon: '🏆', name: strings.controller.won, line: '' } : null;
  }

  /** Tells each phone what to show. A message goes out only when something in it changed. */
  private syncPhones(): void {
    const game = this.game!;
    for (let seat = 0; seat < MAX_SEATS; seat++) {
      const choice = this.choices.get(seat);
      if (!choice) {
        this.sent.delete(seat);
        continue;
      }
      const playing = game.seats.some(candidate => candidate.seat === seat && candidate.bot === null);
      const pet = game.round.petOfSeat(seat);
      const ghost = game.round.ghosts.find(candidate => candidate.seat === seat);
      const standing = game.standings.find(entry => entry.seat === seat);
      let mode: PhoneMode = 'alive';
      if (game.gacha && game.gacha.cursed === null) mode = game.gacha.seat === seat ? 'lever' : 'jinx';
      else if (pet?.carriedBy != null) mode = 'carried';
      else if (ghost) mode = 'ghost';
      const status: PhoneStatus = {
        t: 'status',
        screen: game.phase === 'lobby' ? 'lobby' : !playing ? 'wait' : game.phase === 'matchEnd' ? 'results' : 'play',
        mode,
        pet: strings.pets[choice.pet],
        ready: choice.ready,
        power: pet?.power ? this.powerCard(pet.power) : null,
        held: pet?.held ? this.powerCard(pet.held) : null,
        b: pet?.carrying ? 'throw' : pet?.grabTarget ? 'grab' : 'idle',
        pity: game.pity.get(seat) ?? 0,
        bounty: game.bounty === seat,
        score: game.scores.get(seat) ?? 0,
        // A ghost's wait is rounded so the message only changes a few times while the meteor recharges.
        // A pet's is the whole rest after its dash, steady until the rest is over.
        cooldownMs: ghost ? Math.ceil(ghost.cooldown * 2) * 500 : pet && pet.dashCooldown > 0 ? Math.round(pet.dashCooldownTotal * 1000) : 0,
        place: standing?.place ?? null,
        award: standing?.award ? { icon: AWARD_ICON[standing.award], name: strings.awards[standing.award] } : null,
        a: this.padA(game, pet !== undefined, ghost !== undefined),
        bOn: game.gameMode === 'brawl',
        card: this.padCard(game, seat),
        alert: this.padAlert(game, seat),
        won: game.phase === 'matchEnd' && standing?.place === 1,
      };
      const encoded = JSON.stringify(status);
      if (this.sent.get(seat) === encoded) continue;
      this.sent.set(seat, encoded);
      this.socket?.send(seat, status);
    }
  }
}
