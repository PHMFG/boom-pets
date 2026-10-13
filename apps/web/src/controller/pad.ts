// The play screen: a joystick that appears under the left thumb, and A and B under the right.
// Built to be used without looking, so every touch on a half counts for that half. What A does,
// and how the pad looks, follows the status the game sends (alive, ghost, carried, lever, ZICA).
// A third button appears only while a power is waiting, with a card that says what the power does.
import type { ButtonName, HapticPattern, PhoneMode, PhoneStatus } from '@boom/protocol';
import { seatShapeSvg } from '../shared/glyphs';
import { motion } from '../shared/motion';
import { EMOTES } from '../shared/powers';
import { strings } from '../shared/strings.pt-BR';
import { seats as seatTokens } from '../shared/tokens';

export type PadEvents = {
  onStick(x: number, y: number): void;
  onButton(button: ButtonName, down: boolean): void;
  onPet(direction: -1 | 1): void;
  onReady(ready: boolean): void;
  onEmote(id: number): void;
};

const DEAD_ZONE = 0.12;
const VIBRATION: Record<HapticPattern, number | number[]> = { tap: 15, hit: 60, warn: [40, 60, 40], boom: [90, 40, 140], win: [30, 40, 30, 40, 80] };
/** Milliseconds of holding A for a full charge, and before the overcharge warning. They match the game's tuning. */
const CHARGE_MS = 1200;
const WARN_AFTER_MS = 1400;
const PITY_PIPS = 6;
/** Pieces of confetti the pad throws when its player wins something, or a power lands on its button. */
const SPARKS = 14;
type ThumbButton = Exclude<ButtonName, 'c'>;
const text = strings.controller;

/** Vibrates if the phone can. Browsers refuse before the first touch, so that case is skipped quietly. */
function vibrate(pattern: number | number[]): void {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  navigator.vibrate?.(pattern);
}

function element(className: string, parent: HTMLElement, content = ''): HTMLElement {
  const created = document.createElement('div');
  created.className = className;
  created.textContent = content;
  parent.append(created);
  return created;
}

const leaving = new WeakMap<HTMLElement, number>();

/**
 * Shows or hides a piece of the pad. Arriving, it pops in by its own rule in the stylesheet; leaving, it
 * squishes out first and only then stops being drawn. Nothing on the pad is cut away.
 */
function present(node: HTMLElement, on: boolean): void {
  if (on === !(node.hidden || node.classList.contains('is-leaving'))) return;
  window.clearTimeout(leaving.get(node));
  node.classList.toggle('is-leaving', !on);
  if (on) node.hidden = false;
  else
    leaving.set(
      node,
      window.setTimeout(() => {
        node.classList.remove('is-leaving');
        node.hidden = true;
      }, motion.squishOut.ms),
    );
}

const lessMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

/**
 * Pops a piece of the pad that changed while it was up, so the change is caught in the corner of an eye.
 * `swell` above 1 is a landing: it swells and settles, where a pop grows from small.
 */
function pop(node: HTMLElement, from = 0.5, swell = 0): void {
  if (lessMotion?.matches || !node.animate) return;
  if (swell) node.animate([{ transform: 'scale(1)' }, { transform: `scale(${swell})`, offset: 0.4 }, { transform: 'scale(1)' }], { duration: motion.landing.ms, easing: 'ease-out' });
  else node.animate([{ transform: `scale(${from})` }, { transform: 'scale(1)' }], { duration: motion.popIn.ms, easing: motion.popIn.css });
}

/** A tappable control drawn over the pad. Marked so the pad itself ignores touches on it. */
function control(className: string, parent: HTMLElement, content: string, onTap: () => void): HTMLElement {
  const created = element(className, parent, content);
  created.dataset.ui = '';
  created.addEventListener('pointerdown', event => {
    event.stopPropagation();
    // It dips under the finger.
    if (!lessMotion?.matches) created.animate?.([{ scale: 1 }, { scale: 0.88 }, { scale: 1 }], { duration: motion.punch.ms * 2 });
    onTap();
  });
  return created;
}

