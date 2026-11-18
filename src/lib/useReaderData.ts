import { useEffect, useState } from 'react';
import { loadQuranText, type QuranData } from './quranText';
import { loadTajweed, type TajweedData } from './tajweed';
import { loadTranslation, type TranslationData } from './translation';

const SIZE_KEY = 'wird-reader-size';
const TJ_KEY = 'wird-tajweed';

/** Données et préférences communes aux lecteurs du Coran (texte, tajwid, traduction, taille du texte). */
export function useReaderData() {
  const [data, setData] = useState<QuranData | null>(null);
  const [failed, setFailed] = useState(false);
  const [tj, setTj] = useState<TajweedData | null>(null);
  const [fr, setFr] = useState<TranslationData | null>(null);
  const [tjOn, setTjOn] = useState(() => {
    try { return localStorage.getItem(TJ_KEY) !== '0'; } catch { return true; }
  });
  const [size, setSize] = useState(() => {
    try { return Number(localStorage.getItem(SIZE_KEY)) || 1; } catch { return 1; }
  });
  useEffect(() => {
    void loadQuranText().then((d) => (d ? setData(d) : setFailed(true)));
    void loadTajweed().then(setTj);
    void loadTranslation().then(setFr);
  }, []);
  const toggleTj = () => {
    setTjOn(!tjOn);
    try { localStorage.setItem(TJ_KEY, tjOn ? '0' : '1'); } catch { /* ignore */ }
  };
  const zoom = (d: number) => {
    const n = Math.max(0.8, Math.min(2, Math.round((size + d) * 100) / 100));
    setSize(n);
    try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* ignore */ }
  };
  return { data, failed, tj, fr, tjOn, toggleTj, size, zoom };
}
