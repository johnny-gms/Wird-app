import { Check } from 'lucide-react';
import { useMemo } from 'react';
import { formatPages } from '@/engine/pages';
import { learnPreview } from '@/engine/plan';
import type { Direction, LearnEvery, LearnMode, LearnUnit, VerseState } from '@/engine/types';
import { cx } from './ui';

export interface LearnValue {
  mode: LearnMode;
  unit: LearnUnit;
  every: LearnEvery;
}

const MODES: { v: LearnMode; title: string; sub: string }[] = [
  { v: 'surah', title: 'Une sourate par semaine', sub: 'Pour débuter : une sourate à la fois, répartie sur la semaine' },
  { v: 'hizb', title: 'Un demi-Hizb ou un Hizb', sub: 'Avancer par divisions du Coran, à ton rythme' },
  { v: 'off', title: 'Pas de nouvel apprentissage', sub: 'Seulement réviser ce que tu as déjà appris' },
];

/** Choix du rythme d'apprentissage (partagé entre l'onboarding et les paramètres). */
export function LearnPicker({ value, onChange, verses, direction }: { value: LearnValue; onChange: (v: LearnValue) => void; verses: Record<number, VerseState>; direction: Direction }) {
  const preview = useMemo(
    () => (value.mode === 'off' ? null : learnPreview(verses, { learnMode: value.mode, learnUnit: value.unit, learnEvery: value.every, learnDirection: direction })),
    [verses, value, direction],
  );
  const seg = <T extends string | number>(opts: { v: T; l: string }[], cur: T, set: (v: T) => void, label: string) => (
    <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {opts.map((o) => <button key={String(o.v)} role="radio" aria-checked={cur === o.v} onClick={() => set(o.v)} className="chip chip-sm">{o.l}</button>)}
    </div>
  );
  return (
    <div>
      <div className="grid gap-2.5" role="radiogroup" aria-label="Rythme d’apprentissage">
        {MODES.map((o) => (
          <button key={o.v} role="radio" aria-checked={value.mode === o.v} onClick={() => onChange({ ...value, mode: o.v })} className={cx('flex w-full items-center gap-3.5 rounded-[18px] border-[1.5px] p-4 text-left transition', value.mode === o.v ? 'border-primary bg-primary/10' : 'border-line bg-surface')}>
            <span className="flex-1"><b className="block text-[15.5px]">{o.title}</b><small className="text-[13px] text-muted">{o.sub}</small></span>
            <span className={cx('flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2', value.mode === o.v ? 'border-primary bg-primary text-primary-ink' : 'border-line')}>{value.mode === o.v && <Check size={12} strokeWidth={3.5} />}</span>
          </button>
        ))}
      </div>
      {value.mode === 'hizb' && (
        <div className="card mt-3 space-y-3 p-4">
          <div>
            <p className="text-sm text-muted">Unité</p>
            {seg<LearnUnit>([{ v: 'half', l: 'Demi-Hizb' }, { v: 'full', l: 'Hizb' }], value.unit, (unit) => onChange({ ...value, unit }), 'Unité')}
          </div>
          <div>
            <p className="text-sm text-muted">Rythme</p>
            {seg<LearnEvery>([{ v: 1, l: 'Chaque jour' }, { v: 2, l: 'Tous les 2 jours' }, { v: 7, l: 'Chaque semaine' }], value.every, (every) => onChange({ ...value, every }), 'Rythme')}
          </div>
        </div>
      )}
      {preview && (
        <p className="card mt-3 px-4 py-3 text-sm leading-relaxed">
          Prochain passage : <b>{preview.label}</b>. Environ <b>{formatPages(preview.pagesPerDay)}</b> par jour{value.mode === 'hizb' && preview.pagesPerDay > 4 ? ' : un rythme plus lent est plus facile à tenir, tu peux commencer doucement et ajuster plus tard.' : '.'}
        </p>
      )}
      {value.mode !== 'off' && !preview && <p className="card mt-3 px-4 py-3 text-sm text-muted">Il n’y a plus de nouveau passage à apprendre dans ce sens.</p>}
    </div>
  );
}