export class Pad {
  private readonly root: HTMLElement;
  private readonly events: PadEvents;
  private readonly shape: HTMLElement;
  private readonly pity: HTMLElement[];
  private readonly crown: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly petName: HTMLElement;
  private readonly readyButton: HTMLElement;
  private readonly lobby: HTMLElement;
  private readonly tray: HTMLElement;
  private readonly emotes: HTMLElement[];
  private readonly sparks: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  /** The two buttons under the right thumb. The power button is a control of its own. */
  private readonly buttons: Record<ThumbButton, HTMLElement>;
  private readonly letter: HTMLElement;
  private readonly does: HTMLElement;
  private readonly next: HTMLElement;
  private readonly nextIcon: HTMLElement;
  private readonly nextName: HTMLElement;
  private readonly nextLine: HTMLElement;
  private readonly alert: HTMLElement;
  private readonly bFace: HTMLElement;
  private readonly use: HTMLElement;
  private readonly useIcon: HTMLElement;
  private readonly card: HTMLElement;
  private readonly cardName: HTMLElement;
  private readonly cardHint: HTMLElement;
  private readonly lever: HTMLElement;
  private readonly leverKnob: HTMLElement;
  private readonly jinx: HTMLElement;
  private readonly results: HTMLElement;
  /** The button on the results, and what the results were built from: they are built once, so they arrive once. */
  private again: HTMLElement | null = null;
  private resultsOf = '';
  /** One-shot animations waiting to be started over, all after a single reading of the layout. */
  private readonly replays: [HTMLElement, string][] = [];
  private status: PhoneStatus | null = null;
  private linkBanner: string | null = null;
  private rotated = false;
  private stickPointer: number | null = null;
  private stickOrigin = { u: 0, v: 0 };
  /** Which button each finger on the right half is holding. */
  private readonly presses = new Map<number, ThumbButton>();
  private usePointer: number | null = null;
  /** performance.now() until which A rests after a dash. */
  private restUntil = 0;
  private restTimer = 0;
  private leverPointer: number | null = null;
  private leverStart = 0;
  private warnTimer = 0;
  private faceTimer = 0;
  private freshTimer = 0;
  private cooldownMs = 0;
  /** What A shows when it is not being held, and whether holding it charges. Both come from the game. */
  private aIcon = 'A';
  private charges = true;
  private jinxTaps = 0;

