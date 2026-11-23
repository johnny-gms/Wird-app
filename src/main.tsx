import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { startOutboxSync } from './sync/outbox';
import { startPersistence, useWird } from './store/useWird';

startPersistence();
/** Écran de démarrage (icône WIRD sur fond crème) : visible au moins ~0,25 s (juste le temps de ne pas clignoter), puis fondu rapide. */
const splashStart = performance.now();
function hideSplash() {
  const el = document.getElementById('spl');
  if (!el) return;
  const wait = Math.max(0, 250 - (performance.now() - splashStart));
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, wait);
}

void useWird.getState().init().then(() => {
  startOutboxSync();
  hideSplash();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
