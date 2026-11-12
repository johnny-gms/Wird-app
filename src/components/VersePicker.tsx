import { Minus, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { verseKind } from '@/engine/progress';
import { ayahId, surahMeta } from '@/engine/quran';
import type { VerseState } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { cx } from './ui';

const KIND_RING: Record<string, string> = { n: 'bg-neutral text-neutral-ink', l: 'bg-blue/20 text-blue', m: 'bg-good/20 text-good', r: 'bg-hard/20 text-hard' };

/**
 * Sélection de versets d'une sourate :
 *  - sélection rapide par groupes de N versets (5 par défaut, ajustable),
 *  - plage « du verset … au verset … »,
 *  - touche individuelle, ou appui + glissement horizontal sur la grille.
 */
export function VersePicker({ surah, selected, onChange, verses }: { surah: number; selected: Set<number>; onChange: (s: Set<number>) => void; verses: Record<number, VerseState> }) {
  const n = surahMeta(surah).n;
  const [group, setGroup] = useState(5);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const drag = useRef<{ start: number; x: number; y: number; on: boolean; add: boolean; base: Set<number> } | null>(null);

  const groups = useMemo(() => {
    const out: { from: number; to: number }[] = [];
    for (let i = 1; i <= n; i += group) out.push({ from: i, to: Math.min(n, i + group - 1) });
    return out;
  }, [n, group]);
  const range = (f: number, t: number) => Array.from({ length: Math.max(0, t - f + 1) }, (_, i) => f + i);
  const toggleGroup = (g: { from: number; to: number }) => {
    haptic('select');
    const ids = range(g.from, g.to);
    const all = ids.every((x) => selected.has(x));
    const next = new Set(selected);
    ids.forEach((x) => (all ? next.delete(x) : next.add(x)));
    onChange(next);
  };
  const cellAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-verse]') as HTMLElement | null;
    return el ? Number(el.dataset.verse) : null;
  };
  const paint = (cur: number) => {
    const d = drag.current!;
    const [lo, hi] = [Math.min(d.start, cur), Math.max(d.start, cur)];
    const next = new Set(d.base);
    range(lo, hi).forEach((x) => (d.add ? next.add(x) : next.delete(x)));
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="label">Sélection rapide</p>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted">groupes de</span>
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-surface2" aria-label="Moins" onClick={() => setGroup(Math.max(1, group - 1))}><Minus size={14} /></button>
          <b className="w-6 text-center tabular-nums">{group}</b>
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-surface2" aria-label="Plus" onClick={() => setGroup(Math.min(30, group + 1))}><Plus size={14} /></button>
        </div>
      </div>
      <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {groups.map((g) => {
          const ids = range(g.from, g.to);
          const c = ids.filter((x) => selected.has(x)).length;
          return (
            <button key={g.from} aria-pressed={c === ids.length} onClick={() => toggleGroup(g)} className={cx('chip', c > 0 && c < ids.length && 'ring-2 ring-primary/40')}>
              {g.from === g.to ? g.from : `${g.from}–${g.to}`}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label><span className="label">Du verset</span><input className="input mt-1" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} /></label>
        <label><span className="label">Au verset</span><input className="input mt-1" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} /></label>
        <button
          className="btn-soft"
          disabled={!a}
          onClick={() => {
            const f = Math.max(1, Math.min(n, +a));
            const t = Math.max(f, Math.min(n, +(b || a)));
            const next = new Set(selected);
            range(f, t).forEach((x) => next.add(x));
            onChange(next);
          }}
        >
          Ajouter
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="label">Versets</p>
        <div className="flex gap-3 text-sm font-semibold text-primary">
          <button onClick={() => onChange(new Set(range(1, n)))}>Tout</button>
          <button onClick={() => onChange(new Set())}>Aucun</button>
        </div>
      </div>
      <div
        className="mt-2 grid grid-cols-6 gap-1.5 select-none sm:grid-cols-8"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          const c = cellAt(e.clientX, e.clientY);
          if (c) drag.current = { start: c, x: e.clientX, y: e.clientY, on: false, add: !selected.has(c), base: new Set(selected) };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (!d.on) {
            const dx = Math.abs(e.clientX - d.x);
            const dy = Math.abs(e.clientY - d.y);
            if (dx > 9 && dx > dy) {
              d.on = true;
              haptic('select');
            } else return;
          }
          const c = cellAt(e.clientX, e.clientY);
          if (c) paint(c);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.on) {
            const next = new Set(selected);
            next.has(d.start) ? next.delete(d.start) : next.add(d.start);
            haptic('tap');
            onChange(next);
          }
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        {range(1, n).map((v) => {
          const sel = selected.has(v);
          const k = verseKind(verses[ayahId(surah, v)]);
          return (
            <div key={v} data-verse={v} className={cx('flex aspect-square min-h-[44px] items-center justify-center rounded-xl text-[15px] font-semibold tabular-nums transition', sel ? 'bg-primary text-primary-ink' : KIND_RING[k])}>
              {v}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Touche un verset, ou glisse horizontalement sur la grille pour en sélectionner plusieurs. Gris : non suivi · bleu : en apprentissage · vert : appris · ambre : à renforcer.</p>
    </div>
  );
}