  constructor(parent: HTMLElement, name: string, events: PadEvents) {
    this.events = events;
    this.root = element('pad', parent);
    this.root.style.setProperty('--charge', `${CHARGE_MS}ms`);

    const strip = element('pad-strip', this.root);
    this.shape = element('pad-shape', strip);
    element('pad-name', strip, name);
    this.crown = element('pad-crown', strip, '👑');
    this.crown.hidden = true;
    const pips = element('pad-pity', strip);
    this.pity = Array.from({ length: PITY_PIPS }, () => element('pad-pip', pips));

    this.banner = element('pad-banner', this.root);
    this.banner.hidden = true;

    // Lobby: choose a pet with the arrows (it changes on the TV) and say when ready.
    // It arrives with the game's first word, so it is never up with no pet in it.
    this.lobby = element('pad-lobby', this.root);
    this.lobby.hidden = true;
    const picker = element('pad-picker', this.lobby);
    control('pad-arrow', picker, '◀', () => events.onPet(-1));
    this.petName = element('pad-pet', picker);
    control('pad-arrow', picker, '▶', () => events.onPet(1));
    this.readyButton = control('pad-ready', this.lobby, text.notReady, () => events.onReady(!(this.status?.ready ?? false)));

    // Emotes: one button that opens four.
    this.tray = element('pad-tray', this.root);
    // A tap that lands between emotes, or on one still popping in, must not fall through and press A.
    this.tray.dataset.ui = '';
    control('pad-emote is-toggle', this.tray, '💬', () => this.openTray(!this.tray.classList.contains('is-open')));
    this.emotes = EMOTES.map((emoji, index) =>
      control('pad-emote', this.tray, emoji, () => {
        events.onEmote(index);
        this.openTray(false);
      }),
    );
    for (const emote of this.emotes) emote.hidden = true;

    // Where a thumb goes, drawn until the joystick has been used once: the left half is otherwise empty, and says nothing.
    element('stick-ghost', this.root);
    this.base = element('stick-base', this.root);
    this.knob = element('stick-knob', this.base);
    this.buttons = { b: element('pad-button pad-b', this.root), a: element('pad-button pad-a', this.root) };
    this.bFace = element('pad-letter', this.buttons.b, 'B');
    element('pad-gauge', this.buttons.a);
    element('pad-cooldown', this.buttons.a);
    this.letter = element('pad-letter', this.buttons.a, 'A');
    // What A does in the game being played, in a word, under the button.
    this.does = element('pad-does', this.buttons.a);

    // Between games: the next game's card. It only covers the middle; thumbs stay where they are.
    this.next = element('pad-next', this.root);
    this.nextIcon = element('pad-next-icon', this.next);
    this.nextName = element('pad-next-name', this.next);
    this.nextLine = element('pad-next-line', this.next);
    this.next.hidden = true;
    // A word for a moment of the game: stop, go, the colour to run to.
    this.alert = element('pad-alert', this.root);
    this.alert.hidden = true;

    // A power waits here until the player wants it. The card above says what it does.
    this.card = element('pad-card', this.root);
    this.cardName = element('pad-card-name', this.card);
    this.cardHint = element('pad-card-hint', this.card);
    this.card.hidden = true;
    this.use = element('pad-use', this.root);
    this.use.dataset.ui = '';
    this.use.dataset.label = text.usePower;
    this.useIcon = element('pad-use-icon', this.use);
    this.use.hidden = true;
    this.use.addEventListener('pointerdown', event => {
      event.stopPropagation();
      this.capture(this.use, event);
      this.usePointer = event.pointerId;
      this.use.classList.add('is-down');
      vibrate(20);
      events.onButton('c', true);
    });
    const letGo = (event: PointerEvent) => {
      if (event.pointerId !== this.usePointer) return;
      this.usePointer = null;
      this.use.classList.remove('is-down');
      events.onButton('c', false);
    };
    this.use.addEventListener('pointerup', letGo);
    this.use.addEventListener('pointercancel', letGo);

    // SUPER gacha, for the winner: one giant lever to pull down.
    this.lever = element('pad-lever', this.root);
    this.lever.dataset.ui = '';
    element('pad-lever-title', this.lever, text.lever);
    const track = element('pad-lever-track', this.lever);
    this.leverKnob = element('pad-lever-knob', track);
    this.lever.addEventListener('pointerdown', this.onLeverDown);
    this.lever.addEventListener('pointermove', this.onLeverMove);
    this.lever.addEventListener('pointerup', this.onLeverUp);
    this.lever.addEventListener('pointercancel', this.onLeverUp);

    // SUPER gacha, for everyone else: the whole screen is the ZICA button.
    this.jinx = element('pad-jinx', this.root, text.jinx);
    this.jinx.dataset.ui = '';
    this.jinx.addEventListener('pointerdown', event => {
      event.stopPropagation();
      this.jinxTaps++;
      // Every tap kicks the word a different way.
      const tilt = `${(this.jinxTaps % 2 ? 1 : -1) * (4 + (this.jinxTaps % 5))}deg`;
      if (!lessMotion?.matches) this.jinx.animate?.([{ scale: 1.25, rotate: tilt }, { scale: 1, rotate: '0deg' }], { duration: motion.punch.ms, easing: 'ease-out' });
      vibrate(10);
      events.onButton('a', true);
      events.onButton('a', false);
    });

    this.results = element('pad-results', this.root);
    this.results.dataset.ui = '';
    for (const cover of [this.lever, this.jinx, this.results]) cover.hidden = true;

    // Confetti, thrown from the middle of the pad or from the power button. Each piece flies its own way.
    this.sparks = element('pad-burst', this.root);
    for (let index = 0; index < SPARKS; index++) {
      const spark = element('pad-spark', this.sparks);
      const angle = ((index + Math.random() * 0.7) / SPARKS) * Math.PI * 2;
      const reach = 0.55 + Math.random() * 0.45;
      spark.style.setProperty('--x', (Math.cos(angle) * reach).toFixed(2));
      spark.style.setProperty('--y', (Math.sin(angle) * reach).toFixed(2));
      spark.style.setProperty('--spin', `${Math.round((Math.random() - 0.5) * 540)}deg`);
    }

    this.root.addEventListener('pointerdown', this.onDown);
    this.root.addEventListener('pointermove', this.onMove);
    this.root.addEventListener('pointerup', this.onUp);
    this.root.addEventListener('pointercancel', this.onUp);
    this.root.addEventListener('lostpointercapture', this.onUp);
    // Stops scrolling, pinch zoom, the long-press menu and the double-tap zoom on the play area.
    this.root.addEventListener('touchstart', this.block, { passive: false });
    this.root.addEventListener('contextmenu', this.block);
    this.root.addEventListener('dblclick', this.block);
    this.root.addEventListener('animationend', event => event.target === this.root && this.root.classList.remove('is-buzz'));
    // The pad's own pieces pop in once, as it is built. Afterwards that rule is gone, so it cannot play again by accident.
    this.root.classList.add('is-fresh');
    this.freshTimer = window.setTimeout(() => this.root.classList.remove('is-fresh'), motion.popIn.ms + motion.staggerMs * 6);
    window.addEventListener('resize', this.layout);
    window.addEventListener('blur', this.releaseAll);
    this.layout();
    this.render();
  }

