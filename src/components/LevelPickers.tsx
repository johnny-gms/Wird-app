import { Check, Minus, Plus } from 'lucide-react';
import { PAGES_PER_UNIT } from '@/engine/plan';
import type { Settings } from '@/engine/types';
import { cx } from './ui';

// ------------------------------------------------------------------ Apprentissage : 3 niveaux

export type LearnLevel = 'beginner' | 'intermediate' | 'advanced' | 'off';
export interface LearnLevelValue {
  /** null = ancien réglage (rythme par sourate / Hizb) : aucun niveau sélectionné. */
  level: LearnLevel | null;
  verses: number;
  /** Pages par semaine proposées au niveau Intermédiaire (suggestion : 1,5) et Avancé (suggestion : 3), modifiables par pas de 0,5. */
  interPages: number;
  advPages: number;
}

export const DEFAULT_LEARN: LearnLevelValue = { level: 'beginner', verses: 7, interPages: 1.5, advPages: 3 };

export function learnValueFromSettings(s: Pick<Settings, 'learnMode' | 'learnWeekly'>): LearnLevelValue {
  if (s.learnMode === 'off') return { ...DEFAULT_LEARN, level: 'off' };
  const w = s.learnWeekly;
  if (!w) return { ...DEFAULT_LEARN, level: null };
  if (w.unit === 'verses') return { ...DEFAULT_LEARN, level: 'beginner', verses: w.amount };
  const level = w.level ?? (w.amount <= 1.5 ? 'intermediate' : 'advanced');
  return level === 'intermediate' ? { ...DEFAULT_LEARN, level, interPages: w.amount } : { ...DEFAULT_LEARN, level, advPages: w.amount };
}

export function learnPatch(v: LearnLevelValue): Pick<Settings, 'learnMode' | 'learnWeekly'> {
  switch (v.level) {
    case 'beginner': return { learnMode: 'surah', learnWeekly: { unit: 'verses', amount: v.verses } };
    case 'intermediate': return { learnMode: 'surah', learnWeekly: { unit: 'pages', amount: v.interPages, level: 'intermediate' } };
    case 'advanced': return { learnMode: 'surah', learnWeekly: { unit: 'pages', amount: v.advPages, level: 'advanced' } };
    case 'off': return { learnMode: 'off', learnWeekly: null };
    default: return { learnMode: 'surah', learnWeekly: null };
  }
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);

export function learnSummary(v: LearnLevelValue): string {
  switch (v.level) {
    case 'beginner': return `${v.verses} verset${v.verses > 1 ? 's' : ''} par semaine`;
    case 'intermediate': return `${fmt(v.interPages)} page${v.interPages > 1 ? 's' : ''} par semaine`;
    case 'advanced': return `${fmt(v.advPages)} page${v.advPages > 1 ? 's' : ''} par semaine`;
    case 'off': return 'Pas de nouvel apprentissage';
    default: return 'Rythme personnalisé';
  }
}

// ------------------------------------------------------------------ Révision : 3 niveaux

export type ReviewUnit = 'pages' | 'hizb' | 'juz';
export interface ReviewValue {
  unit: ReviewUnit;
  amount: number;
}
export const DEFAULT_REVIEW: ReviewValue = { unit: 'pages', amount: 7 };
const REVIEW_DEFAULT_AMOUNT: Record<ReviewUnit, number> = { pages: 7, hizb: 1, juz: 1 };

export function reviewValueFromSettings(s: Pick<Settings, 'reviewWeekly' | 'reviewPagesPerDay'>): ReviewValue {
  return s.reviewWeekly ?? { unit: 'pages', amount: Math.max(1, s.reviewPagesPerDay * 7) };
}

export function reviewPatch(v: ReviewValue): Pick<Settings, 'reviewWeekly' | 'reviewPagesPerDay'> {
  const perWeek = v.amount * PAGES_PER_UNIT[v.unit];
  return { reviewWeekly: { unit: v.unit, amount: v.amount }, reviewPagesPerDay: Math.max(1, Math.min(20, Math.round(perWeek / 7))) };
}

export function reviewSummary(v: ReviewValue): string {
  const n = v.amount;
  return v.unit === 'pages' ? `${n} page${n > 1 ? 's' : ''} par semaine` : v.unit === 'hizb' ? `${n} Hizb par semaine` : `${n} Juz par semaine`;
}

// ------------------------------------------------------------------ Éléments communs

export function NumStepper({ value, onChange, min, max, one, many, label, step = 1 }: { value: number; onChange: (n: number) => void; min: number; max: number; one: string; many: string; label: string; step?: number }) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, Math.round(n / step) * step)));
  return (
    <div className="flex items-center justify-center gap-3">
      <button type="button" aria-label={`Moins de ${many} ${label}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 disabled:opacity-35" disabled={value <= min} onClick={() => set(value - step)}><Minus size={18} /></button>
      <div className="w-[104px] text-center">
        <p className="text-[30px] font-extrabold leading-none tabular-nums">{fmt(value)}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[.12em] text-muted">{value > 1 ? many : one}</p>
      </div>
      <button type="button" aria-label={`Plus de ${many} ${label}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 disabled:opacity-35" disabled={value >= max} onClick={() => set(value + step)}><Plus size={18} /></button>
    </div>
  );
}

