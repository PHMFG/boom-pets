// Whole sessions in real browsers: the game screen, and phones that join by link.
// Phones marked "webkit" run on the engine Safari uses, with iPhone settings; the others run on
// Chromium with Android settings. This stands in for real devices; it does not replace them.
//
// The tests follow the definition of done in the design doc:
//   1. six phones join in under 30 seconds each, with no install
//   2. a full 5-round match runs from lobby to results without a crash
//   4. solo and duo matches are playable with bots
//   5. a phone that drops can rejoin the same pet within 10 seconds
import { chromium, devices, expect, test, webkit, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_A } from '../apps/web/src/shared/games';
import { strings } from '../apps/web/src/shared/strings.pt-BR';

type Boom = {
  game: {
    phase: string;
    gameMode: string;
    revealed: boolean;
    roundIndex: number;
    rounds: number;
    standings: unknown[];
    seats: { seat: number; pet: string; bot: unknown }[];
    gacha: { seat: number; lever: number; jinx: number; pulled: boolean } | null;
    round: {
      superPending: unknown;
      pets: { id: number; seat: number; decoy: boolean; x: number; z: number; held: string | null; power: string | null }[];
    };
  };
  skip(seconds: number): void;
};
declare global {
  interface Window {
    __BOOM__: Boom;
    /** The phone's pad, exposed by the development build. */
    __PAD__: { status: { mode: string }; setStatus(status: { mode: string }): void };
  }
}

type Model = { name: string; engine: 'webkit' | 'chromium'; device: (typeof devices)[string] };

/** Where this test stack's relay saves its playtest logs (see playwright.config.ts). */
const LOGS = 'test-results/playtests';
type SavedPhone = { seat: number; name: string; device: string; joinMs: number | null; rejoins: number; worstRejoinMs: number | null };

/** The phones section of the newest log saved since `since`, or null while there is none. */
function savedPhones(since: number): SavedPhone[] | null {
  if (!existsSync(LOGS)) return null;
  const name = readdirSync(LOGS)
    .filter(file => file.endsWith('.json') && statSync(join(LOGS, file)).mtimeMs >= since)
    .sort()
    .at(-1);
  return name ? ((JSON.parse(readFileSync(join(LOGS, name), 'utf8')) as { phones?: SavedPhone[] }).phones ?? null) : null;
}
const IPHONE: Model = { name: 'Ana', engine: 'webkit', device: devices['iPhone 14']! };
const SMALL_IPHONE: Model = { name: 'Edu', engine: 'webkit', device: devices['iPhone SE']! };
const ANDROID: Model = { name: 'Bia', engine: 'chromium', device: devices['Pixel 7']! };
const ANDROID_SIDEWAYS: Model = { name: 'Caio', engine: 'chromium', device: devices['Pixel 7 landscape']! };
const OLD_ANDROID: Model = { name: 'Davi', engine: 'chromium', device: devices['Pixel 5']! };
const GALAXY: Model = { name: 'Fabi', engine: 'chromium', device: devices['Galaxy S9+']! };

/** Messages that are noise, not failures: headless graphics warnings and the blocked vibration before a touch. */
const IGNORED = [/WebGL/i, /GPU stall/i, /navigator\.vibrate/i, /Download the React DevTools/i];

type Phone = { model: Model; tab: Page; context: BrowserContext; joinMs: number };

/** Which of these controls sit on top of one another on a phone's pad, as "a over b". */
function overlapping(tab: Page, names: string[]): Promise<string[]> {
  return tab.evaluate(selectors => {
    const boxes = selectors.flatMap(name => [...document.querySelectorAll(name)].map(node => ({ name, box: node.getBoundingClientRect() })));
    const found: string[] = [];
    boxes.forEach((a, index) =>
      boxes.slice(index + 1).forEach(b => {
        if (a.box.left < b.box.right && b.box.left < a.box.right && a.box.top < b.box.bottom && b.box.top < a.box.bottom) found.push(`${a.name} over ${b.name}`);
      }),
    );
    return found;
  }, names);
}

