// The play screen: a joystick that appears under the left thumb, and A and B under the right.
// Built to be used without looking, so every touch on a half counts for that half. What A does,
// and how the pad looks, follows the status the game sends (alive, ghost, carried, lever, ZICA).
import type { ButtonName, HapticPattern, PhoneStatus } from '@boom/protocol';
import { seatShapeSvg } from '../shared/glyphs';
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
/** Milliseconds of holding A before the overcharge warning. Matches the game's tuning. */
const WARN_AFTER_MS = 1400;
const PITY_PIPS = 6;
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

/** A tappable control drawn over the pad. Marked so the pad itself ignores touches on it. */
function control(className: string, parent: HTMLElement, content: string, onTap: () => void): HTMLElement {
  const created = element(className, parent, content);
  created.dataset.ui = '';
  created.addEventListener('pointerdown', event => {
    event.stopPropagation();
    created.classList.remove('is-tapped');
    void created.offsetWidth;
    created.classList.add('is-tapped');
    onTap();
  });
  return created;
}

export class Pad {
  private readonly root: HTMLElement;
  private readonly events: PadEvents;
  private readonly shape: HTMLElement;
  private readonly power: HTMLElement;
  private readonly pity: HTMLElement[];
  private readonly crown: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly petName: HTMLElement;
  private readonly readyButton: HTMLElement;
  private readonly tray: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly buttons: Record<ButtonName, HTMLElement>;
  private readonly letter: HTMLElement;
  private readonly lever: HTMLElement;
  private readonly leverKnob: HTMLElement;
  private readonly jinx: HTMLElement;
  private readonly results: HTMLElement;
  private status: PhoneStatus | null = null;
  private linkBanner: string | null = null;
  private rotated = false;
  private stickPointer: number | null = null;
  private stickOrigin = { u: 0, v: 0 };
  /** Which button each finger on the right half is holding. */
  private readonly presses = new Map<number, ButtonName>();
  private leverPointer: number | null = null;
  private leverStart = 0;
  private warnTimer = 0;
  private faceTimer = 0;
  private cooldownMs = 0;
  private jinxTaps = 0;

