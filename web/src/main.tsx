import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import { App } from './App';
import { DebugView } from './debug/DebugView';
import { desktop } from './ui/desktop';
import { applyTextSize, savedTextSize } from './settings/textSize';

// The desktop window is transparent; styles under html.desktop depend on this.
if (desktop) document.documentElement.classList.add('desktop');

applyTextSize(savedTextSize(), false);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');
createRoot(root).render(
  <StrictMode>
    {new URLSearchParams(location.search).get('view') === 'debug' ? <DebugView /> : <App />}
  </StrictMode>,
);
