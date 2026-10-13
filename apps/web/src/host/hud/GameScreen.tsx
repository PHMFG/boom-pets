import { MAX_SEATS } from '@boom/protocol';
import { PLAYABLE_MODES, tuning } from '@boom/game';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { renderSVG } from 'uqr';
import { seatShapeSvg } from '../../shared/glyphs';
import { GAME_CONTROLS, GAME_ICON } from '../../shared/games';
import { between, motion } from '../../shared/motion';
import { MENU_ICON } from '../../shared/powers';
import { strings } from '../../shared/strings.pt-BR';
import { VERSION } from '../../shared/version';
import { colors, seats as seatTokens } from '../../shared/tokens';
import { Session } from '../app/Session';
import { Finale, Iris, Loading, ModeIntro, roundRowAt, RoundResults } from './Interludes';
import { Nameplates } from './Nameplates';
import { Presence } from './Presence';
import { hud, useStore, type FeedWho, type PlayerCard, type RoundResult } from './store';
import './game.css';

const NETWORK_NAME_KEY = 'boom.networkName';
/** How long the lobby waits with nobody joined before suggesting the network is the problem. */
const HINT_AFTER_MS = 20_000;
/** When the timer turns urgent in a game that has no moment of its own for it (the brawl's is when explosions start breaking the floor). */
const LAST_SECONDS = 10;
/** The main menu, left to right. */
const MENU = ['play', 'how', 'pets'] as const;
type MenuItem = (typeof MENU)[number];

/** The title's letters fly apart on the way out, which takes a little longer than a plain squish. */
const TITLE_EXIT_MS = 380;
/** The timings of what is shown between rounds (`between` in motion.ts), for the stylesheet. */
const BETWEEN_VARS = {
  '--between-list-lead': `${between.list.leadMs}ms`,
  '--between-list-open': `${between.list.openMs}ms ${between.list.openCss}`,
  '--between-list-open-ease': between.list.openCss,
  '--between-table-stagger': `${between.table.staggerMs}ms`,
  '--between-reel-settle': `${between.reel.settleMs}ms`,
  '--between-reel-jolt': `${between.reel.joltMs}ms`,
  '--between-reel-ease': between.reel.css,
  '--between-reel-swell': between.reel.swell,
  '--between-card-burst': `${between.card.burstMs}ms`,
  '--between-card-stamp': `${between.card.stampMs}ms`,
  '--between-card-stamp-delay': `${between.card.stampDelayMs}ms`,
  '--between-card-stamped': `${between.card.stampDelayMs + between.card.stampMs * 0.55}ms`,
  '--between-swap': `${motion.squishOut.ms}ms`,
  '--between-points-fly': `${between.points.flyMs}ms ${motion.iris.css}`,
  '--between-points-ms': `${between.points.flyMs}ms`,
} as CSSProperties;

const seatStyle = (seat: number, extra: Record<string, string | number> = {}) => ({ '--seat': seatTokens[seat % seatTokens.length]!.color, ...extra }) as CSSProperties;

/** When what a round paid a row leaves the list for that player's card: once the row has landed. Milliseconds after the list was put up. */
const flightAt = (index: number) => roundRowAt(index) + motion.popIn.ms;
/** What a round paid one player, on its way from the list to their card. Positions are in pixels inside the game screen. */
type Flight = { id: number; seat: number; points: number; x: number; y: number; dx: number; dy: number };

/**
 * As a round ends, what it paid each player flies from their row of the list to their card at the bottom, one
 * after another as the rows land, and the card's score counts up when it gets there (`Score`). Returns the
 * flights in the air, and when the list they come from was put up.
 */