class Session {
  readonly problems: string[] = [];
  readonly phones: Phone[] = [];
  private readonly browsers = new Map<string, Browser>();
  private readonly page: Page;
  private readonly baseURL: string;
  room = '';

  constructor(page: Page, baseURL: string) {
    this.page = page;
    this.baseURL = baseURL;
    this.watch(page, 'game screen');
  }

  watch(page: Page, label: string): void {
    page.on('pageerror', error => this.problems.push(`${label}: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error' && !IGNORED.some(pattern => pattern.test(message.text()))) this.problems.push(`${label}: ${message.text()}`);
    });
  }

  /**
   * Opens the game screen, passes the title and waits for a lobby with every seat free.
   * `games` are the games the match will play, in order: three rounds of the brawl unless a test says otherwise.
   */
  async openLobby(games: readonly string[] = ['brawl', 'brawl', 'brawl']): Promise<void> {
    await this.page.goto(`/?modes=${games.join(',')}`);
    await expect(this.page.locator('.menu-item.is-selected'), 'the main menu opens on Jogar').toHaveText(/Jogar/, { timeout: 60_000 });
    await this.page.keyboard.press('Enter');
    await expect(this.page.locator('.join-card')).toBeVisible();
    // Seats of phones from an earlier test are held for 30 seconds before they free up.
    await expect(this.page.locator('.seat-card:not(.is-free)'), 'the lobby starts empty').toHaveCount(0, { timeout: 45_000 });
    this.room = ((await this.page.locator('.join-url').textContent()) ?? '').split('r=')[1] ?? '';
    expect(this.room, 'the lobby shows a join address with a room code').toMatch(/^[A-Z]{4}$/);
    await expect(this.page.locator('.join-qr svg')).toBeVisible();
  }

  get joinUrl(): string {
    return `${this.baseURL}/c/?r=${this.room}`;
  }

  /** A phone opens the link, types a name and taps Entrar. Returns once its pad is up, with how long that took. */
  async join(model: Model): Promise<Phone> {
    let browser = this.browsers.get(model.engine);
    if (!browser) {
      browser = await (model.engine === 'webkit' ? webkit : chromium).launch();
      this.browsers.set(model.engine, browser);
    }
    const context = await browser.newContext({ ...model.device });
    const tab = await context.newPage();
    this.watch(tab, model.name);
    const started = Date.now();
    await tab.goto(this.joinUrl);
    await tab.locator('[name=name]').fill(model.name);
    await tab.locator('.join-button').tap();
    await expect(tab.locator('.pad[data-screen="lobby"]'), `${model.name} reaches the lobby pad`).toBeVisible({ timeout: 30_000 });
    await expect(tab.locator('.pad-banner')).toBeHidden();
    const joinMs = Date.now() - started;

    // Whatever the phone's shape, no control on the lobby pad may sit on top of another.
    await expect(tab.locator('.pad-pet')).not.toBeEmpty();
    expect(await overlapping(tab, ['.pad-strip', '.pad-arrow', '.pad-pet', '.pad-lobby .pad-ready', '.pad-emote.is-toggle', '.pad-a', '.pad-b']), `${model.name}'s lobby pad has nothing overlapping`).toEqual([]);

    const phone = { model, tab, context, joinMs };
    this.phones.push(phone);
    return phone;
  }

  async readyUp(): Promise<void> {
    for (const phone of this.phones) await phone.tab.locator('.pad-lobby .pad-ready').tap();
    await expect.poll(() => this.page.evaluate(() => window.__BOOM__.game.phase), { timeout: 30_000 }).toBe('play');
  }

  async close(): Promise<void> {
    await Promise.all([...this.browsers.values()].map(browser => browser.close()));
  }
}

/** Drives the pad the way fingers do: pointer events at a point given as a share of the pad's own (landscape) layout. */
async function touch(page: Page, type: 'pointerdown' | 'pointermove' | 'pointerup', id: number, u: number, v: number): Promise<void> {
  await page.evaluate(
    ([kind, pointer, shareU, shareV]) => {
      const pad = document.querySelector<HTMLElement>('.pad')!;
      const rotated = pad.classList.contains('is-rotated');
      const width = rotated ? innerHeight : innerWidth;
      const height = rotated ? innerWidth : innerHeight;
      const padX = (shareU as number) * width;
      const padY = (shareV as number) * height;
      // Undo the pad's own rotation to get a point on the real screen.
      const clientX = rotated ? innerWidth - padY : padX;
      const clientY = rotated ? padX : padY;
      const target = document.elementFromPoint(clientX, clientY) ?? pad;
      target.dispatchEvent(new PointerEvent(kind as string, { pointerId: pointer as number, clientX, clientY, bubbles: true, pointerType: 'touch' }));
    },
    [type, id, u, v] as const,
  );
}

const seatOf = (page: Page, seat: number) =>
  page.evaluate(wanted => {
    const game = window.__BOOM__.game;
    const setup = game.seats.find(candidate => candidate.seat === wanted);
    const pet = game.round.pets.find(candidate => candidate.seat === wanted && !candidate.decoy);
    return setup ? { model: setup.pet, bot: setup.bot !== null, petId: pet?.id ?? null, x: pet?.x ?? 0, z: pet?.z ?? 0 } : null;
  }, seat);

test('four phones join, play a match with a SUPER gacha, and see their results', async ({ page, baseURL }) => {
  const began = Date.now();
  const session = new Session(page, baseURL!);
  await page.goto('/');
  await expect(page.locator('.menu-item.is-selected')).toHaveText(/Jogar/, { timeout: 60_000 });
  // ── The soundtrack is served: every track the game asks for is there ──
  for (const track of ['title', 'lobby', 'battle-a', 'battle-b', 'rio-rumble']) expect((await page.request.head(`/music/${track}.mp3`)).ok(), `${track}.mp3 is served`).toBe(true);
  // ── The main menu: arrows choose, Enter confirms, and Como jogar explains every button ──
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.menu-item.is-selected')).toHaveText(/Como jogar/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.how')).toContainText('Segure para carregar e solte para disparar');
  await expect(page.locator('.how .key-glyph')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(page.locator('.how')).toBeHidden();
  await expect(page.locator('.menu-item')).toHaveCount(3);
  // The first key press allowed sound: every announcer line is recorded and loaded, and the menu's own track is playing.
  await expect.poll(() => page.evaluate(() => (window.__BOOM__ as unknown as { session: { audio: { lines: Map<string, unknown> } } }).session.audio.lines.size), { message: 'the announcer has all his lines' }).toBe(Object.keys(strings.announcer).length);
  await expect.poll(() => page.evaluate(() => !(window.__BOOM__ as unknown as { session: { audio: { tracks: Map<string, { element: HTMLAudioElement }> } } }).session.audio.tracks.get('title')!.element.paused), { message: 'the title track plays on the menu' }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__BOOM__.game.seats.filter(seat => seat.bot).length), { message: 'bots brawl behind the title' }).toBe(4);
  await session.openLobby();

  for (const model of [IPHONE, ANDROID, ANDROID_SIDEWAYS, OLD_ANDROID]) await session.join(model);
  const phones = session.phones.map(phone => phone.tab);
  await expect(page.locator('.seat-card:not(.is-free)')).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => window.__BOOM__.game.seats.filter(seat => seat.bot).length), { message: 'the lobby bots leave when players arrive' }).toBe(0);
  // The pad is always landscape: an upright phone turns it, a sideways one does not.
  await expect(phones[0]!.locator('.pad')).toHaveClass(/is-rotated/);
  await expect(phones[2]!.locator('.pad')).not.toHaveClass(/is-rotated/);

  // ── Lobby: the stick moves the pet, with A held at the same time; the arrows change it ──
  const before = await seatOf(page, 0);
  await touch(phones[0]!, 'pointerdown', 1, 0.25, 0.6);
  await touch(phones[0]!, 'pointermove', 1, 0.45, 0.6);
  await touch(phones[0]!, 'pointerdown', 2, 0.88, 0.75);
  await expect(phones[0]!.locator('.pad-a')).toHaveClass(/is-down/);
  await expect(phones[0]!.locator('.stick-base')).toHaveClass(/is-active/);
  await page.waitForTimeout(500);
  await touch(phones[0]!, 'pointerup', 2, 0.88, 0.75);
  await touch(phones[0]!, 'pointerup', 1, 0.45, 0.6);
  const after = await seatOf(page, 0);
  expect(before && after && Math.hypot(after.x - before.x, after.z - before.z), 'the iPhone-engine stick moved its pet').toBeGreaterThan(0.5);

  const petBefore = (await seatOf(page, 1))?.model;
  await phones[1]!.locator('.pad-arrow').last().tap();
  await expect.poll(async () => (await seatOf(page, 1))?.model).not.toBe(petBefore);

  // ── Everyone readies up; the match starts by itself ──
  await session.readyUp();
  for (const tab of phones) await expect(tab.locator('.pad')).toHaveAttribute('data-screen', 'play');
  await expect(page.locator('.round-bar')).toBeVisible();

  // ── A power waits on its own button, with a card that says what it does, and starts when that button is tapped ──
  await page.evaluate(() => {
    for (const pet of window.__BOOM__.game.round.pets) if (!pet.decoy) pet.held = 'rocket';
  });
  for (const [index, tab] of phones.entries()) {
    await expect(tab.locator('.pad-use'), 'the power button appears').toBeVisible();
    await expect(tab.locator('.pad-card')).toContainText('Botas Foguete');
    await expect(tab.locator('.pad-card')).toContainText('Corre muito mais rápido');
    // The longest name and explanation any power has must fit as well as this one does.
    await tab.evaluate(() => {
      document.querySelector('.pad-card-name')!.textContent = '☄️ Chuva de Meteoros';
      document.querySelector('.pad-card-hint')!.textContent = 'Vira um monstro que joga todo mundo longe';
      document.querySelector('.pad-name')!.textContent = 'Maximiliano';
    });
    expect(await overlapping(tab, ['.pad-strip', '.pad-card', '.pad-use', '.pad-emote.is-toggle', '.pad-a', '.pad-b']), `${session.phones[index]!.model.name}'s play pad has nothing overlapping`).toEqual([]);
  }
  await phones[0]!.locator('.pad-use').tap();
  await expect.poll(() => page.evaluate(() => window.__BOOM__.game.round.pets.find(pet => pet.seat === 0 && !pet.decoy)?.power), { message: 'the power button reaches the game' }).toBe('rocket');
  await expect(phones[0]!.locator('.pad-use')).toBeHidden();
  await expect(page.locator('.seat-held'), 'the game screen shows who still holds a power').toHaveCount(3);

  // ── Grabbed and let go: the stick stays under the thumb the whole time, so the pet steers again without a new touch ──
  await touch(phones[2]!, 'pointerdown', 8, 0.25, 0.6);
  await touch(phones[2]!, 'pointermove', 8, 0.4, 0.6);
  const stick = await phones[2]!.evaluate(() => {
    const pad = window.__PAD__;
    const held = () => document.querySelector('.stick-base')!.classList.contains('is-active');
    const now = pad.status;
    pad.setStatus({ ...now, mode: 'carried' });
    const whileCarried = held();
    pad.setStatus({ ...now, mode: 'alive' });
    return { whileCarried, afterRelease: held() };
  });
  expect(stick, 'the joystick survives a grab').toEqual({ whileCarried: true, afterRelease: true });
  const from = await seatOf(page, 2);
  await touch(phones[2]!, 'pointermove', 8, 0.42, 0.6);
  await expect.poll(async () => Math.abs(((await seatOf(page, 2))?.x ?? 0) - (from?.x ?? 0)), { message: 'and still moves the pet' }).toBeGreaterThan(0.3);
  await touch(phones[2]!, 'pointerup', 8, 0.42, 0.6);

  // ── After a dash A rests, and the phone shows it ──
  await touch(phones[1]!, 'pointerdown', 7, 0.88, 0.75);
  await touch(phones[1]!, 'pointerup', 7, 0.88, 0.75);
  await expect(phones[1]!.locator('.pad-a')).toHaveClass(/is-cooling/);

  // ── A SUPER gacha: the winner gets the lever, everyone else gets ZICA ──
  const winner = await page.evaluate(() => {
    const game = window.__BOOM__.game;
    const pet = game.round.pets.find(candidate => !candidate.decoy)!;
    game.round.superPending = { seat: pet.seat, pet: pet.id, power: 'kaiju' };
    return pet.seat;
  });
  await expect(phones[winner]!.locator('.pad')).toHaveAttribute('data-mode', 'lever', { timeout: 3000 });
  const other = phones[(winner + 1) % phones.length]!;
  await expect(other.locator('.pad')).toHaveAttribute('data-mode', 'jinx');
  await other.locator('.pad-jinx').tap();
  await other.locator('.pad-jinx').tap();
  await touch(phones[winner]!, 'pointerdown', 5, 0.5, 0.2);
  await touch(phones[winner]!, 'pointermove', 5, 0.5, 0.75);
  await expect.poll(() => page.evaluate(() => window.__BOOM__.game.gacha?.jinx ?? -1), { message: 'ZICA taps reach the game' }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => window.__BOOM__.game.gacha?.lever ?? -1), { message: 'the lever follows the thumb' }).toBeGreaterThan(0.5);
  await touch(phones[winner]!, 'pointerup', 5, 0.5, 0.75);
  await expect.poll(() => page.evaluate(() => window.__BOOM__.game.gacha), { timeout: 8000 }).toBeNull();

  // ── Play for a while with every thumb busy, then run the match to its end ──
  for (let beat = 0; beat < 12; beat++) {
    await Promise.all(
      phones.map(async (tab, index) => {
        if ((await tab.locator('.pad').getAttribute('data-screen')) !== 'play') return;
        const angle = beat * 0.9 + index * 1.6;
        await touch(tab, 'pointerdown', 1, 0.25, 0.6);
        await touch(tab, 'pointermove', 1, 0.25 + Math.cos(angle) * 0.12, 0.6 + Math.sin(angle) * 0.2);
        await touch(tab, 'pointerdown', 2, 0.88, 0.75);
        await tab.waitForTimeout(250);
        await touch(tab, 'pointerup', 2, 0.88, 0.75);
        await touch(tab, 'pointerup', 1, 0.25, 0.6);
      }),
    );
  }
  await expect(page.locator('.seat-card.is-away'), 'no phone dropped during play').toHaveCount(0);

  await page.evaluate(() => {
    const boom = window.__BOOM__;
    for (let guard = 0; guard < 900 && boom.game.phase !== 'matchEnd'; guard++) boom.skip(1);
  });
  await expect(page.locator('.results .result-row')).toHaveCount(4, { timeout: 10_000 });
  for (const tab of phones) {
    await expect(tab.locator('.pad')).toHaveAttribute('data-screen', 'results');
    await expect(tab.locator('.pad-place')).toBeVisible();
    await expect(tab.locator('.pad-award')).toBeVisible();
  }

  // ── The saved playtest log says what kind of phone sat where and how long each took to join ──
  await expect.poll(() => savedPhones(began)?.map(phone => phone.device), { message: 'the log names each phone’s kind' }).toEqual(['iphone', 'android', 'android', 'android']);
  for (const phone of savedPhones(began)!) {
    expect(phone.joinMs, `${phone.name}'s join time is in the log`).toBeGreaterThan(0);
    expect(phone.joinMs).toBeLessThan(30_000);
  }

  // ── A rematch from the phones ──
  for (const tab of phones) await tab.locator('.pad-results .pad-ready').tap();
  await expect.poll(() => page.evaluate(() => window.__BOOM__.game.phase), { timeout: 15_000 }).toMatch(/intro|countdown|play/);

  expect(session.problems, 'no page errors or console errors anywhere').toEqual([]);
  await session.close();
});

