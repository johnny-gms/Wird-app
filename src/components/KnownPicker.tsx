import { Check } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { SURAHS } from '@/engine/quran';
import { haptic } from '@/lib/haptics';
import { FastScroll } from './FastScroll';
import { matchSurah } from './SurahPickerList';
import { SurahNumber, cx } from './ui';

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

/** Choix des sourates déjà apprises : cases, sélection multiple (tout, Juz ʿAmma, plage, recherche) et défilement rapide. */
export function KnownPicker({ known, setKnown }: { known: Set<number>; setKnown: (s: Set<number>) => void }) {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const list = useMemo(() => SURAHS.filter((s) => matchSurah(s, q)), [q]);
  const toggle = (id: number) => {
    haptic('select');
    const n = new Set(known);
    n.has(id) ? n.delete(id) : n.add(id);
    setKnown(n);
  };
  const setMany = (ids: number[], on: boolean) => {
    haptic('tap');
    const n = new Set(known);
    ids.forEach((i) => (on ? n.add(i) : n.delete(i)));
    setKnown(n);
  };
  const f = Math.max(1, Math.min(114, parseInt(from) || 0));
  const t = Math.max(1, Math.min(114, parseInt(to) || 0));
  return (
    <div>
      <input className="input" placeholder="Rechercher (nom, numéro, arabe)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une sourate" />
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        <button className="chip" onClick={() => setMany(range(1, 114), true)}>Tout cocher</button>
        <button className="chip" onClick={() => setKnown(new Set())}>Tout décocher</button>
        <button className="chip" onClick={() => setMany(range(78, 114), true)}>Juz ʿAmma (78–114)</button>
        <button className="chip" onClick={() => setMany(list.map((s) => s.id), true)}>Cocher la recherche</button>
      </div>
      <div className="card mt-3 flex items-center gap-2 px-3 py-2 text-sm">
        <span className="text-muted">Cocher de la sourate</span>
        <input inputMode="numeric" className="h-9 w-14 rounded-lg border border-line bg-bg text-center" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} aria-label="De la sourate" />
        <span className="text-muted">à</span>
        <input inputMode="numeric" className="h-9 w-14 rounded-lg border border-line bg-bg text-center" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} aria-label="À la sourate" />
        <button className="ml-auto rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-ink disabled:opacity-40" disabled={!from || !to} onClick={() => setMany(range(Math.min(f, t), Math.max(f, t)), true)}>Cocher</button>
      </div>
      <ul ref={listRef} className="card mt-4 divide-y divide-line overflow-hidden">
        {list.map((s) => {
          const on = known.has(s.id);
          return (
            <li key={s.id}>
              <button role="checkbox" aria-checked={on} onClick={() => toggle(s.id)} className={cx('flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition active:bg-surface2', on && 'bg-good-soft/60')}>
                <SurahNumber n={s.id} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{s.tr}</span>
                  <span className="block text-xs text-muted">{s.fr} · {s.n} versets</span>
                </span>
                <span className="ar mr-1 text-xl leading-none" lang="ar">{s.ar}</span>
                <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition', on ? 'border-good bg-good text-white' : 'border-line')}>{on && <Check size={15} strokeWidth={3} />}</span>
              </button>
            </li>
          );
        })}
        {!list.length && <li className="p-8 text-center text-sm text-muted">Aucune sourate trouvée.</li>}
      </ul>
      <FastScroll targetRef={listRef} count={list.length} label={(i) => `${list[i]?.id}. ${list[i]?.tr}`} top={72} bottom={120} />
    </div>
  );
}
