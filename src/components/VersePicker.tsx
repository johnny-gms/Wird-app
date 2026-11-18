import { useEffect } from 'react';
import { surahMeta } from '@/engine/quran';
import type { VerseState } from '@/engine/types';
import { VerseRangePicker } from './VerseRangePicker';

const range = (f: number, t: number) => Array.from({ length: Math.max(0, t - f + 1) }, (_, i) => f + i);

/**
 * Sélection de versets d'une sourate, volontairement simple : une plage « du verset … au verset … ».
 * (Les anciennes sélections en plusieurs morceaux sont remplacées dès qu'on ajuste la plage.)
 */
export function VersePicker({ surah, selected, onChange, verses }: { surah: number; selected: Set<number>; onChange: (s: Set<number>) => void; verses: Record<number, VerseState> }) {
  const n = surahMeta(surah).n;
  // à l'ouverture sans sélection : une première plage de 5 versets, que l'on ajuste ensuite
  useEffect(() => {
    if (selected.size === 0) onChange(new Set(range(1, Math.min(5, n))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const arr = [...selected].sort((a, b) => a - b);
  const from = arr[0] ?? 1;
  const to = arr.length ? arr[arr.length - 1] : Math.min(5, n);
  const split = arr.length > 0 && arr.length !== to - from + 1;
  return (
    <div>
      {split && <p className="mb-3 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">Ta sélection a plusieurs morceaux. Ajuste la plage ci-dessous pour la remplacer par une suite de versets.</p>}
      <VerseRangePicker surah={surah} n={n} from={from} to={to} onChange={(f, t) => onChange(new Set(range(f, t)))} verses={verses} />
    </div>
  );
}