test('six phones join in under 30 seconds each, a seventh is told the room is full, and a dropped phone gets its pet back within 10 seconds', async ({ page, baseURL }) => {
  const began = Date.now();
  const session = new Session(page, baseURL!);
  await session.openLobby();

  for (const model of [IPHONE, ANDROID, ANDROID_SIDEWAYS, OLD_ANDROID, SMALL_IPHONE, GALAXY]) {
    const phone = await session.join(model);
    expect(phone.joinMs, `${model.name} (${model.engine}) joined in under 30 seconds`).toBeLessThan(30_000);
  }
  console.log(`Join times: ${session.phones.map(phone => `${phone.model.name} ${(phone.joinMs / 1000).toFixed(1)} s`).join(', ')}`);
  await expect(page.locator('.seat-card:not(.is-free)')).toHaveCount(6);
  // Six pets on the platform, all different.
  const models = await page.evaluate(() => window.__BOOM__.game.seats.map(seat => seat.pet));
  expect(new Set(models).size, 'nobody shares a pet').toBe(6);

  // A seventh phone is turned away with a reason.
  const browser = await chromium.launch();
  const late = await (await browser.newContext({ ...ANDROID.device })).newPage();
  await late.goto(session.joinUrl);
  await late.locator('[name=name]').fill('Gui');
  await late.locator('.join-button').tap();
  await expect(late.locator('.join-problem')).toHaveText('Sala cheia: já são 6 jogadores.');
  await browser.close();

  // ── In the lobby: the page is reloaded (as a phone does after being locked for a while) ──
  const target = session.phones[4]!;
  const before = await seatOf(page, 4);
  let started = Date.now();
  await target.tab.reload();
  await expect(target.tab.locator('.pad[data-screen="lobby"]')).toBeVisible({ timeout: 10_000 });
  await expect(target.tab.locator('.pad-banner')).toBeHidden({ timeout: 10_000 });
  const reloadMs = Date.now() - started;
  expect(reloadMs, 'back at the pad within 10 seconds of a reload').toBeLessThan(10_000);
  expect(await seatOf(page, 4), 'same seat, same pet, same body on the platform').toEqual(expect.objectContaining({ model: before!.model, petId: before!.petId, bot: false }));

  // ── Mid-match: the phone goes away completely, its pet sleeps, and it comes back to the same pet ──
  await session.readyUp();
  const playing = await seatOf(page, 1);
  const dropped = session.phones[1]!;
  await dropped.tab.close();
  await expect(page.locator('.seat-card.is-away'), 'the game screen shows the seat as away').toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(2500);
  started = Date.now();
  const back = await dropped.context.newPage();
  session.watch(back, `${dropped.model.name} (back)`);
  await back.goto(session.joinUrl);
  // No name to type and no button to tap: the phone still holds its seat's token.
  await expect(back.locator('.pad[data-screen="play"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.seat-card.is-away')).toHaveCount(0, { timeout: 10_000 });
  const rejoinMs = Date.now() - started;
  expect(rejoinMs, 'back in the match within 10 seconds').toBeLessThan(10_000);
  const afterRejoin = await seatOf(page, 1);
  expect(afterRejoin?.bot, 'the seat was not handed to a bot').toBe(false);
  expect(afterRejoin?.model).toBe(playing!.model);
  console.log(`Rejoin times: reload in lobby ${(reloadMs / 1000).toFixed(1)} s, closed and reopened mid-match ${(rejoinMs / 1000).toFixed(1)} s`);

  // ── The match ends, and its log alone is enough for the report to mark the join and rejoin items met ──
  await page.evaluate(() => {
    const boom = window.__BOOM__;
    for (let guard = 0; guard < 900 && boom.game.phase !== 'matchEnd'; guard++) boom.skip(1);
  });
  await expect.poll(() => savedPhones(began)?.length ?? 0, { message: 'the log lists all six phones' }).toBe(6);
  const saved = savedPhones(began)!;
  expect(saved.map(phone => phone.device)).toEqual(['iphone', 'android', 'android', 'android', 'iphone', 'android']);
  for (const seat of [1, 4]) {
    expect(saved[seat]!.rejoins, `the phone in seat ${seat} is logged as having come back`).toBeGreaterThanOrEqual(1);
    expect(saved[seat]!.worstRejoinMs, 'and how long that took, as the phone measured it').toBeLessThan(10_000);
  }
  const report = execFileSync('node', ['tools/playtest-report.ts', LOGS], { encoding: 'utf8' });
  expect(report).toMatch(/met\s+1 {2}Six phones join/);
  expect(report).toMatch(/met\s+5 {2}A dropped phone is back/);
  expect(report).toMatch(/met\s+6 {2}A playtest with 4 or more/);

  expect(session.problems, 'no page errors or console errors anywhere').toEqual([]);
  await session.close();
});

