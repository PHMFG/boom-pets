// The phone controller. Vanilla TypeScript and DOM: it must load fast and stay tiny.
import '@fontsource/lilita-one/latin-400.css';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH } from '@boom/protocol';
import { strings } from '../shared/strings.pt-BR';
import { reloadIfStale, VERSION } from '../shared/version';
import { applyTokens } from '../shared/tokens';
import './controller.css';
import { PhoneLink, savedToken, type LinkState } from './net';
import { Pad } from './pad';

const NAME_KEY = 'boom.name';
const RELOADED_KEY = 'boom.reloaded';
const text = strings.controller;

applyTokens(document.documentElement);
// A phone that kept an old copy of this page reloads itself once, before the player types anything.
void reloadIfStale();
const app = document.getElementById('app')!;
const roomFromLink = (new URLSearchParams(location.search).get('r') ?? '').toUpperCase();

function remembered(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/** Keeps the screen on. A playing video is the only thing that works on a plain http page. */
function stayAwake(): void {
  if (document.querySelector('.awake')) return;
  const video = document.createElement('video');
  video.className = 'awake';
  video.src = '/c/awake.mp4';
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  document.body.append(video);
  video.play().catch(() => video.remove());
}

/** Android can go fullscreen and lock to landscape. iPhones cannot; the pad rotates itself there. */
function goFullscreen(): void {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
  document.documentElement
    .requestFullscreen?.()
    .then(() => orientation.lock?.('landscape'))
    .catch(() => undefined);
}

function showJoin(problem = ''): void {
  app.replaceChildren();
  const form = document.createElement('form');
  form.className = 'join';
  form.innerHTML = `
    <h1 class="join-brand">${strings.brand}</h1>
    <input class="join-field" name="name" maxlength="${NAME_MAX_LENGTH}" placeholder="${text.namePlaceholder}" autocomplete="off" autocapitalize="words" enterkeyhint="go" />
    ${roomFromLink ? '' : `<input class="join-field is-code" name="room" maxlength="${ROOM_CODE_LENGTH}" placeholder="${text.roomPlaceholder}" autocomplete="off" autocapitalize="characters" />`}
    <button class="join-button">${problem ? text.retry : text.join}</button>
    <p class="join-problem" role="alert"></p>
    <p class="join-hint"></p>
    <p class="join-version">${strings.title.version(VERSION)}</p>`;
  const name = form.elements.namedItem('name') as HTMLInputElement;
  const room = form.elements.namedItem('room') as HTMLInputElement | null;
  name.value = remembered(NAME_KEY);
  form.querySelector('.join-problem')!.textContent = problem;
  // iPhones cannot go fullscreen from a web page, but a page opened from the Home Screen has no browser bars.
  const onHomeScreen = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !onHomeScreen) form.querySelector('.join-hint')!.textContent = text.iosHint;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const code = roomFromLink || (room?.value ?? '').trim().toUpperCase();
    if (code.length !== ROOM_CODE_LENGTH) return room?.focus();
    try {
      localStorage.setItem(NAME_KEY, name.value.trim());
    } catch {
      // Private browsing: the name just is not remembered.
    }
    // Both need a tap to be allowed, and this is the tap.
    stayAwake();
    goFullscreen();
    play(code, name.value.trim());
  });
  app.append(form);
}

function play(room: string, name: string): void {
  app.replaceChildren();
  // The pad reports a released stick while it is being built, before the link exists.
  let link: PhoneLink | null = null;
  const pad = new Pad(app, name, {
    onStick: (x, y) => link?.setStick(x, y),
    onButton: (button, down) => link?.setButton(button, down),
    onPet: dir => link?.request({ t: 'pet', dir }),
    onReady: ready => link?.request({ t: 'ready', ready }),
    onEmote: id => link?.request({ t: 'emote', id }),
  });
  pad.setBanner(text.connecting);
  // For tests and the browser console.
  if (import.meta.env.DEV) Object.assign(window, { __PAD__: pad });
  // After a reload there was no tap yet, so the first touch on the pad starts the screen-awake video.
  app.addEventListener('pointerdown', stayAwake, { once: true });

  const onState = (state: LinkState): void => {
    switch (state.kind) {
      case 'connecting':
        return pad.setBanner(text.connecting);
      case 'online':
        sessionStorage.removeItem(RELOADED_KEY);
        pad.setSeat(state.seat);
        return pad.setBanner(state.hostPresent ? null : text.waitingHost);
      case 'reconnecting':
        pad.releaseAll();
        return pad.setBanner(state.long ? text.unreachable : text.reconnecting);
      case 'failed': {
        pad.dispose();
        // An old page talking to a newer game: reload once to pick up the new controller.
        if (state.reason === 'version' && !sessionStorage.getItem(RELOADED_KEY)) {
          sessionStorage.setItem(RELOADED_KEY, '1');
          return location.reload();
        }
        const problems = { unreachable: text.unreachable, room: text.roomNotFound, full: text.full, replaced: text.replaced, version: text.unreachable };
        return showJoin(problems[state.reason]);
      }
    }
  };
  link = new PhoneLink(room, name, { onState, onHaptic: pattern => pad.buzz(pattern), onStatus: status => pad.setStatus(status) });
}

// A phone that already has a seat in this room (the tab was reloaded) goes straight back to it.
if (roomFromLink && savedToken(roomFromLink)) play(roomFromLink, remembered(NAME_KEY));
else showJoin();