  setSeat(seat: number): void {
    const token = seatTokens[seat % seatTokens.length]!;
    this.root.style.setProperty('--seat', token.color);
    this.shape.innerHTML = seatShapeSvg(token.shape, token.color);
    // A faint pattern of the seat's shape, so the screen identifies the player by more than colour.
    const tile = seatShapeSvg(token.shape, 'rgba(255,255,255,0.14)', 'none').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" ');
    this.root.style.setProperty('--pattern', `url("data:image/svg+xml,${encodeURIComponent(tile)}")`);
  }

  /** What the game says this phone should show. */
  setStatus(status: PhoneStatus): void {
    const previous = this.status;
    this.status = status;
    // The lever and ZICA cover the pad, and another screen replaces it: thumbs start over there.
    // Being grabbed, let go or knocked out does not: the thumbs stay where they are, so a stick held
    // through a grab steers again the moment the pet is free. Only A's charge face starts over.
    const covered = (mode: PhoneMode | undefined) => mode === 'lever' || mode === 'jinx';
    if (status.screen !== previous?.screen || covered(status.mode) !== covered(previous?.mode)) this.releaseAll();
    else if (status.mode !== previous?.mode) this.showCharge(status.mode === 'alive' && (status.a?.charge ?? false) && this.buttons.a.classList.contains('is-down'));
    if (status.mode === 'jinx' && previous?.mode !== 'jinx') this.jinxTaps = 0;
    // A longer wait than last time means a dash just ended or a meteor was just dropped: restart the ring.
    if (status.cooldownMs > this.cooldownMs) {
      this.buttons.a.style.setProperty('--cooldown', `${status.cooldownMs}ms`);
      this.buttons.a.classList.remove('is-cooling');
      void this.buttons.a.offsetWidth;
      this.buttons.a.classList.add('is-cooling');
      if (status.mode === 'alive') this.restUntil = performance.now() + status.cooldownMs;
    }
    this.cooldownMs = status.cooldownMs;
    // A new power on the button: the button and its card pop in again.
    // (They land by themselves when they arrive; this is for a power taking the place of one already waiting.)
    if (status.held && status.held.name !== previous?.held?.name) {
      for (const node of [this.use, this.card]) if (this.shows(node)) pop(node, 1, 1.25);
      this.throwSparks('power', status.held.color);
    }
    // The winner's own results arrive with confetti.
    if (status.screen === 'results' && status.won && previous?.screen !== 'results') this.throwSparks('win');
    this.render();
  }

