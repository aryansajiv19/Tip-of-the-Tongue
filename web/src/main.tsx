import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import { App } from './App';
import { DebugView } from './debug/DebugView';
import { Home } from './home/Home';
import { desktop } from './ui/desktop';
import { applyTextSize, savedTextSize } from './settings/textSize';

const view = new URLSearchParams(location.search).get('view');

// The overlay window is transparent; styles under html.desktop depend on this. The app window
// (?view=home) is a normal, opaque window.
if (desktop && view !== 'home') document.documentElement.classList.add('desktop');

applyTextSize(savedTextSize(), false);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');
createRoot(root).render(
  <StrictMode>
    {view === 'debug' ? <DebugView /> : view === 'home' ? <Home /> : <App />}
  </StrictMode>,
);