  constructor(parent: HTMLElement, name: string, events: PadEvents) {
    this.events = events;
    this.root = element('pad', parent);

    const strip = element('pad-strip', this.root);
    this.shape = element('pad-shape', strip);
    element('pad-name', strip, name);
    this.crown = element('pad-crown', strip, '👑');
    this.power = element('pad-power', strip);
    const pips = element('pad-pity', strip);
    this.pity = Array.from({ length: PITY_PIPS }, () => element('pad-pip', pips));

    this.banner = element('pad-banner', this.root);
    this.banner.hidden = true;

    // Lobby: choose a pet with the arrows (it changes on the TV) and say when ready.
    const lobby = element('pad-lobby', this.root);
    const picker = element('pad-picker', lobby);
    control('pad-arrow', picker, '◀', () => events.onPet(-1));
    this.petName = element('pad-pet', picker);
    control('pad-arrow', picker, '▶', () => events.onPet(1));
    this.readyButton = control('pad-ready', lobby, text.notReady, () => events.onReady(!(this.status?.ready ?? false)));

    // Emotes: one button that opens four.
    this.tray = element('pad-tray', this.root);
    // A tap that lands between emotes, or on one still popping in, must not fall through and press A.
    this.tray.dataset.ui = '';
    control('pad-emote is-toggle', this.tray, '💬', () => this.tray.classList.toggle('is-open'));
    EMOTES.forEach((emoji, index) =>
      control('pad-emote', this.tray, emoji, () => {
        events.onEmote(index);
        this.tray.classList.remove('is-open');
      }),
    );

    this.base = element('stick-base', this.root);
    this.knob = element('stick-knob', this.base);
    this.buttons = { b: element('pad-button pad-b', this.root, 'B'), a: element('pad-button pad-a', this.root) };
    element('pad-gauge', this.buttons.a);
    element('pad-cooldown', this.buttons.a);
    this.letter = element('pad-letter', this.buttons.a, 'A');

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
      this.jinx.style.setProperty('--tilt', `${(this.jinxTaps % 2 ? 1 : -1) * (4 + (this.jinxTaps % 5))}deg`);
      this.jinx.classList.remove('is-tapped');
      void this.jinx.offsetWidth;
      this.jinx.classList.add('is-tapped');
      vibrate(10);
      events.onButton('a', true);
      events.onButton('a', false);
    });

    this.results = element('pad-results', this.root);
    this.results.dataset.ui = '';

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
    if (status.mode !== previous?.mode || status.screen !== previous?.screen) this.releaseAll();
    if (status.mode === 'jinx' && previous?.mode !== 'jinx') this.jinxTaps = 0;
    // A longer wait than last time means a meteor was just dropped: restart the ring.
    if (status.cooldownMs > this.cooldownMs) {
      this.buttons.a.style.setProperty('--cooldown', `${status.cooldownMs}ms`);
      this.buttons.a.classList.remove('is-cooling');
      void this.buttons.a.offsetWidth;
      this.buttons.a.classList.add('is-cooling');
    }
    this.cooldownMs = status.cooldownMs;
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
    this.root.classList.remove('is-buzz');
    void this.root.offsetWidth;
    this.root.classList.add('is-buzz');
  }

  readonly releaseAll = (): void => {
    this.stickPointer = null;
    this.leverPointer = null;
    this.leverKnob.style.transform = '';
    this.base.classList.remove('is-active');
    this.events.onStick(0, 0);
    for (const button of new Set(this.presses.values())) this.setPressed(button, false);
    this.presses.clear();
  };

  dispose(): void {
    window.clearTimeout(this.warnTimer);
    window.clearTimeout(this.faceTimer);
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('blur', this.releaseAll);
    this.root.remove();
  }

  // ── What is on screen ──────────────────────────────────────────────────────

  private render(): void {
    const status = this.status;
    const screen = status?.screen ?? 'lobby';
    const mode = screen === 'play' ? (status?.mode ?? 'alive') : 'alive';
    this.root.dataset.screen = screen;
    this.root.dataset.mode = mode;

    this.crown.hidden = !status?.bounty;
    this.power.hidden = !status?.power;
    this.power.textContent = status?.power ? `${status.power.icon} ${status.power.name}` : '';
    this.power.style.setProperty('--tier', status?.power?.color ?? 'transparent');
    this.pity.forEach((pip, index) => pip.classList.toggle('is-on', index < (status?.pity ?? 0)));
    // While A is held it shows the charging face; that is left alone until release.
    if (!this.buttons.a.classList.contains('is-down')) this.letter.textContent = mode === 'ghost' ? '☄️' : 'A';

    this.petName.textContent = status?.pet ?? '';
    this.readyButton.textContent = status?.ready ? text.ready : text.notReady;
    this.readyButton.classList.toggle('is-on', status?.ready ?? false);

    const message = this.linkBanner ?? (screen === 'wait' ? text.waitNext : mode === 'carried' ? text.mash : null);
    this.banner.hidden = message === null;
    this.banner.textContent = message ?? '';

    if (screen === 'results' && status) {
      this.results.replaceChildren();
      if (status.place !== null) element('pad-place', this.results, text.place(status.place));
      if (status.award) {
        element('pad-award-icon', this.results, status.award.icon);
        element('pad-award', this.results, status.award.name);
      }
      const again = control('pad-ready', this.results, status.ready ? text.ready : text.again, () => this.events.onReady(!status.ready));
      again.classList.toggle('is-on', status.ready);
    }
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
    this.tray.classList.remove('is-open');
    this.capture(this.root, event);
    const { u, v } = this.local(event);
    if (u < this.width / 2) {
      if (this.stickPointer !== null) return;
      this.stickPointer = event.pointerId;
      this.stickOrigin = { u, v };
      this.base.style.transform = `translate(${u}px, ${v}px)`;
      this.knob.style.transform = '';
      this.base.classList.add('is-active');
      return;
    }
    // The whole right half is a hit area: a touch presses whichever button is nearer.
    const distance = (button: HTMLElement) => Math.hypot(u - (button.offsetLeft + button.offsetWidth / 2), v - (button.offsetTop + button.offsetHeight / 2));
    const button: ButtonName = distance(this.buttons.a) <= distance(this.buttons.b) ? 'a' : 'b';
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

  private setPressed(button: ButtonName, down: boolean): void {
    this.buttons[button].classList.toggle('is-down', down);
    this.events.onButton(button, down);
    if (button !== 'a') return;
    // Holding A too long detonates the pet. The phone warns on its own clock, without waiting for the game.
    window.clearTimeout(this.warnTimer);
    window.clearTimeout(this.faceTimer);
    this.root.classList.remove('is-warning');
    const charging = down && this.root.dataset.mode === 'alive' && this.root.dataset.screen !== 'results';
    // The button grows a face that gets more worried the longer the charge runs.
    this.letter.textContent = charging ? '😬' : this.root.dataset.mode === 'ghost' ? '☄️' : 'A';
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
