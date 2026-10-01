import { createRoot } from 'react-dom/client';
import { App } from './App';
import { connect } from './net';
import { useStore } from './store';
// fonts ship with the office, so it looks right offline too
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/montserrat/latin-800.css';
import '@fontsource/montserrat/latin-900.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import './styles.css';

connect();
if (import.meta.env.DEV || location.search.includes('debug')) (window as unknown as Record<string, unknown>).__swarmStore = useStore;
// Canvas textures (signs, shirts, badges) only see fonts that have loaded, so load them before the first paint.
const fonts = ['900 40px Montserrat', '700 40px Montserrat', '700 40px Fredoka', '600 40px Fredoka', '500 40px Fredoka', '400 40px "JetBrains Mono"'];
Promise.race([Promise.all(fonts.map((f) => document.fonts?.load(f))), new Promise((r) => setTimeout(r, 2500))])
  .catch(() => undefined)
  .then(() => createRoot(document.getElementById('root')!).render(<App />));
