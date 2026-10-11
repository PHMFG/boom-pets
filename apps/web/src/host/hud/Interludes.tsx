// The screens that are not a round: loading at start-up, the roulette and card between games, and the
// winner's banner at the end of a match. Each is shown and timed by the simulation's phases.
import { PLAYABLE_MODES, tuning, type GameMode } from '@boom/game';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { COUNT_SUFFIX, GAME_CONTROLS, GAME_ICON } from '../../shared/games';
import { seatShapeSvg } from '../../shared/glyphs';
import { motion } from '../../shared/motion';
import { strings } from '../../shared/strings.pt-BR';
import { seats as seatTokens } from '../../shared/tokens';
import { Presence } from './Presence';
import type { RoundResult } from './store';

const letters = (text: string) =>
  Array.from(text).map((letter, index) => (
    <span key={index} className="pop-letter" style={{ '--i': index } as CSSProperties}>
      {letter === ' ' ? '\u00a0' : letter}
    </span>
  ));

/** Start-up: a bar that fills as the pets load, the six seat shapes hopping in turn, and a tip that changes. */
export function Loading({ progress }: { progress: number }) {
  const tips = strings.title.loadingTips;
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTip(index => (index + 1) % tips.length), motion.feed.ms);
    return () => window.clearInterval(timer);
  }, [tips.length]);
  return (
    <div className="loading">
      <div className="loading-shapes">
        {seatTokens.map((seat, index) => (
          <span key={seat.shape} style={{ '--i': index } as CSSProperties} dangerouslySetInnerHTML={{ __html: seatShapeSvg(seat.shape, seat.color) }} />
        ))}
      </div>
      <div className="loading-bar" style={{ '--done': Math.min(1, Math.max(0.04, progress)) } as CSSProperties}>
        <span className="loading-fill" />
      </div>
      <p className="loading-text">{strings.title.loading}</p>
      <p className="loading-tip" key={tip}>
        {tips[tip]}
      </p>
    </div>
  );
}

/** How many pictures run past before the reel stops. Enough that its start is a blur. */
const REEL = 22;

/**
 * Between games. A reel of game pictures runs past a window, slows, and stops on the game to come; then
 * that game's card takes its place: its picture, name, the one line that says what to do, and what each
 * control does.
 */
export function ModeIntro({ mode, upcoming, final, round, rounds }: { mode: GameMode | null; upcoming: GameMode | null; final: boolean; round: number; rounds: number }) {
  // The games in their usual order, round and round, arranged so that the last picture is the one to stop on.
  const reel = useMemo(() => {
    const last = Math.max(0, PLAYABLE_MODES.indexOf(upcoming ?? 'brawl'));
    return Array.from({ length: REEL }, (_, index) => PLAYABLE_MODES[(((last - (REEL - 1) + index) % PLAYABLE_MODES.length) + PLAYABLE_MODES.length) % PLAYABLE_MODES.length]!);
  }, [upcoming]);
  const shown = useRef<GameMode>('brawl');
  if (mode) shown.current = mode;
  return (
    <div className="intro">
      {/* While the reel runs it promises a game; once the card is up it says which round of the match this is. */}
      <p className="intro-next" key={mode === null ? 'next' : 'round'}>
        {mode === null ? strings.intro.next : strings.intro.round(round, rounds)}
      </p>
      <Presence show={mode === null}>
        {() => (
          <div className="intro-reel sticker" style={{ '--spin': `${tuning.match.introRoulette * 1000}ms`, '--count': reel.length } as CSSProperties}>
            <div className="intro-reel-strip">
              {reel.map((game, index) => (
                <span key={index} className={index === reel.length - 1 ? 'is-landing' : undefined}>
                  {GAME_ICON[game]}
                </span>
              ))}
            </div>
          </div>
        )}
      </Presence>
      <Presence show={mode !== null}>
        {() => {
          const game = mode ?? shown.current;
          return (
            <div className="intro-card sticker">
              {final && <p className="intro-double sticker">{strings.intro.double}</p>}
              <span className="intro-icon">{GAME_ICON[game]}</span>
              <h2 className="intro-name">{letters(strings.games[game].name)}</h2>
              <p className="intro-line">{strings.games[game].line}</p>
              <ul className="intro-controls">
                {GAME_CONTROLS[game].map((row, index) => (
                  <li key={row.kind} style={{ '--i': index } as CSSProperties}>
                    <span className={`key-glyph is-${row.kind}`}>{row.glyph}</span>
                    {strings.controls[row.text]}
                  </li>
                ))}
              </ul>
            </div>
          );
        }}
      </Presence>
    </div>
  );
}