function usePointFlights(result: RoundResult | null, screen: { current: HTMLElement | null }): { flights: Flight[]; since: number } {
  const [flights, setFlights] = useState<Flight[]>([]);
  const since = useMemo(() => performance.now(), [result]);
  useEffect(() => {
    if (!result) return;
    const timers = result.rows.map((row, index) =>
      window.setTimeout(() => {
        const root = screen.current;
        const from = root?.querySelectorAll('.round-results .round-points')[index]?.getBoundingClientRect();
        const to = root?.querySelector(`.seat-card[data-seat="${row.seat}"] .seat-score`)?.getBoundingClientRect();
        if (!root || !from || !to || row.points <= 0) return;
        const frame = root.getBoundingClientRect();
        const x = from.left + from.width / 2 - frame.left;
        const y = from.top + from.height / 2 - frame.top;
        const flight = { id: index, seat: row.seat, points: row.points, x, y, dx: to.left + to.width / 2 - frame.left - x, dy: to.top + to.height / 2 - frame.top - y };
        setFlights(current => [...current, flight]);
        timers.push(window.setTimeout(() => setFlights(current => current.filter(other => other !== flight)), between.points.flyMs));
      }, flightAt(index)),
    );
    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      setFlights([]);
    };
  }, [result, screen]);
  return { flights, since };
}

