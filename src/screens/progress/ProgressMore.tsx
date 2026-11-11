import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SurahPickerList } from '@/components/SurahPickerList';
import { ConfirmSheet, Empty, GradeChip, KindBadge, ProgressBar, Segmented, Sheet, cx } from '@/components/ui';
import { GRADE_LABEL } from '@/engine/config';
import { addDays, endOfMonth, parseKey, startOfMonth, startOfWeek } from '@/engine/dates';
import { activeDaySet, activeDaysIn, surahStats } from '@/engine/progress';
import { rangeLabel, surahMeta } from '@/engine/quran';
import { periodReport } from '@/engine/reports';
import type { Grade, GoalType, PersonalGoal } from '@/engine/types';
import { formatDateShort, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';

// ------------------------------------------------------------------ Historique
export function History() {
  const { history, dayLog } = useWird();
  const [limit, setLimit] = useState(7);
  const groups = useMemo(() => {
    const map = new Map<string, typeof history>();
    for (const h of [...history].reverse()) map.set(h.date, [...(map.get(h.date) ?? []), h]);
    return [...map.entries()];
  }, [history]);
  if (!groups.length) return <Empty title="Pas encore d’historique">Chaque évaluation enregistrée apparaîtra ici : date, sourate, versets, type de travail et résultat.</Empty>;
  return (
    <div className="space-y-5">
      {groups.slice(0, limit).map(([date, entries]) => {
        const rec = dayLog.find((d) => d.date === date);
        return (
          <section key={date}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{formatDateShort(date)}</h2>
              {rec && (
                <p className="flex gap-1.5 text-[11px] font-semibold">
                  <span className="rounded-full bg-good-soft px-2 py-0.5 text-good">{rec.done} terminé{rec.done > 1 ? 's' : ''}</span>
                  {rec.skipped > 0 && <span className="rounded-full bg-surface2 px-2 py-0.5 text-muted">{rec.skipped} ignoré{rec.skipped > 1 ? 's' : ''}</span>}
                  {rec.notDone > 0 && <span className="rounded-full bg-surface2 px-2 py-0.5 text-muted">{rec.notDone} non effectué{rec.notDone > 1 ? 's' : ''}</span>}
                </p>
              )}
            </div>
            <ul className="card divide-y divide-line/60 overflow-hidden">
              {entries.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{surahMeta(h.surah).tr}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {rangeLabel(h.surah, h.from, h.to).replace(/^Sourate \d+ — /, '')} <KindBadge kind={h.kind} />
                    </p>
                  </div>
                  <GradeChip grade={h.grade} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {groups.length > limit && <button className="btn-outline w-full" onClick={() => setLimit(limit + 7)}>Voir plus</button>}
    </div>
  );
}

// ------------------------------------------------------------------ Bilans
export function Reports() {
  const today = useToday();
  const { history, progressLog } = useWird();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [offset, setOffset] = useState(0);
  const { from, to, label } = useMemo(() => {
    if (mode === 'week') {
      const f = addDays(startOfWeek(today), offset * 7);
      const t = addDays(f, 6);
      return { from: f, to: t, label: `${formatDateShort(f)} → ${formatDateShort(t)}` };
    }
    const d = parseKey(today);
    const m = new Date(d.getFullYear(), d.getMonth() + offset, 1, 12);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
    return { from: startOfMonth(key), to: endOfMonth(key), label: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(m) };
  }, [mode, offset, today]);
  const r = useMemo(() => periodReport(history, progressLog, from, to), [history, progressLog, from, to]);
  const total = r.verses || 1;
  const GR: Grade[] = ['mastered', 'hesitant', 'difficult', 'failed'];
  const barTone: Record<Grade, string> = { mastered: 'bg-good', hesitant: 'bg-warn', difficult: 'bg-hard', failed: 'bg-alert' };

  return (
    <div className="space-y-3">
      <Segmented value={mode} onChange={(m) => { setMode(m); setOffset(0); }} options={[{ value: 'week', label: 'Semaine' }, { value: 'month', label: 'Mois' }]} />
      <div className="flex items-center justify-between">
        <button onClick={() => setOffset(offset - 1)} aria-label="Période précédente" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface2"><ChevronLeft /></button>
        <p className="text-sm font-semibold capitalize">{label}</p>
        <button onClick={() => setOffset(offset + 1)} disabled={offset >= 0} aria-label="Période suivante" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface2 disabled:opacity-30"><ChevronRight /></button>
      </div>
      {r.items === 0 ? (
        <Empty title="Aucun travail sur cette période">Les bilans se construisent à partir de vos évaluations réelles. Rien n’est estimé.</Empty>
      ) : (
        <>
          <section className="card grid grid-cols-3 gap-2 p-5 text-center">
            <div><p className="font-display text-3xl font-semibold tabular-nums">{r.activeDays}</p><p className="text-xs text-muted">jour{r.activeDays > 1 ? 's' : ''} actif{r.activeDays > 1 ? 's' : ''} / {r.periodDays}</p></div>
            <div><p className="font-display text-3xl font-semibold tabular-nums">{r.verses}</p><p className="text-xs text-muted">versets travaillés</p></div>
            <div><p className="font-display text-3xl font-semibold tabular-nums">{r.surahs.length}</p><p className="text-xs text-muted">sourate{r.surahs.length > 1 ? 's' : ''}</p></div>
          </section>
          <section className="card p-5">
            <h3 className="label mb-3">Évaluations</h3>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface2">
              {GR.map((g) => r.byGrade[g] > 0 && <div key={g} className={barTone[g]} style={{ width: `${(r.byGrade[g] / total) * 100}%` }} />)}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {GR.map((g) => <li key={g} className="flex items-center gap-2"><i className={cx('h-2.5 w-2.5 rounded-full', barTone[g])} /><span className="text-muted">{GRADE_LABEL[g]}</span><b className="ml-auto tabular-nums">{r.byGrade[g]}</b></li>)}
            </ul>
          </section>
          {r.memorizedDelta !== null && r.memorizedDelta !== 0 && (
            <section className="card p-5"><h3 className="label">Progrès</h3><p className="mt-2 text-sm">{r.memorizedDelta > 0 ? `Votre mémorisation suivie a progressé de ${r.memorizedDelta} verset${r.memorizedDelta > 1 ? 's' : ''} sur cette période.` : `${-r.memorizedDelta} verset${-r.memorizedDelta > 1 ? 's' : ''} retiré${-r.memorizedDelta > 1 ? 's' : ''} du suivi sur cette période.`}</p></section>
          )}
          <section className="card p-5">
            <h3 className="label">Difficultés récurrentes</h3>
            {r.difficulties.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Aucun verset n’a été jugé difficile à répétition. 👍</p>
            ) : (
              <>
                <p className="mb-2 mt-1 text-xs text-muted">Versets évalués « difficile » ou « non maîtrisé » au moins deux fois.</p>
                <ul className="divide-y divide-line/60">
                  {r.difficulties.map((d) => <li key={`${d.surah}-${d.from}`} className="py-2.5 text-sm"><b>{surahMeta(d.surah).tr}</b> <span className="text-muted">· {rangeLabel(d.surah, d.from, d.to).replace(/^Sourate \d+ — /, '')}</span></li>)}
                </ul>
              </>
            )}
          </section>
          <section className="card p-5">
            <h3 className="label mb-2">Sourates travaillées</h3>
            <ul className="space-y-1.5">
              {r.surahs.slice(0, 8).map((s) => <li key={s.surah} className="flex justify-between text-sm"><span>{s.surah}. {surahMeta(s.surah).tr}</span><span className="text-muted tabular-nums">{s.verses} versets</span></li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Objectifs
const TYPE_LABEL: Record<GoalType, string> = { memorization: 'Mémorisation', review: 'Révision', regularity: 'Régularité' };

export function Goals() {
  const today = useToday();
  const { personalGoals, verses, history, rotation, toggleGoalAchieved, deletePersonalGoal } = useWird();
  const [add, setAdd] = useState(false);
  const [del, setDel] = useState<PersonalGoal | null>(null);
  const days = useMemo(() => activeDaySet(history), [history]);
  const wk = startOfWeek(today);
  const weekActive = activeDaysIn(days, wk, addDays(wk, 6));

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted">Des intentions simples, sans chiffres imposés. Elles servent de repères, jamais de pression.</p>
      {personalGoals.length === 0 && <Empty title="Aucun objectif">Par exemple : « Mémoriser la sourate Al-Mulk » ou « Réviser un peu chaque jour ».</Empty>}
      {personalGoals.map((g) => {
        let progress: { v: number; text: string } | null = null;
        if (g.type === 'memorization' && g.surah) {
          const st = surahStats(verses, g.surah, today);
          progress = { v: st.memorized / st.total, text: `${surahMeta(g.surah).tr} : ${Math.round((st.memorized / st.total) * 100)} % de la sourate` };
        } else if (g.type === 'regularity' && g.daysPerWeek) progress = { v: Math.min(1, weekActive / g.daysPerWeek), text: `Cette semaine : ${weekActive} / ${g.daysPerWeek} jours` };
        else if (g.type === 'review') progress = { v: 0, text: rotation.cycles > 0 ? `Tours complets de rotation : ${rotation.cycles}` : '' };
        return (
          <article key={g.id} className={cx('card p-4', g.achievedAt && 'opacity-80')}>
            <div className="flex items-start gap-3">
              <button onClick={() => toggleGoalAchieved(g.id)} aria-pressed={!!g.achievedAt} aria-label={g.achievedAt ? 'Marquer comme non atteint' : 'Marquer comme atteint'} className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition', g.achievedAt ? 'border-good bg-good text-white' : 'border-line')}>
                {g.achievedAt && <Check size={15} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cx('text-[15px] font-semibold', g.achievedAt && 'line-through')}>{g.title}</p>
                <p className="text-xs text-muted">{TYPE_LABEL[g.type]}{g.achievedAt ? ' · atteint' : ''}</p>
                {progress && progress.text && (
                  <div className="mt-2">
                    {g.type !== 'review' && <ProgressBar value={progress.v} tone="good" />}
                    <p className="mt-1 text-xs text-muted">{progress.text}</p>
                  </div>
                )}
              </div>
              <button onClick={() => setDel(g)} aria-label="Supprimer l’objectif" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2"><Trash2 size={16} /></button>
            </div>
          </article>
        );
      })}
      <button className="btn-outline w-full" onClick={() => setAdd(true)}><Plus size={18} /> Ajouter un objectif</button>
      <AddGoal open={add} onClose={() => setAdd(false)} />
      <ConfirmSheet open={!!del} onClose={() => setDel(null)} title="Supprimer cet objectif ?" message={del?.title ?? ''} confirmLabel="Supprimer" danger onConfirm={() => del && deletePersonalGoal(del.id)} />
    </div>
  );
}

function AddGoal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const add = useWird((s) => s.addPersonalGoal);
  const [type, setType] = useState<GoalType>('memorization');
  const [title, setTitle] = useState('');
  const [surah, setSurah] = useState<number | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [pick, setPick] = useState(false);

  const suggestions: Record<GoalType, string[]> = {
    memorization: [],
    review: ['Réviser régulièrement tout ce que j’ai mémorisé', 'Terminer un tour complet de ma rotation'],
    regularity: ['Travailler un peu chaque jour', 'Revenir régulièrement, même brièvement'],
  };
  const reset = () => { setTitle(''); setSurah(null); setDays(null); setPick(false); };
  const save = () => {
    const t = title.trim() || (type === 'memorization' && surah ? `Mémoriser la sourate ${surahMeta(surah).tr}` : '');
    if (!t) return;
    add({ type, title: t, surah: type === 'memorization' ? surah ?? undefined : undefined, daysPerWeek: type === 'regularity' ? days ?? undefined : undefined });
    reset();
    onClose();
  };
  return (
    <Sheet open={open} onClose={() => { reset(); onClose(); }} title="Nouvel objectif">
      <Segmented<GoalType> value={type} onChange={(t) => { setType(t); setTitle(''); setPick(false); }} options={[{ value: 'memorization', label: 'Mémorisation' }, { value: 'review', label: 'Révision' }, { value: 'regularity', label: 'Régularité' }]} />
      <div className="mt-4 space-y-3">
        {type === 'memorization' && (
          pick ? <SurahPickerList height="max-h-[36dvh]" onPick={(id) => { setSurah(id); setPick(false); }} /> : (
            <button className="btn-outline w-full justify-between" onClick={() => setPick(true)}>
              <span>{surah ? `${surah}. ${surahMeta(surah).tr}` : 'Choisir une sourate (facultatif)'}</span><ChevronRight size={16} />
            </button>
          )
        )}
        {type === 'regularity' && (
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-2">
            <span className="text-sm">Jours par semaine <span className="text-muted">(facultatif)</span></span>
            <div className="flex items-center gap-1">
              <button className="h-10 w-10 rounded-full bg-surface2 text-lg" onClick={() => setDays(days && days > 1 ? days - 1 : null)} aria-label="Moins">−</button>
              <span className="w-8 text-center font-semibold tabular-nums">{days ?? '—'}</span>
              <button className="h-10 w-10 rounded-full bg-surface2 text-lg" onClick={() => setDays(Math.min(7, (days ?? 0) + 1))} aria-label="Plus">+</button>
            </div>
          </div>
        )}
        <input className="input" placeholder={type === 'memorization' ? 'Intitulé (ou laissez vide)' : 'Intitulé de l’objectif'} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        <div className="flex flex-wrap gap-2">
          {suggestions[type].map((s) => <button key={s} className="rounded-full bg-surface2 px-3 py-2 text-xs font-medium" onClick={() => setTitle(s)}>{s}</button>)}
        </div>
        <button className="btn-primary w-full" onClick={save} disabled={!title.trim() && !(type === 'memorization' && surah)}>Enregistrer</button>
      </div>
    </Sheet>
  );
}