  /** A connection message (reconnecting, waiting for the game). It wins over anything the game shows. */
  setBanner(message: string | null): void {
    this.linkBanner = message;
    this.render();
  }

  /** Vibrates where the phone allows it. The border always pulses too, because iPhones cannot vibrate from a web page. */
  buzz(pattern: HapticPattern): void {
    vibrate(VIBRATION[pattern]);
    // The pulse is as big as what happened: a tap is a thin line, a knockout a thick one that jolts the pad.
    this.root.dataset.buzz = pattern;
    this.replay(this.root, 'is-buzz');
    if (pattern === 'win') this.throwSparks('win');
    this.flush();
  }

  readonly releaseAll = (): void => {
    this.stickPointer = null;
    this.leverPointer = null;
    if (this.usePointer !== null) {
      this.usePointer = null;
      this.use.classList.remove('is-down');
      this.events.onButton('c', false);
    }
    this.leverKnob.style.transform = '';
    this.base.classList.remove('is-active');
    this.events.onStick(0, 0);
    for (const button of new Set(this.presses.values())) this.setPressed(button, false);
    this.presses.clear();
  };

  dispose(): void {
    window.clearTimeout(this.warnTimer);
    window.clearTimeout(this.faceTimer);
    window.clearTimeout(this.restTimer);
    window.clearTimeout(this.freshTimer);
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('blur', this.releaseAll);
    this.root.remove();
  }

  // ── What is on screen ──────────────────────────────────────────────────────

  /** Starts a one-shot animation over, even while it is playing. It starts with the next `flush`. */
  private replay(node: HTMLElement, name: string): void {
    node.classList.remove(name);
    this.replays.push([node, name]);
  }

  private flush(): void {
    if (this.replays.length === 0) return;
    void this.root.offsetWidth;
    for (const [node, name] of this.replays.splice(0)) node.classList.add(name);
  }

  /** Writes a label and, when it changed, pops it. */
  private swap(node: HTMLElement, content: string): void {
    if (node.textContent === content) return;
    const first = node.textContent === '';
    node.textContent = content;
    if (!first) pop(node);
  }

  /** Whether a piece of the pad is up, and not on its way out. */
  private shows(node: HTMLElement): boolean {
    return !node.hidden && !node.classList.contains('is-leaving');
  }

  /** Confetti from the middle of the pad for a win, or from the power button in a new power's colour. */
  private throwSparks(from: 'win' | 'power', color = ''): void {
    this.sparks.dataset.from = from;
    this.sparks.style.setProperty('--tier', color);
    this.replay(this.sparks, 'is-on');
  }

  private openTray(open: boolean): void {
    this.tray.classList.toggle('is-open', open);
    for (const emote of this.emotes) present(emote, open);
  }

