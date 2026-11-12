import { useMemo } from 'react';
import { ayahId } from '@/engine/quran';
import type { VerseState } from '@/engine/types';
import { cx } from './ui';

/** Sélection d'une plage de versets d'une sourate : deux champs + une grille tactile. */
export function RangePicker({ n, from, to, onChange, verses, surah }: { n: number; from: number; to: number; onChange: (from: number, to: number) => void; verses?: Record<number, VerseState>; surah: number }) {
  const clamp = (x: number) => Math.max(1, Math.min(n, Math.round(x) || 1));
  const cells = useMemo(() => Array.from({ length: n }, (_, i) => i + 1), [n]);
  const tap = (a: number) => {
    // Un seul verset sélectionné : un 2e toucher plus loin fixe la fin ; sinon on repart de ce verset.
    if (from === to && a > from) onChange(from, a);
    else onChange(a, a);
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Du verset</span>
          <input className="input mt-1.5" type="number" inputMode="numeric" min={1} max={n} value={from} onChange={(e) => { const f = clamp(+e.target.value); onChange(f, Math.max(f, to)); }} />
        </label>
        <label>
          <span className="label">Au verset</span>
          <input className="input mt-1.5" type="number" inputMode="numeric" min={1} max={n} value={to} onChange={(e) => { const t = clamp(+e.target.value); onChange(Math.min(from, t), t); }} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Versets">
        {cells.map((a) => {
          const v = verses?.[ayahId(surah, a)];
          const sel = a >= from && a <= to;
          return (
            <button
              key={a}
              onClick={() => tap(a)}
              aria-pressed={sel}
              aria-label={`Verset ${a}`}
              className={cx(
                'flex h-9 min-w-9 flex-1 basis-9 items-center justify-center rounded-lg text-xs font-semibold tabular-nums transition',
                sel ? 'bg-primary text-primary-ink' : v?.status === 'memorized' ? 'bg-good-soft text-good' : v?.status === 'learning' ? 'bg-warn-soft text-warn' : 'bg-surface2 text-muted',
              )}
              style={{ maxWidth: 44 }}
            >
              {a}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Touche un verset pour le début, puis un second pour la fin.</p>
    </div>
  );
}
