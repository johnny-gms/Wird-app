import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { startOutboxSync } from './sync/outbox';
import { startPersistence, useWird } from './store/useWird';

startPersistence();
void useWird.getState().init().then(startOutboxSync);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