  private render(): void {
    const status = this.status;
    const screen = status?.screen ?? 'lobby';
    const mode = screen === 'play' ? (status?.mode ?? 'alive') : 'alive';
    this.root.dataset.screen = screen;
    this.root.dataset.mode = mode;

    present(this.crown, status?.bounty ?? false);
    const lobbyWasUp = this.shows(this.lobby);
    present(this.lobby, screen === 'lobby' && status !== null);
    present(this.tray, screen === 'lobby' || screen === 'play');
    present(this.lever, mode === 'lever');
    present(this.jinx, mode === 'jinx');
    this.pity.forEach((pip, index) => pip.classList.toggle('is-on', index < (status?.pity ?? 0)));
    // A is whatever the game says it is: its picture, a word for what it does, or not there at all.
    // In the lobby and with no word from the game yet, it is the brawl's dash.
    const a = status ? status.a : { icon: 'A', label: '', charge: true };
    const playing = screen === 'play' || screen === 'lobby';
    this.charges = a?.charge ?? false;
    this.root.dataset.a = a || !playing ? 'on' : 'off';
    this.root.dataset.b = (status?.bOn ?? true) || !playing ? 'on' : 'off';
    // A button on its way out keeps its face and its word until it is gone.
    if (a) {
      this.aIcon = a.icon;
      this.swap(this.does, a.label);
      // While A is held it shows the charging face; that is left alone until release.
      if (!this.buttons.a.classList.contains('is-charging')) this.swap(this.letter, this.aIcon);
    }

    // B says what it would do: nothing in reach, a hand when something is, a throw when carrying.
    // The lobby is where B is tried for the first time, so it explains itself there too.
    const b = (screen === 'play' || screen === 'lobby') && mode === 'alive' ? (status?.b ?? 'idle') : 'idle';
    this.buttons.b.dataset.does = b;
    this.swap(this.bFace, b === 'grab' ? '✋' : b === 'throw' ? '🤾' : 'B');

    // The power button is only there while a power waits. The card explains that power, or the one running now.
    const held = screen === 'play' && mode === 'alive' ? (status?.held ?? null) : null;
    const shown = held ?? (screen === 'play' && (mode === 'alive' || mode === 'carried') ? (status?.power ?? null) : null);
    // A banner (the connection, or "mash!" while carried) matters more than a power's card, and takes the middle.
    const message = this.linkBanner ?? (screen === 'wait' ? text.waitNext : mode === 'carried' ? text.mash : null);
    if (message !== null) {
      this.banner.textContent = message;
      // It stays dressed as it was while it leaves, whatever the pad has turned into by then.
      this.banner.dataset.kind = this.linkBanner === null && mode === 'carried' ? 'mash' : 'note';
    }
    present(this.banner, message !== null);

    present(this.use, held !== null);
    if (held) {
      this.useIcon.textContent = held.icon;
      this.use.style.setProperty('--tier', held.color);
    }
    present(this.card, shown !== null && message === null);
    if (shown) {
      this.card.classList.toggle('is-held', held !== null);
      this.cardName.textContent = `${shown.icon} ${shown.name}`;
      this.cardHint.textContent = shown.hint;
      this.card.style.setProperty('--tier', shown.color);
    }

    this.swap(this.petName, status?.pet ?? '');
    this.swap(this.readyButton, status?.ready ? text.ready : text.notReady);
    this.readyButton.classList.toggle('is-on', status?.ready ?? false);

    // The next game's card, and a word for a moment of the game. Either one pops in, lands again when what it
    // says changes while it is up (the roulette stopping on a game, "run" turning into "stop"), and squishes out.
    const card = screen === 'play' ? (status?.card ?? null) : null;
    if (card) {
      const landed = this.shows(this.next) && this.nextName.textContent !== card.name;
      this.nextIcon.textContent = card.icon;
      this.nextName.textContent = card.name;
      this.nextLine.textContent = card.line;
      if (landed) {
        pop(this.next, 1, 1.14);
        pop(this.nextIcon, 0);
      }
      // What takes the place of something still leaving waits for it to be gone.
      if (!this.shows(this.next)) this.next.classList.toggle('is-late', lobbyWasUp);
    }
    const cardWasUp = this.shows(this.next);
    present(this.next, card !== null);
    const alert = screen === 'play' && !card ? (status?.alert ?? null) : null;
    if (alert) {
      if (!this.shows(this.alert)) this.alert.classList.toggle('is-late', cardWasUp);
      const changed = this.shows(this.alert) && this.alert.textContent !== alert.text;
      this.alert.textContent = alert.text;
      this.alert.dataset.tone = alert.tone;
      this.alert.style.setProperty('--alert', alert.color ?? '');
      if (changed) pop(this.alert, 0.6);
    }
    present(this.alert, alert !== null);

    if (screen === 'results' && status) {
      // Built once for a result, not again for every word from the game, so its pieces arrive one after another, once.
      const built = `${status.won} ${status.place} ${status.award?.name}`;
      if (built !== this.resultsOf) {
        this.resultsOf = built;
        this.results.replaceChildren();
        this.results.classList.toggle('is-won', status.won);
        if (status.won) element('pad-won', this.results, text.won);
        if (status.place !== null) element('pad-place', this.results, text.place(status.place));
        if (status.award) {
          element('pad-award-icon', this.results, status.award.icon);
          element('pad-award', this.results, status.award.name);
        }
        this.again = control('pad-ready', this.results, '', () => this.events.onReady(!(this.status?.ready ?? false)));
      }
      this.swap(this.again!, status.ready ? text.ready : text.again);
      this.again!.classList.toggle('is-on', status.ready);
    } else this.resultsOf = '';
    present(this.results, screen === 'results');
    this.flush();
  }

