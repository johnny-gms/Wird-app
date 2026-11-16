import { useEffect, useState } from 'react';
import { dateKey } from '@/engine/dates';

/** Date du jour (AAAA-MM-JJ), mise à jour si l'application reste ouverte au passage de minuit. */
export function useToday(): string {
  const [d, setD] = useState(dateKey());
  useEffect(() => {
    const tick = () => setD((prev) => (prev === dateKey() ? prev : dateKey()));
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return d;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

/** Salutation fixe : « As-salam alaykoum » (pas de Bonjour/Bonsoir). */
export function greeting(): string {
  return 'As-salam alaykoum';
}

export function formatDateLong(d = new Date()): string {
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDateShort(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
}

export function applyTheme(mode: 'light' | 'dark' | 'system') {
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem('wird-theme', mode);
  } catch {
    /* ignore */
  }
}