function readSavedNetworkName(): string {
  try {
    return localStorage.getItem(NETWORK_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The whole game screen: the 3D stage with the flat HUD for every phase drawn over it. */
export function GameScreen() {
  const screen = useRef<HTMLElement>(null);
  const stageHost = useRef<HTMLDivElement>(null);
  const plateLayer = useRef<HTMLDivElement>(null);
  const joinCard = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const resultsPanel = useRef<HTMLElement>(null);
  const roundBar = useRef<HTMLDivElement>(null);
  const finaleBox = useRef<HTMLDivElement>(null);
  const session = useRef<Session | null>(null);

  const loading = useStore(hud, state => state.loading);
  const title = useStore(hud, state => state.title);
  const phase = useStore(hud, state => state.phase);
  const round = useStore(hud, state => state.round);
  const rounds = useStore(hud, state => state.rounds);
  const timeLeft = useStore(hud, state => state.timeLeft);
  const roundCap = useStore(hud, state => state.roundCap);
  const intro = useStore(hud, state => state.intro);
  const gameMode = useStore(hud, state => state.gameMode);
  const call = useStore(hud, state => state.call);
  const shownCall = useRef(call);
  if (call) shownCall.current = call;
  const finale = useStore(hud, state => state.finale);
  const curtain = useStore(hud, state => state.curtain);
  const roundResult = useStore(hud, state => state.roundResult);
  const shownRoundResult = useRef(roundResult);
  if (roundResult) shownRoundResult.current = roundResult;
  const loadProgress = useStore(hud, state => state.loadProgress);
  // What these screens last showed, so they still show it while they squish out.
  const shownIntro = useRef(intro);
  const shownFinale = useRef(finale);
  if (intro) shownIntro.current = intro;
  if (finale) shownFinale.current = finale;
  const players = useStore(hud, state => state.players);
  const results = useStore(hud, state => state.results);
  const options = useStore(hud, state => state.options);
  const startIn = useStore(hud, state => state.startIn);
  const tip = useStore(hud, state => state.tip);
  const powerNote = useStore(hud, state => state.powerNote);
  const feed = useStore(hud, state => state.feed);
  const banner = useStore(hud, state => state.banner);
  const connection = useStore(hud, state => state.connection);
  const room = useStore(hud, state => state.room);
  const network = useStore(hud, state => state.network);
  const seats = useStore(hud, state => state.seats);

  const [fps, setFps] = useState(0);
  const [debug, setDebug] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [help, setHelp] = useState(false);
  const menuKey = useRef<(key: string) => void>(() => undefined);
  const [waitedLong, setWaitedLong] = useState(false);
  const [networkName, setNetworkName] = useState(readSavedNetworkName);
  const inLobby = phase === 'lobby';
  const inMatch = phase === 'countdown' || phase === 'play' || phase === 'roundEnd';

  useEffect(() => {
    if (!stageHost.current || !plateLayer.current) return;
    const nameplates = new Nameplates(plateLayer.current);
    const query = new URLSearchParams(location.search);
    const created = new Session(stageHost.current, nameplates, { autostart: query.has('autostart'), solo: query.has('solo'), modes: query.get('modes')?.split(',') });
    created.onStats = setFps;
    session.current = created;

    const onKey = (event: KeyboardEvent) => {
      // A key held down repeats: without this, the Enter that picks "Jogar" would go on to start a match.
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.repeat) return;
      if (hud.get().title) {
        created.wake();
        return menuKey.current(event.key);
      }
      const state = hud.get();
      const key = event.key.toLowerCase();
      if (key === '`') setDebug(value => !value);
      else if (key === 'enter') created.startMatch();
      else if (key === 'escape') created.backToLobby();
      else if (state.phase === 'lobby' && key === 'r') created.setOptions({ rounds: state.options.rounds === tuning.match.rounds ? tuning.match.quickRounds : tuning.match.rounds });
      else if (state.phase === 'lobby' && key === 'b') created.setOptions({ bots: !state.options.bots });
      else if (key === 'm') created.setOptions({ reduced: !state.options.reduced });
      else if (key === 's') created.setOptions({ muted: !state.options.muted });
      else {
        const seat = Number(event.key) - 1;
        if (Number.isInteger(seat) && seat >= 0 && seat < MAX_SEATS) created.buzz(seat);
      }
    };
    const onPointer = () => created.wake();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      session.current = null;
      created.dispose();
      nameplates.dispose();
    };
  }, []);

  // The camera frames the action in whatever the HUD leaves free. Layout sizes are used, not
  // on-screen boxes, because the panels are mid pop-in animation when this first runs.
  useLayoutEffect(() => {
    const panel = title ? null : inLobby ? joinCard.current : phase === 'matchEnd' ? resultsPanel.current : null;
    const left = panel ? panel.offsetLeft + panel.offsetWidth : 0;
    const bottom = !title && strip.current ? strip.current.offsetHeight + 24 : 0;
    // The round counter sits over the far edge of the platform: a pet's name tag must not end up behind it.
    // So does the winner's banner: the podium is framed in what it leaves free.
    const over = phase === 'finale' ? finaleBox.current : roundBar.current;
    const top = !title && over ? over.offsetTop + over.offsetHeight : 0;
    session.current?.setInsets(left, bottom, top);
  }, [inLobby, phase, title, finale]);

  useEffect(() => {
    if (seats.length > 0 || !inLobby) return setWaitedLong(false);
    const timer = window.setTimeout(() => setWaitedLong(true), HINT_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [seats.length, inLobby]);

  const joinUrl = network.address && room ? `http://${network.address}:${location.port}/c/?r=${room}` : null;
  const qr = useMemo(() => (joinUrl ? renderSVG(joinUrl, { ecc: 'M', border: 2, blackColor: colors.ink, whiteColor: colors.white }) : null), [joinUrl]);

  const saveNetworkName = (value: string) => {
    setNetworkName(value);
    try {
      localStorage.setItem(NETWORK_NAME_KEY, value);
    } catch {
      // Private browsing: the name just is not remembered.
    }
  };

  const text = strings.lobby;
  const problem =
    connection === 'offline' ? text.offline
    : connection === 'notLocal' ? text.notLocal
    : connection === 'replaced' ? text.replaced
    : connection === 'busy' ? text.busy
    : connection === 'version' ? text.version
    : connection === 'online' && !network.address ? text.noNetwork
    : null;
  const cards = new Map(players.map(player => [player.seat, player]));
  const act = (run: (current: Session) => void) => () => session.current && run(session.current);
  // ── Main menu ──
  const pick = (index: number) => {
    if (index === menuIndex) return;
    setMenuIndex(index);
    session.current?.menuMoved();
  };
  const confirm = (item: MenuItem) => {
    if (loading) return;
    if (item === 'play') session.current?.dismissTitle();
    else if (item === 'how') setHelp(true);
    else location.search = '?studio';
  };
  // The key handler is set up once, so it reads the menu through a ref that every render refreshes.
  menuKey.current = (key: string) => {
    if (loading) return;
    if (help) {
      if (key === 'Escape' || key === 'Enter' || key === ' ' || key === 'Backspace') setHelp(false);
    } else if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'd') pick((menuIndex + 1) % MENU.length);
    else if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'a') pick((menuIndex + MENU.length - 1) % MENU.length);
    else if (key === 'Enter' || key === ' ') confirm(MENU[menuIndex]!);
  };

  const lobbyUp = !title && inLobby;
  // For a moment after the lobby arrives its free seats open their places in the strip; one that is freed later,
  // by a player leaving, simply takes the place that player's card had.
  const wasLobby = useRef(false);
  const lobbySince = useRef(0);
  if (lobbyUp && !wasLobby.current) lobbySince.current = performance.now();
  wasLobby.current = lobbyUp;
  const stripOpening = lobbyUp && performance.now() - lobbySince.current < motion.move.ms;
  // What the round paid flies from the list to the cards; a card's score waits for it before it counts up.
  const { flights, since: resultSince } = usePointFlights(phase === 'roundEnd' ? roundResult : null, screen);
  const paidAt = (seat: number) => {
    const index = phase === 'roundEnd' && roundResult ? roundResult.rows.findIndex(row => row.seat === seat && row.points > 0) : -1;
    return index < 0 ? null : resultSince + flightAt(index) + between.points.flyMs * 0.9;
  };
  const prompt = startIn !== null ? text.startingIn(startIn) : seats.length === 0 ? (options.bots ? text.startBots : '') : text.start;

  return (
    <main ref={screen} className={`game phase-${phase}${title ? ' is-title' : ''}`} style={BETWEEN_VARS}>
      <div ref={stageHost} className="game-stage" />
      <div ref={plateLayer} className="nameplate-layer" />

      <Presence show={title} ms={TITLE_EXIT_MS}>
        {() => (
          <div className="title-screen">
            <h1 className="title-logo" aria-label={strings.brand}>
              {strings.brand.split(' ').map((word, wordIndex) => (
                <span key={word} className="title-word" aria-hidden="true">
                  {Array.from(word).map((letter, index) => (
                    <span key={index} className="title-letter" style={{ '--i': wordIndex * 4 + index } as CSSProperties}>
                      {letter}
                    </span>
                  ))}
                </span>
              ))}
            </h1>
            {/* The panel that explains the game takes the room of the mode tag and the credits while it is up. */}
            <Presence show={!help}>{() => <p className="title-mode sticker">{strings.mode}</p>}</Presence>
            {loading && <Loading progress={loadProgress} />}
            <Presence show={!loading && !help}>
              {() => (
                <nav className="menu">
                  {MENU.map((item, index) => (
                    <button
                      key={item}
                      className={`menu-item sticker${index === menuIndex ? ' is-selected' : ''}`}
                      style={{ '--i': index } as CSSProperties}
                      onPointerEnter={() => pick(index)}
                      onClick={() => confirm(item)}
                    >
                      <span className="menu-icon" aria-hidden="true">
                        {MENU_ICON[item]}
                      </span>
                      {strings.menu[item]}
                    </button>
                  ))}
                  <p className="menu-keys">{strings.menu.keys}</p>
                </nav>
              )}
            </Presence>
            <Presence show={help}>
              {() => (
                <section className="how sticker" onClick={() => setHelp(false)}>
                  <h2>{strings.menu.how}</h2>
                  <p className="how-goal">{strings.menu.howGoal}</p>
                  {/* Every game a round can be: its picture, its name, its one line, and the buttons it uses. */}
                  <ul className="how-games">
                    {PLAYABLE_MODES.map((game, index) => (
                      <li key={game} className="how-game" style={{ '--i': index } as CSSProperties}>
                        <span className="how-icon">{GAME_ICON[game]}</span>
                        <span className="how-text">
                          <strong>{strings.games[game].name}</strong>
                          <span>{strings.games[game].line}</span>
                        </span>
                        <span className="how-keys" aria-hidden="true">
                          {GAME_CONTROLS[game].map(row => (
                            <span key={row.kind} className={`key-glyph is-${row.kind}`}>
                              {row.glyph}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="how-back">{strings.menu.back}</p>
                </section>
              )}
            </Presence>
            <Presence show={!help}>
              {() => (
                <p className="title-credits">
                  {strings.title.credits} · {strings.title.version(VERSION)}
                </p>
              )}
            </Presence>
          </div>
        )}
      </Presence>

      <Presence show={lobbyUp}>
        {() => (
          <aside ref={joinCard} className="join-card sticker">
            <h1>{text.joinTitle}</h1>
            {qr ? <div className="join-qr" role="img" aria-label={text.scan} dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="join-qr is-empty" />}
            <p className="join-wifi">{text.sameWifi}</p>
            {network.ssid ? (
              <p className="join-network">{text.network(network.ssid)}</p>
            ) : (
              <input className="join-network-input" value={networkName} placeholder={text.networkPlaceholder} maxLength={32} spellCheck={false} onChange={event => saveNetworkName(event.target.value)} />
            )}
            {joinUrl && <p className="join-url">{joinUrl.replace('http://', '')}</p>}
          </aside>
        )}
      </Presence>

      <Presence show={lobbyUp}>
        {() => (
          <div className="options">
            <button className="chip" onClick={act(current => current.setOptions({ rounds: options.rounds === tuning.match.rounds ? tuning.match.quickRounds : tuning.match.rounds }))}>
              <kbd>R</kbd> {text.rounds(options.rounds)}
            </button>
            <button className="chip" onClick={act(current => current.setOptions({ bots: !options.bots }))}>
              <kbd>B</kbd> {text.bots(options.bots)}
            </button>
            <button className="chip" onClick={act(current => current.setOptions({ reduced: !options.reduced }))}>
              <kbd>M</kbd> {text.reduced(options.reduced)}
            </button>
            <button className="chip" onClick={act(current => current.setOptions({ muted: !options.muted }))}>
              <kbd>S</kbd> {text.sound(!options.muted)}
            </button>
          </div>
        )}
      </Presence>

      <Presence show={lobbyUp && !problem && prompt !== ''}>
        {() => (
          <p key={prompt} className="start-prompt">
            {prompt}
          </p>
        )}
      </Presence>
      <Presence show={lobbyUp && !problem && waitedLong}>{() => <p className="lobby-hint sticker">{text.hintNoOne}</p>}</Presence>
      <Presence show={lobbyUp && !problem && seats.length > 0}>{() => <p className="lobby-tip">{text.tryIt}</p>}</Presence>

      {/* The curtain is under the roulette and the card, and over everything of the round. */}
      <Iris closed={curtain} />
      <Presence show={!title && phase === 'intro' && intro !== null}>
        {() => <ModeIntro mode={shownIntro.current?.mode ?? null} upcoming={shownIntro.current?.upcoming ?? null} final={shownIntro.current?.final ?? false} round={round} rounds={rounds} />}
      </Presence>
      {/* The list belongs to the round that is over: when the curtain shuts on that round's world, it leaves with it. */}
      <Presence show={!title && phase === 'roundEnd' && roundResult !== null && !curtain}>{() => <RoundResults result={shownRoundResult.current ?? { mode: 'brawl', double: false, rows: [] }} />}</Presence>
      <Presence show={!title && phase === 'finale' && finale !== null}>
        {() => (
          <div className="finale" ref={finaleBox}>
            <Finale winners={shownFinale.current?.winners ?? []} />
          </div>
        )}
      </Presence>

      {/* What is happening right now, in the slot where explanations go: the colour called, what the cat is doing, who has the bomb. */}
      <Presence show={!title && phase === 'play' && call !== null}>
        {() => {
          const shown = shownCall.current;
          const token = shown?.seat === undefined ? null : seatTokens[shown.seat % seatTokens.length]!;
          return (
            <div className="call-note sticker" style={{ '--call': shown?.color } as CSSProperties}>
              <span className="call-icon">{shown?.icon}</span>
              {/* A player is colour and shape together: the shape goes on a white disc, so it shows on its own colour. */}
              {token && <span className="call-shape" dangerouslySetInnerHTML={{ __html: seatShapeSvg(token.shape, token.color) }} />}
              <span className="call-name">{shown?.name}</span>
            </div>
          );
        }}
      </Presence>

      <Presence show={!title && inMatch}>
        {() => (
          <div className="round-bar sticker" ref={roundBar}>
            <div className="round-pips">
              {Array.from({ length: rounds }, (_, index) => (
                <span key={index} className={`round-pip${index + 1 < round ? ' is-done' : ''}${index + 1 === round ? ' is-now' : ''}`}>
                  {index + 1 === rounds ? strings.hud.double : ''}
                </span>
              ))}
            </div>
            <div className={`round-timer${timeLeft <= (gameMode === 'brawl' ? tuning.arena.explosionsBreakTilesInLast : LAST_SECONDS) ? ' is-late' : ''}`} style={{ '--left': roundCap > 0 ? timeLeft / roundCap : 0 } as CSSProperties}>
              <span key={timeLeft <= 10 ? timeLeft : 'calm'}>{timeLeft}</span>
            </div>
          </div>
        )}
      </Presence>

      {/* A power being explained takes the spot of the first-play hint while it is up. */}
      <Presence show={!title && tip !== null && powerNote === null}>
        {() => (
          <p key={tip} className="tip sticker">
            <span className={`key-glyph is-${tip === 'dash' ? 'a' : tip === 'grab' ? 'b' : 'power'}`}>{tip === 'dash' ? 'A' : tip === 'grab' ? 'B' : '⚡'}</span>
            {tip && strings.hud.tips[tip]}
          </p>
        )}
      </Presence>

      <Presence show={!title && phase === 'play' && powerNote !== null}>
        {() => (
          <div key={powerNote?.id} className={`power-note sticker is-${powerNote?.state ?? 'ready'}`} style={{ '--tier': powerNote?.color } as CSSProperties}>
            <span className="power-note-icon">{powerNote?.icon}</span>
            <span className="power-note-text">
              <span className="power-note-who">
                {powerNote && <Who who={powerNote.who} />}
                {powerNote?.state === 'ready' ? strings.hud.powerReady : powerNote?.state === 'on' ? strings.hud.powerOn : strings.hud.powerCursed}
              </span>
              <span className="power-note-name">{powerNote?.name}</span>
              <span className="power-note-hint">{powerNote?.hint}</span>
            </span>
          </div>
        )}
      </Presence>

      <Presence show={!title && phase === 'roundEnd' && banner !== null}>
        {() => (
          <p className="round-banner sticker" style={banner ? seatStyle(banner.seat) : undefined}>
            {banner?.text}
          </p>
        )}
      </Presence>

      {!title && (
        <div className="feed" aria-live="polite">
          {feed.map(item => (
            <p key={item.id} className="feed-item sticker">
              {item.by && <Who who={item.by} />}
              <span className="feed-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.target && <Who who={item.target} />}
              {item.text && <span>{item.text}</span>}
            </p>
          ))}
        </div>
      )}

      <Presence show={problem !== null}>
        {() => (
          <p className="lobby-banner sticker" role="alert">
            {problem}
          </p>
        )}
      </Presence>

      <Presence show={!title && phase === 'matchEnd'}>
        {() => (
          <section ref={resultsPanel} className="results sticker">
            <h1>{strings.hud.resultsTitle}</h1>
            <ol>
              {/* The table builds itself like a round's list: a row's place opens as the row pops in, so the box is never up empty. */}
              {results.map((row, index) => (
                <li key={row.seat} className="result-slot" style={{ '--order': index } as CSSProperties}>
                  <div className="result-row" style={seatStyle(row.seat)}>
                    <span className="result-place">{strings.hud.place(row.place)}</span>
                    {row.portrait && <img className="result-portrait" src={row.portrait} alt="" />}
                    <span className="result-name">{row.name}</span>
                    {row.award && (
                      <span className="result-award">
                        <span aria-hidden="true">{row.award.icon}</span> {row.award.name}
                      </span>
                    )}
                    <span className="result-score">{strings.hud.points(row.score)}</span>
                  </div>
                </li>
              ))}
            </ol>
            <p className="results-keys" style={{ '--order': results.length } as CSSProperties}>
              {strings.hud.again} · {strings.hud.toLobby}
            </p>
          </section>
        )}
      </Presence>

      <Presence show={!title}>
        {() => (
          <div ref={strip} className={stripOpening ? 'seat-strip is-opening' : 'seat-strip'}>
            {seatTokens.map((_, seat) =>
              cards.has(seat) ? (
                <SeatCard key={`${seat}-taken`} seat={seat} player={cards.get(seat)} lobby={inLobby || phase === 'matchEnd'} brawl={gameMode === 'brawl'} paidAt={paidAt(seat)} />
              ) : (
                // A seat nobody took is shown in the lobby only. As a match starts its place closes, and the cards of those playing slide together.
                <Presence key={`${seat}-free`} show={inLobby} ms={motion.move.ms}>
                  {() => <SeatCard seat={seat} player={undefined} lobby brawl={false} paidAt={null} />}
                </Presence>
              ),
            )}
          </div>
        )}
      </Presence>

      {flights.map(flight => (
        <span key={flight.id} className="points-chip sticker" style={seatStyle(flight.seat, { left: `${flight.x}px`, top: `${flight.y}px`, '--dx': `${flight.dx}px`, '--dy': `${flight.dy}px` })}>
          +{flight.points}
        </span>
      ))}

      {debug && (
        <dl className="debug-overlay">
          <dt>{strings.debug.fps}</dt>
          <dd>{fps}</dd>
          <dt>{strings.debug.room}</dt>
          <dd>{room ?? '—'}</dd>
          <dt>{strings.debug.address}</dt>
          <dd>{network.address ?? '—'}</dd>
          {seats.length === 0 && <dt>{strings.debug.noPhones}</dt>}
          {seats.map(seat => (
            <div key={seat.seat} className="debug-row">
              <dt>
                {seat.seat + 1} {seat.name}
              </dt>
              <dd>{strings.debug.latency(seat.rtt)}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}

/** A player in the event feed: their seat's shape and their name on their colour. */
function Who({ who }: { who: FeedWho }) {
  const token = seatTokens[who.seat % seatTokens.length]!;
  return (
    <span className="feed-who" style={seatStyle(who.seat)}>
      <span className="feed-shape" dangerouslySetInnerHTML={{ __html: seatShapeSvg(token.shape, token.color) }} />
      {who.name}
    </span>
  );
}

/**
 * A player's score on their card. A point made in play shows at once. As a round ends the card keeps its old
 * number until what the round paid has flown in from the list of places (`at`, a moment of `performance.now()`),
 * and then counts up to the new one, punching at every step.
 */
function Score({ value, at }: { value: number; at: number | null }) {
  const [shown, setShown] = useState(value);
  const last = useRef(value);
  last.current = shown;
  useEffect(() => {
    if (at === null) return setShown(value);
    let frame = 0;
    const from = last.current;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - at) / between.points.countMs));
      setShown(Math.round(from + (value - from) * t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, at]);
  return (
    <span key={shown} className="seat-score">
      {shown}
    </span>
  );
}

/** One player in the strip along the bottom: who they are, their score, luck and current power. `paidAt` is when what the round paid them reaches the card, as a round ends. */
function SeatCard({ seat, player, lobby, brawl, paidAt, className = '' }: { seat: number; player: PlayerCard | undefined; lobby: boolean; brawl: boolean; paidAt: number | null; className?: string }) {
  const token = seatTokens[seat % seatTokens.length]!;
  // `className` is how `Presence` marks a free seat as leaving.
  const classes = ['seat-card', 'sticker', className];
  if (!player) classes.push('is-free');
  if (player && !player.connected) classes.push('is-away');
  if (player?.ghost) classes.push('is-ghost');
  return (
    <div className={classes.join(' ')} data-seat={seat} style={seatStyle(seat, { '--order': seat })}>
      <span className="seat-shape" dangerouslySetInnerHTML={{ __html: seatShapeSvg(token.shape, player ? token.color : 'none') }} />
      {player?.portrait && (
        <span className="seat-portrait">
          <img src={player.portrait} alt="" />
          {player.power && (
            <span className="seat-power" style={{ '--tier': player.power.color, '--left': player.power.left } as CSSProperties}>
              {player.power.icon}
            </span>
          )}
          {player.held && (
            <span key={player.held.icon} className="seat-held" style={{ '--tier': player.held.color } as CSSProperties}>
              {player.held.icon}
            </span>
          )}
        </span>
      )}
      <span className="seat-text">
        <span className="seat-name">{player ? player.name : strings.lobby.freeSeat}</span>
        {player && !lobby && player.metric && (
          <span key={player.metric.text} className="seat-metric">
            {player.metric.icon} {player.metric.text}
          </span>
        )}
        {/* Luck pips count Mystery Cube rolls, which only the brawl has. */}
        {player && !lobby && brawl && !player.metric && (
          <span className="seat-pity" aria-hidden="true">
            {Array.from({ length: tuning.cube.pity }, (_, index) => (
              <i key={index} className={index < player.pity ? 'is-on' : ''} />
            ))}
          </span>
        )}
      </span>
      {player && !lobby && <Score value={player.score} at={paidAt} />}
      {player && lobby && player.ready && <span className="seat-ready">{strings.lobby.ready}</span>}
      {player?.bounty && (
        <span className="seat-crown" aria-hidden="true">
          👑
        </span>
      )}
    </div>
  );
}