/**
 * A curtain that closes to a point and opens again. The world is changed behind it while it is shut,
 * so one map is never seen snapping into another.
 */
export function Iris({ closed }: { closed: boolean }) {
  return <div className={closed ? 'iris is-closed' : 'iris'} aria-hidden="true" />;
}

/** A number that counts up from nothing once its row has arrived, so the room watches it being added up. */
function CountUp({ to, wait }: { to: number; wait: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now() + wait;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / motion.roundResults.countMs));
      // Fast at first, slowing into the final number.
      setShown(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, wait]);
  return <>{shown}</>;
}

/** As a round ends: every player's place in it, what the game counted for them, and what the round paid them, best first. */
export function RoundResults({ result }: { result: RoundResult }) {
  const counted = result.rows.some(row => row.count !== null);
  return (
    <section className={counted ? 'round-results is-counted sticker' : 'round-results sticker'}>
      <h3>
        <span className="round-results-icon">{GAME_ICON[result.mode]}</span>
        {strings.games[result.mode].name}
        {result.double && <span className="round-results-double">{strings.hud.double}</span>}
      </h3>
      <ol>
        {result.rows.map((row, index) => {
          const token = seatTokens[row.seat % seatTokens.length]!;
          return (
            <li key={row.seat} className={row.place === 1 ? 'round-row is-first' : 'round-row'} style={{ '--i': index, '--seat': token.color } as CSSProperties}>
              <span className="round-place">{strings.hud.place(row.place)}</span>
              <span className="round-shape" dangerouslySetInnerHTML={{ __html: seatShapeSvg(token.shape, token.color) }} />
              <span className="round-name">{row.name}</span>
              {counted && (
                <span className="round-count">
                  {GAME_ICON[result.mode]} <CountUp to={row.count ?? 0} wait={motion.roundResults.delayMs + motion.popIn.ms + index * motion.roundResults.staggerMs} />
                  {COUNT_SUFFIX[result.mode]}
                </span>
              )}
              <span className="round-points">+{row.points}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The end of a match: the question while the drums roll, then the winner's name in the winner's colour. */
export function Finale({ winners }: { winners: { seat: number; name: string }[] }) {
  // What the banner last showed, so it still shows it while it squishes out.
  const shown = useRef(winners);
  if (winners.length > 0) shown.current = winners;
  const named = shown.current;
  const token = seatTokens[(named[0]?.seat ?? 0) % seatTokens.length]!;
  const name = named.map(winner => winner.name).join(strings.finale.and);
  return (
    <>
      <Presence show={winners.length === 0}>{() => <p className="finale-drum sticker">{strings.finale.drum}</p>}</Presence>
      <Presence show={winners.length > 0}>
        {() => (
          <div className="finale-winner sticker" style={{ '--seat': token.color } as CSSProperties}>
            <span className="finale-trophy">🏆</span>
            <h2 className="finale-name">{letters(name)}</h2>
            {/* The verb comes after its subject: it waits for the name's last letter. */}
            <p className="finale-won" style={{ '--letters': name.length } as CSSProperties}>
              {named.length > 1 ? strings.finale.tied : strings.finale.won}
            </p>
          </div>
        )}
      </Presence>
    </>
  );
}
