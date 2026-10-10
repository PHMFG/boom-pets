// The screens that are not a round: loading at start-up, the roulette and card between games, and the
// winner's banner at the end of a match. Each is shown and timed by the simulation's phases.
import { PLAYABLE_MODES, tuning, type GameMode } from '@boom/game';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { GAME_CONTROLS, GAME_ICON } from '../../shared/games';
import { seatShapeSvg } from '../../shared/glyphs';
import { motion } from '../../shared/motion';
import { strings } from '../../shared/strings.pt-BR';
import { seats as seatTokens } from '../../shared/tokens';
import { Presence } from './Presence';

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

/**
 * Between games. While the game is still being drawn a reel of game pictures spins; then the card of the
 * game that came up: its picture, name, the one line that says what to do, and what each control does.
 */
export function ModeIntro({ mode, final }: { mode: GameMode | null; final: boolean }) {
  // Enough pictures for the reel to run its whole spin without showing its end.
  const reel = Array.from({ length: 14 }, (_, index) => PLAYABLE_MODES[index % PLAYABLE_MODES.length]!);
  const shown = useRef<GameMode>('brawl');
  if (mode) shown.current = mode;
  return (
    <div className="intro">
      <p className="intro-next">{strings.intro.next}</p>
      <Presence show={mode === null}>
        {() => (
          <div className="intro-reel sticker">
            <div className="intro-reel-strip" style={{ '--spin': `${tuning.match.introRoulette * 1000}ms`, '--count': reel.length } as CSSProperties}>
              {reel.map((game, index) => (
                <span key={index}>{GAME_ICON[game]}</span>
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

/** The end of a match: the question while the drums roll, then the winner's name in the winner's colour. */
export function Finale({ winners }: { winners: { seat: number; name: string }[] }) {
  const first = winners[0];
  if (!first) return <p className="finale-drum sticker">{strings.finale.drum}</p>;
  const token = seatTokens[first.seat % seatTokens.length]!;
  return (
    <div className="finale-winner sticker" style={{ '--seat': token.color } as CSSProperties}>
      <span className="finale-trophy">🏆</span>
      <h2 className="finale-name">{letters(winners.map(winner => winner.name).join(strings.finale.and))}</h2>
      <p className="finale-won">{winners.length > 1 ? strings.finale.tied : strings.finale.won}</p>
    </div>
  );
}
