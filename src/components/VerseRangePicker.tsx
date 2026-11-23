import { ChevronDown, Minus, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { ayahId } from '@/engine/quran';
import type { VerseState } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { markTipSeen, tipSeen } from '@/lib/tips';
import { TipCard } from './FingerDemo';
import { cx } from './ui';

/**
 * Choix d'une plage de versets, simple et en une seule idée : « du verset … au verset … ».
 *  - un résumé lisible en haut (versets, nombre, pages) ;
 *  - des raccourcis (5, 10, 20 versets, toute la sourate) ;
 *  - deux compteurs ± pour ajuster le début et la fin ;
 *  - la grille des versets, repliée, pour ceux qui préfèrent toucher.
 */
export function VerseRangePicker({ surah, n, from, to, onChange, verses }: { surah: number; n: number; from: number; to: number; onChange: (from: number, to: number) => void; verses?: Record<number, VerseState> }) {
  // la première fois : une animation montre comment glisser le doigt sur plusieurs versets
  const [tip, setTip] = useState(() => !tipSeen('slide'));
  const [grid, setGrid] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ a0: number; moved: boolean } | null>(null);
  const verseAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-v]');
    return el ? Number(el.getAttribute('data-v')) : null;
  };
  const endTip = () => { markTipSeen('slide'); setTip(false); };
  const [first, setFirst] = useState(true); // prochain toucher sur la grille : début (true) ou fin (false)
  const clamp = (x: number) => Math.max(1, Math.min(n, Math.round(x) || 1));
  const count = to - from + 1;
  const setFrom = (f: number) => { const v = clamp(f); onChange(v, Math.max(v, to)); };
  const setTo = (t: number) => { const v = clamp(t); onChange(Math.min(from, v), v); };
  const len = (k: number) => { haptic('select'); onChange(from, Math.min(n, from + k - 1)); };
  const tap = (a: number) => {
    haptic('tap');
    if (first || a < from) { onChange(a, a); setFirst(false); }
    else { onChange(from, a); setFirst(true); }
  };
  const presets: { k: number; l: string }[] = [{ k: 5, l: '5 versets' }, { k: 10, l: '10 versets' }, { k: 20, l: '20 versets' }, { k: n - from + 1, l: 'Jusqu’à la fin' }];

  return (
    <div>
      {tip && (
        <TipCard
          kind="slide"
          title="Sélectionne plusieurs versets d’un geste"
          text="Sur la grille, pose ton doigt sur le premier verset, puis glisse jusqu’au dernier. Tu peux aussi toucher le premier, puis le dernier."
          onClose={endTip}
          action={{ label: 'Essayer', onClick: () => { setGrid(true); setTimeout(() => gridRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80); } }}
        />
      )}
      <div className="rounded-[20px] bg-surface2 px-4 py-4 text-center" aria-live="polite">
        <p className="text-[24px] font-extrabold tracking-[-0.4px]">{from === 1 && to === n ? 'Sourate entière' : from === to ? `Verset ${from}` : `Versets ${from} à ${to}`}</p>
        <p className="mt-0.5 text-[13.5px] text-muted">{count} verset{count > 1 ? 's' : ''}</p>
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Raccourcis">
        {presets.map((p, i) => (
          <button key={i} className="chip" aria-pressed={count === p.k && to === Math.min(n, from + p.k - 1)} onClick={() => len(p.k)}>{p.l}</button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Counter label="Du verset" value={from} min={1} max={n} onChange={setFrom} />
        <Counter label="Au verset" value={to} min={1} max={n} onChange={setTo} />
      </div>

      <button className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-accent" onClick={() => setGrid((v) => !v)} aria-expanded={grid}>
        {grid ? 'Masquer la grille' : 'Choisir sur la grille'} <ChevronDown size={16} className={cx('transition', grid && 'rotate-180')} />
      </button>
      {grid && (
        <div className="mt-2.5">
          <div
            ref={gridRef}
            className="grid select-none grid-cols-7 gap-1.5"
            style={{ touchAction: 'pan-y' }}
            role="group"
            aria-label="Versets"
            onPointerDown={(e) => { const a = verseAt(e.clientX, e.clientY); if (a != null) drag.current = { a0: a, moved: false }; }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const a = verseAt(e.clientX, e.clientY);
              if (a == null || (a === d.a0 && !d.moved)) return;
              if (!d.moved) { d.moved = true; haptic('select'); }
              onChange(Math.min(d.a0, a), Math.max(d.a0, a));
            }}
            onPointerUp={() => {
              const d = drag.current;
              drag.current = null;
              if (!d) return;
              if (d.moved) { setFirst(true); endTip(); } else tap(d.a0);
            }}
            onPointerCancel={() => { drag.current = null; }}
          >
            {Array.from({ length: n }, (_, i) => i + 1).map((a) => {
              const sel = a >= from && a <= to;
              const known = verses?.[ayahId(surah, a)]?.status === 'memorized';
              return (
                <button key={a} data-v={a} onClick={(e) => { if (e.detail === 0) tap(a); }} aria-pressed={sel} aria-label={`Verset ${a}${known ? ', déjà appris' : ''}`} className={cx('relative flex aspect-square items-center justify-center rounded-lg text-[14px] font-semibold tabular-nums transition active:scale-95', sel ? 'bg-primary text-primary-ink' : known ? 'bg-good-soft text-good' : 'bg-surface2 text-muted')}>
                  {a}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">Glisse sur plusieurs versets, ou touche le premier puis le dernier. En vert : déjà appris.</p>
        </div>
      )}
    </div>
  );
}

function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="rounded-[18px] border border-line bg-surface p-3 text-center">
      <p className="label !text-[11px]">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-1">
        <button type="button" aria-label={`${label} : moins`} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 disabled:opacity-35" disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={16} /></button>
        <input aria-label={label} className="w-12 bg-transparent text-center text-[22px] font-extrabold tabular-nums outline-none" inputMode="numeric" value={value} onChange={(e) => { const x = +e.target.value.replace(/\D/g, ''); if (x) onChange(x); }} />
        <button type="button" aria-label={`${label} : plus`} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 disabled:opacity-35" disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={16} /></button>
      </div>
    </div>
  );
}