function LevelCard({ on, title, sub, onSelect, children }: { on: boolean; title: string; sub: string; onSelect: () => void; children?: React.ReactNode }) {
  return (
    <div className={cx('rounded-[18px] border-[1.5px] transition', on ? 'border-primary bg-primary/10' : 'border-line bg-surface')}>
      <button type="button" role="radio" aria-checked={on} onClick={onSelect} className="flex w-full items-center gap-3.5 p-4 text-left">
        <span className="min-w-0 flex-1"><b className="block text-[15.5px]">{title}</b><small className="text-[13px] text-muted">{sub}</small></span>
        <span className={cx('flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2', on ? 'border-primary bg-primary text-primary-ink' : 'border-line')}>{on && <Check size={12} strokeWidth={3.5} />}</span>
      </button>
      {on && children && <div className="border-t border-primary/15 px-4 pb-4 pt-3.5">{children}</div>}
    </div>
  );
}

/** Choix du niveau d'apprentissage : Je débute (versets par semaine) · Intermédiaire (1 page par semaine) · Avancé (plus d'une page par semaine). */
export function LearnLevels({ value, onChange }: { value: LearnLevelValue; onChange: (v: LearnLevelValue) => void }) {
  const set = (level: LearnLevel) => onChange({ ...value, level });
  return (
    <div>
      <div className="grid gap-2.5" role="radiogroup" aria-label="Niveau d’apprentissage">
        <LevelCard on={value.level === 'beginner'} title="Je débute" sub="Quelques versets par semaine, à ton rythme" onSelect={() => set('beginner')}>
          <p className="mb-2.5 text-center text-sm text-muted">Combien de versets veux-tu apprendre par semaine ?</p>
          <NumStepper value={value.verses} onChange={(verses) => onChange({ ...value, level: 'beginner', verses })} min={1} max={100} one="verset" many="versets" label="par semaine" />
        </LevelCard>
        <LevelCard on={value.level === 'intermediate'} title="Intermédiaire" sub="Environ 1,5 page par semaine (suggéré)" onSelect={() => set('intermediate')}>
          <p className="mb-2.5 text-center text-sm text-muted">Suggestion : 1,5 page par semaine. Tu peux ajuster par pas de 0,5.</p>
          <NumStepper value={value.interPages} onChange={(interPages) => onChange({ ...value, level: 'intermediate', interPages })} min={0.5} max={30} step={0.5} one="page" many="pages" label="par semaine" />
        </LevelCard>
        <LevelCard on={value.level === 'advanced'} title="Avancé" sub="Environ 3 pages par semaine (suggéré)" onSelect={() => set('advanced')}>
          <p className="mb-2.5 text-center text-sm text-muted">Suggestion : 3 pages par semaine. Tu peux ajuster par pas de 0,5.</p>
          <NumStepper value={value.advPages} onChange={(advPages) => onChange({ ...value, level: 'advanced', advPages })} min={0.5} max={30} step={0.5} one="page" many="pages" label="par semaine" />
        </LevelCard>
      </div>
      <button type="button" role="radio" aria-checked={value.level === 'off'} onClick={() => set('off')} className={cx('mt-3 w-full text-center text-sm font-semibold underline-offset-4', value.level === 'off' ? 'text-primary underline' : 'text-muted hover:underline')}>
        {value.level === 'off' ? '✓ ' : ''}Pas de nouvel apprentissage pour l’instant
      </button>
    </div>
  );
}

/** Choix du rythme de révision : pages, Hizb ou Juz par semaine, toujours du début vers la fin du Coran. */
export function ReviewLevels({ value, onChange }: { value: ReviewValue; onChange: (v: ReviewValue) => void }) {
  const pick = (unit: ReviewUnit) => onChange(value.unit === unit ? value : { unit, amount: REVIEW_DEFAULT_AMOUNT[unit] });
  return (
    <div>
      <div className="grid gap-2.5" role="radiogroup" aria-label="Rythme de révision">
        <LevelCard on={value.unit === 'pages'} title="Je débute" sub="Un nombre de pages à réviser par semaine" onSelect={() => pick('pages')}>
          <NumStepper value={value.amount} onChange={(amount) => onChange({ unit: 'pages', amount })} min={1} max={100} one="page" many="pages" label="à réviser par semaine" />
        </LevelCard>
        <LevelCard on={value.unit === 'hizb'} title="Intermédiaire" sub="Un nombre de Hizb à réviser par semaine" onSelect={() => pick('hizb')}>
          <NumStepper value={value.amount} onChange={(amount) => onChange({ unit: 'hizb', amount })} min={1} max={20} one="Hizb" many="Hizb" label="à réviser par semaine" />
        </LevelCard>
        <LevelCard on={value.unit === 'juz'} title="Avancé" sub="Un nombre de Juz à réviser par semaine" onSelect={() => pick('juz')}>
          <NumStepper value={value.amount} onChange={(amount) => onChange({ unit: 'juz', amount })} min={1} max={10} one="Juz" many="Juz" label="à réviser par semaine" />
        </LevelCard>
      </div>
      <p className="mt-3 text-center text-xs leading-relaxed text-muted">La révision suit toujours le Coran du début vers la fin.</p>
    </div>
  );
}