  // ── Touch ──────────────────────────────────────────────────────────────────

  /** The pad is always landscape. Held upright, it turns itself 90 degrees instead of asking the player to rotate. */
  private readonly layout = (): void => {
    this.rotated = window.innerHeight > window.innerWidth;
    this.root.classList.toggle('is-rotated', this.rotated);
    this.releaseAll();
  };

  /** Screen position to pad position, undoing the rotation. */
  private local(event: PointerEvent): { u: number; v: number } {
    return this.rotated ? { u: event.clientY, v: window.innerWidth - event.clientX } : { u: event.clientX, v: event.clientY };
  }

  private get width(): number {
    return this.rotated ? window.innerHeight : window.innerWidth;
  }

  private get height(): number {
    return this.rotated ? window.innerWidth : window.innerHeight;
  }

  private get stickRadius(): number {
    return Math.min(80, Math.max(48, Math.min(window.innerWidth, window.innerHeight) * 0.17));
  }

  private capture(target: HTMLElement, event: PointerEvent): void {
    // Capture keeps a finger that slides off reporting to the same control. Losing it is harmless, so a refusal is ignored.
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone.
    }
  }

  private readonly block = (event: Event): void => event.preventDefault();

  private readonly onDown = (event: PointerEvent): void => {
    if ((event.target as HTMLElement).closest('[data-ui]')) return;
    if (this.tray.classList.contains('is-open')) this.openTray(false);
    this.capture(this.root, event);
    const { u, v } = this.local(event);
    if (u < this.width / 2) {
      if (this.stickPointer !== null) return;
      this.stickPointer = event.pointerId;
      this.stickOrigin = { u, v };
      this.base.style.transform = `translate(${u}px, ${v}px)`;
      this.knob.style.transform = '';
      this.base.classList.add('is-active');
      this.root.classList.add('is-taught');
      return;
    }
    // The whole right half is a hit area: a touch presses whichever button is nearer. A button the game
    // does not use is not there to be pressed: with one left, the whole half is that one; with none, nothing.
    const aOn = this.root.dataset.a !== 'off';
    const bOn = this.root.dataset.b !== 'off';
    if (!aOn && !bOn) return;
    const distance = (button: HTMLElement) => Math.hypot(u - (button.offsetLeft + button.offsetWidth / 2), v - (button.offsetTop + button.offsetHeight / 2));
    const button: ThumbButton = !bOn || (aOn && distance(this.buttons.a) <= distance(this.buttons.b)) ? 'a' : 'b';
    this.presses.set(event.pointerId, button);
    this.setPressed(button, true);
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.stickPointer) return;
    const { u, v } = this.local(event);
    const radius = this.stickRadius;
    let dx = (u - this.stickOrigin.u) / radius;
    let dy = (v - this.stickOrigin.v) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    this.knob.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`;
    // Inside the dead zone the stick reads zero; outside, the range is rescaled so it still reaches 1.
    const reach = Math.min(1, length);
    const scale = reach < DEAD_ZONE ? 0 : (reach - DEAD_ZONE) / (1 - DEAD_ZONE) / (reach || 1);
    const round = (value: number) => Math.round(value * 100) / 100;
    // Up on the screen is positive y for the game.
    this.events.onStick(round(dx * scale), round(-dy * scale));
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId === this.stickPointer) {
      this.stickPointer = null;
      this.base.classList.remove('is-active');
      this.events.onStick(0, 0);
    }
    const button = this.presses.get(event.pointerId);
    if (!button) return;
    this.presses.delete(event.pointerId);
    // Two fingers on one button: it stays down until the last one lifts.
    if (![...this.presses.values()].includes(button)) this.setPressed(button, false);
  };

  private setPressed(button: ThumbButton, down: boolean): void {
    this.buttons[button].classList.toggle('is-down', down);
    this.events.onButton(button, down);
    if (button !== 'a') return;
    window.clearTimeout(this.restTimer);
    // Only a button that charges fills its gauge and warns: a jump or a shove is just a press.
    const alive = this.charges && this.root.dataset.mode === 'alive' && this.root.dataset.screen !== 'results';
    const rest = this.restUntil - performance.now();
    // While A rests after a dash the game ignores it. A thumb still down when the rest ends starts charging then.
    if (down && alive && rest > 0) {
      this.showCharge(false);
      this.restTimer = window.setTimeout(() => this.showCharge(this.buttons.a.classList.contains('is-down')), rest);
      return;
    }
    this.showCharge(down && alive);
  }

  /** The charge as the phone shows it: a gauge that fills and a face that gets more worried. */
  private showCharge(charging: boolean): void {
    // Holding A too long detonates the pet. The phone warns on its own clock, without waiting for the game.
    window.clearTimeout(this.warnTimer);
    window.clearTimeout(this.faceTimer);
    this.root.classList.remove('is-warning');
    this.buttons.a.classList.toggle('is-charging', charging);
    this.letter.textContent = charging ? '😬' : this.aIcon;
    if (charging) {
      this.faceTimer = window.setTimeout(() => (this.letter.textContent = '😨'), WARN_AFTER_MS / 2);
      this.warnTimer = window.setTimeout(() => {
        this.letter.textContent = '😱';
        this.root.classList.add('is-warning');
        vibrate([60, 80, 60, 80, 60]);
      }, WARN_AFTER_MS);
    }
  }

  // ── Lever ──────────────────────────────────────────────────────────────────

  private readonly onLeverDown = (event: PointerEvent): void => {
    event.stopPropagation();
    this.capture(this.lever, event);
    this.leverPointer = event.pointerId;
    this.leverStart = this.local(event).v;
  };

  private readonly onLeverMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.leverPointer) return;
    // Pulling down by 45% of the screen height is a full pull. The lever on the TV follows live.
    const travel = this.height * 0.45;
    const pull = Math.min(1, Math.max(0, (this.local(event).v - this.leverStart) / travel));
    this.leverKnob.style.transform = `translateY(${pull * travel}px)`;
    this.events.onStick(0, -Math.round(pull * 100) / 100);
  };

  private readonly onLeverUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.leverPointer) return;
    this.leverPointer = null;
    this.leverKnob.style.transform = '';
    this.events.onStick(0, 0);
  };
}
