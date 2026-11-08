import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import { App } from './App';
import { DebugView } from './debug/DebugView';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');
createRoot(root).render(
  <StrictMode>
    {new URLSearchParams(location.search).get('view') === 'debug' ? <DebugView /> : <App />}
  </StrictMode>,
);