for (const players of [1, 2]) {
  test(`${players === 1 ? 'solo' : 'duo'}: bots fill the match to four players`, async ({ page, baseURL }) => {
    const session = new Session(page, baseURL!);
    await session.openLobby();
    for (const model of [IPHONE, ANDROID].slice(0, players)) await session.join(model);
    await session.readyUp();
    const seats = await page.evaluate(() => window.__BOOM__.game.seats.map(seat => seat.bot !== null));
    expect(seats.filter(bot => !bot), 'the people').toHaveLength(players);
    expect(seats.filter(bot => bot), 'the bots').toHaveLength(4 - players);
    await expect(page.locator('.seat-card')).toHaveCount(4);
    // The match can be played through to results.
    await page.evaluate(() => {
      const boom = window.__BOOM__;
      for (let guard = 0; guard < 900 && boom.game.phase !== 'matchEnd'; guard++) boom.skip(1);
    });
    await expect(page.locator('.results .result-row')).toHaveCount(4, { timeout: 10_000 });
    for (const phone of session.phones) await expect(phone.tab.locator('.pad')).toHaveAttribute('data-screen', 'results');
    expect(session.problems).toEqual([]);
    await session.close();
  });
}

test('a full five-round match runs from the title to the results in real time without an error', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !IGNORED.some(pattern => pattern.test(message.text()))) problems.push(message.text());
  });
  // Bots only, at real speed, with nothing fast-forwarded: every frame of every round is drawn.
  await page.goto('/?solo&autostart&modes=brawl,paint,brawl,paint,brawl');
  const rounds = new Set<number>();
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => (window.__BOOM__ ? { phase: window.__BOOM__.game.phase, round: window.__BOOM__.game.roundIndex } : null));
        if (state && state.round > 0) rounds.add(state.round);
        return state?.phase;
      },
      { timeout: 9 * 60_000, intervals: [1000] },
    )
    .toBe('matchEnd');
  expect([...rounds].sort(), 'all five rounds were played').toEqual([1, 2, 3, 4, 5]);
  await expect(page.locator('.results .result-row')).toHaveCount(4);
  await expect(page.locator('.result-award')).toHaveCount(4);
  expect(problems, 'no page errors or console errors in the whole match').toEqual([]);
});

