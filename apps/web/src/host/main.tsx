import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-800.css';
import { createRoot } from 'react-dom/client';
import { applyTokens } from '../shared/tokens';
// The shared sticker styles load first, so each screen's own stylesheet can build on them.
import './styles.css';
import { GameScreen } from './hud/GameScreen';
import { Studio } from './studio/Studio';

applyTokens(document.documentElement);

// `/?studio` opens the test bench; anything else is the game.
const studio = new URLSearchParams(location.search).has('studio');

// No StrictMode: the 3D engine owns a WebGL context and must not be mounted twice.
createRoot(document.getElementById('root')!).render(studio ? <Studio /> : <GameScreen />);
