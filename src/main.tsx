import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { startOutboxSync } from './sync/outbox';
import { startPersistence, useWird } from './store/useWird';

startPersistence();
/** Écran de démarrage (icône WIRD sur fond crème) : visible au moins ~0,9 s, puis fondu. */
const splashStart = performance.now();
function hideSplash() {
  const el = document.getElementById('spl');
  if (!el) return;
  const wait = Math.max(0, 900 - (performance.now() - splashStart));
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 650);
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
