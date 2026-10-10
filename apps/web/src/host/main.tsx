import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-800.css';
import { createRoot } from 'react-dom/client';
import { strings } from '../shared/strings.pt-BR';
import { applyTokens } from '../shared/tokens';
import { reloadIfStale } from '../shared/version';
// The shared sticker styles load first, so each screen's own stylesheet can build on them.
import './styles.css';
import { GameScreen } from './hud/GameScreen';
import { Studio } from './studio/Studio';

applyTokens(document.documentElement);

// `/?studio` opens the test bench; anything else is the game.
const studio = new URLSearchParams(location.search).has('studio');

// A tab left open across an update, or a browser holding on to old files, reloads itself. If that
// does not cure it, a line at the top says so. It never reloads over a match in progress.
const checkFresh = () =>
  void reloadIfStale().then(stale => {
    if (!stale || document.querySelector('.stale-note')) return;
    const note = document.createElement('p');
    note.className = 'stale-note sticker';
    note.textContent = strings.title.stale;
    document.body.append(note);
  });
checkFresh();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && document.querySelector('.title-screen, .join-card')) checkFresh();
});

// No StrictMode: the 3D engine owns a WebGL context and must not be mounted twice.
createRoot(document.getElementById('root')!).render(studio ? <Studio /> : <GameScreen />);