/** With BOOM_SHOTS set, saves a picture of a page for looking at: passing tests do not show that it looks right. */
const shot = (target: Page, name: string) => (process.env.BOOM_SHOTS ? target.screenshot({ path: `test-results/shots/${name}.png` }).then(() => undefined) : Promise.resolve());

/** The simple games, in the order this session plays them. A game is added here when it is added to the match. */
const GAMES = ['paint'] as const;

test('two phones play a round of every game: each pad shows that game\'s buttons, and the match ends with a winner', async ({ page, baseURL }) => {
  const session = new Session(page, baseURL!);
  await session.openLobby(GAMES);
  await session.join(SMALL_IPHONE);
  await session.join(ANDROID_SIDEWAYS);
  for (const phone of session.phones) await phone.tab.locator('.pad-lobby .pad-ready').tap();

  for (const game of GAMES) {
    // Between games: the roulette, then this game's card, on the TV and on every phone.
    await expect.poll(() => page.evaluate(() => `${window.__BOOM__.game.phase} ${window.__BOOM__.game.revealed} ${window.__BOOM__.game.gameMode}`), { message: `the roulette lands on ${game}`, timeout: 30_000 }).toBe(`intro true ${game}`);
    await expect(page.locator('.intro-card'), 'the TV shows the game card').toContainText(strings.games[game].line);
    for (const phone of session.phones) {
      await expect(phone.tab.locator('.pad-next'), `${phone.model.name} sees the next game`).toContainText(strings.games[game].name);
      await expect(phone.tab.locator('.pad'), 'the card is over the play screen, so a resting thumb is not dropped').toHaveAttribute('data-screen', 'play');
    }
    await shot(page, `${game}-tv-card`);
    await shot(session.phones[0]!.tab, `${game}-phone-card`);

    await expect.poll(() => page.evaluate(() => window.__BOOM__.game.phase), { timeout: 20_000 }).toBe('play');
    const button = GAME_A[game];
    for (const phone of session.phones) {
      const pad = phone.tab.locator('.pad');
      await expect(phone.tab.locator('.pad-next'), 'the card leaves when the round starts').toBeHidden();
      // The pad shows exactly the buttons this game uses, and says what A does.
      await expect(pad).toHaveAttribute('data-a', button ? 'on' : 'off');
      await expect(pad).toHaveAttribute('data-b', 'off');
      if (button) await expect(phone.tab.locator('.pad-does')).toHaveText(strings.controls[button.text]);
      else await expect(phone.tab.locator('.pad-a')).toBeHidden();
      expect(await overlapping(phone.tab, ['.pad-strip', '.pad-alert', ...(button ? ['.pad-a'] : [])]), `${phone.model.name}'s pad has nothing overlapping in ${game}`).toEqual([]);
    }
    await shot(page, `${game}-tv-play`);
    await shot(session.phones[0]!.tab, `${game}-phone-play`);

    // The joystick steers in every game.
    const phone = session.phones[0]!;
    const before = (await seatOf(page, 0))!;
    await touch(phone.tab, 'pointerdown', 1, 0.2, 0.6);
    await touch(phone.tab, 'pointermove', 1, 0.3, 0.6);
    await expect.poll(async () => Math.abs(((await seatOf(page, 0))?.x ?? before.x) - before.x), { message: `the stick moves the pet in ${game}` }).toBeGreaterThan(0.3);
    await touch(phone.tab, 'pointerup', 1, 0.3, 0.6);

    // The rest of the round is fast-forwarded.
    await page.evaluate(() => {
      const boom = window.__BOOM__;
      for (let guard = 0; guard < 200 && boom.game.phase === 'play'; guard++) boom.skip(1);
    });
    await expect.poll(() => page.evaluate(() => window.__BOOM__.game.phase), { message: `${game} ends by itself` }).not.toBe('play');
  }

  // The finale names a winner, then the table.
  await expect.poll(() => page.evaluate(() => window.__BOOM__.game.phase), { timeout: 30_000 }).toBe('finale');
  await expect(page.locator('.finale-winner'), 'the winner is named').toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.__BOOM__.game.phase), { timeout: 20_000 }).toBe('matchEnd');
  await expect(page.locator('.results .result-row')).toHaveCount(4, { timeout: 10_000 });
  const winners = await page.evaluate(() => (window.__BOOM__.game.standings as { seat: number; place: number }[]).filter(entry => entry.place === 1).map(entry => entry.seat));
  for (const [seat, phone] of session.phones.entries()) {
    await expect(phone.tab.locator('.pad[data-screen="results"]')).toBeVisible();
    await expect(phone.tab.locator('.pad-won'), `${phone.model.name} is told whether it won`).toHaveCount(winners.includes(seat) ? 1 : 0);
  }
  expect(session.problems).toEqual([]);
  await session.close();
});
