import { MAX_SEATS } from '@boom/protocol';
import { tuning } from '@boom/game';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { renderSVG } from 'uqr';
import { seatShapeSvg } from '../../shared/glyphs';
import { strings } from '../../shared/strings.pt-BR';
import { colors, seats as seatTokens } from '../../shared/tokens';
import { Session } from '../app/Session';
import { Nameplates } from './Nameplates';
import { Presence } from './Presence';
import { hud, useStore, type FeedWho, type PlayerCard } from './store';
import './game.css';

const NETWORK_NAME_KEY = 'boom.networkName';
/** How long the lobby waits with nobody joined before suggesting the network is the problem. */
const HINT_AFTER_MS = 20_000;
/** The title's letters fly apart on the way out, which takes a little longer than a plain squish. */
const TITLE_EXIT_MS = 380;

const seatStyle = (seat: number, extra: Record<string, string | number> = {}) => ({ '--seat': seatTokens[seat % seatTokens.length]!.color, ...extra }) as CSSProperties;

function readSavedNetworkName(): string {
  try {
    return localStorage.getItem(NETWORK_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The whole game screen: the 3D stage with the flat HUD for every phase drawn over it. */
export function GameScreen() {
  const stageHost = useRef<HTMLDivElement>(null);
  const plateLayer = useRef<HTMLDivElement>(null);
  const joinCard = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const resultsPanel = useRef<HTMLElement>(null);
  const session = useRef<Session | null>(null);

  const loading = useStore(hud, state => state.loading);
  const title = useStore(hud, state => state.title);
  const phase = useStore(hud, state => state.phase);
  const round = useStore(hud, state => state.round);
  const rounds = useStore(hud, state => state.rounds);
  const timeLeft = useStore(hud, state => state.timeLeft);
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
  const [waitedLong, setWaitedLong] = useState(false);
  const [networkName, setNetworkName] = useState(readSavedNetworkName);
  const inLobby = phase === 'lobby';
  const inMatch = phase === 'countdown' || phase === 'play' || phase === 'roundEnd';

  useEffect(() => {
    if (!stageHost.current || !plateLayer.current) return;
    const nameplates = new Nameplates(plateLayer.current);
    const query = new URLSearchParams(location.search);
    const created = new Session(stageHost.current, nameplates, { autostart: query.has('autostart'), solo: query.has('solo') });
    created.onStats = setFps;
    session.current = created;

    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
      if (hud.get().title) return created.dismissTitle();
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
    const onPointer = () => created.dismissTitle();
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
    session.current?.setInsets(left, bottom);
  }, [inLobby, phase, title]);

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
  const lobbyUp = !title && inLobby;
  const prompt = startIn !== null ? text.startingIn(startIn) : seats.length === 0 ? (options.bots ? text.startBots : '') : text.start;

  return (
    <main className={`game phase-${phase}${title ? ' is-title' : ''}`}>
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
            <p className="title-mode sticker">{strings.mode}</p>
            <p className="title-press">{loading ? strings.title.loading : strings.title.press}</p>
            <p className="title-credits">{strings.title.credits}</p>
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

      <Presence show={!title && inMatch}>
        {() => (
          <div className="round-bar sticker">
            <div className="round-pips">
              {Array.from({ length: rounds }, (_, index) => (
                <span key={index} className={`round-pip${index + 1 < round ? ' is-done' : ''}${index + 1 === round ? ' is-now' : ''}`}>
                  {index + 1 === rounds ? strings.hud.double : ''}
                </span>
              ))}
            </div>
            <div className={`round-timer${timeLeft <= tuning.arena.explosionsBreakTilesInLast ? ' is-late' : ''}`} style={{ '--left': timeLeft / tuning.match.roundCap } as CSSProperties}>
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
              {results.map((row, index) => (
                <li key={row.seat} className="result-row" style={seatStyle(row.seat, { '--order': index })}>
                  <span className="result-place">{strings.hud.place(row.place)}</span>
                  {row.portrait && <img className="result-portrait" src={row.portrait} alt="" />}
                  <span className="result-name">{row.name}</span>
                  {row.award && (
                    <span className="result-award">
                      <span aria-hidden="true">{row.award.icon}</span> {row.award.name}
                    </span>
                  )}
                  <span className="result-score">{strings.hud.points(row.score)}</span>
                </li>
              ))}
            </ol>
            <p className="results-keys">
              {strings.hud.again} · {strings.hud.toLobby}
            </p>
          </section>
        )}
      </Presence>

      <Presence show={!title}>
        {() => (
          <div ref={strip} className="seat-strip">
            {(inLobby ? seatTokens.map((_, index) => index) : players.map(player => player.seat)).map(seat => (
              <SeatCard key={`${seat}-${cards.has(seat) ? 'taken' : 'free'}`} seat={seat} player={cards.get(seat)} lobby={inLobby || phase === 'matchEnd'} />
            ))}
          </div>
        )}
      </Presence>

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

/** One player in the strip along the bottom: who they are, their score, luck and current power. */
function SeatCard({ seat, player, lobby }: { seat: number; player: PlayerCard | undefined; lobby: boolean }) {
  const token = seatTokens[seat % seatTokens.length]!;
  const classes = ['seat-card', 'sticker'];
  if (!player) classes.push('is-free');
  if (player && !player.connected) classes.push('is-away');
  if (player?.ghost) classes.push('is-ghost');
  return (
    <div className={classes.join(' ')} style={seatStyle(seat, { '--order': seat })}>
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
        {player && !lobby && (
          <span className="seat-pity" aria-hidden="true">
            {Array.from({ length: tuning.cube.pity }, (_, index) => (
              <i key={index} className={index < player.pity ? 'is-on' : ''} />
            ))}
          </span>
        )}
      </span>
      {player && !lobby && (
        <span key={player.score} className="seat-score">
          {player.score}
        </span>
      )}
      {player && lobby && player.ready && <span className="seat-ready">{strings.lobby.ready}</span>}
      {player?.bounty && (
        <span className="seat-crown" aria-hidden="true">
          👑
        </span>
      )}
    </div>
  );
}
