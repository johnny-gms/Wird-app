import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useMemo } from 'react';
import { goalProgress } from '@/engine/plan';
import { overall } from '@/engine/progress';
import { formatDuration, rangeLabel, surahMeta } from '@/engine/quran';
import { useToday } from '@/lib/hooks';
import { planCounts } from '@/lib/plan';
import { useWird } from '@/store/useWird';
import { ProgressBar, Screen } from '@/components/ui';
import { formatPages } from '@/engine/pages';
import { itemPages } from '@/engine/plan';

export default function Bilan() {
  const nav = useNavigate();
  const today = useToday();
  const { summaries, plan, goals, verses, startSession } = useWird();
  const summary = [...summaries].reverse().find((s) => s.date === today);
  const c = planCounts(plan);
  const o = useMemo(() => overall(verses, today), [verses, today]);
  if (!summary) return <Navigate to="/" replace />;
  const complete = c.open === 0;
  const learnToday = (plan?.items ?? []).filter((i) => i.kind === 'learn' && i.status === 'done');

  const donePages = (plan?.items ?? []).filter((i) => i.status === 'done').reduce((a, i) => a + itemPages(i), 0);
  return (
    <Screen title={complete ? 'Séance accomplie' : 'Bien joué pour aujourd’hui'} sub={complete ? 'Qu’Allah accepte votre effort. À demain, in châ’ Allah.' : 'Ce qui reste peut attendre : rien n’est reporté ni dû.'}>
      <div className="flex items-center gap-4 rounded-xl border border-gold/40 bg-surface p-4">
        <span className="flex h-12 w-12 shrink-0 animate-pop items-center justify-center rounded-full bg-deep text-gold"><Check size={24} strokeWidth={2.4} /></span>
        <p className="text-sm leading-relaxed text-muted">Votre bilan est enregistré : les règles de progression et de renforcement ont été appliquées. <b className="text-ink">{formatPages(donePages)}</b> travaillées aujourd’hui.</p>
      </div>

      <section className="card mt-4 p-5" aria-label="Bilan">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Big n={summary.verses} l="versets travaillés" />
          <Big n={summary.mastered} l="maîtrisés" tone="text-good" />
          <Big n={summary.toReinforce} l="à renforcer" tone="text-warn" />
        </div>
        <p className="mt-3 text-center text-xs text-muted">Les versets à renforcer reviendront d’eux-mêmes dans votre programme, au bon moment.</p>
        <div className="mt-5 border-t border-line/60 pt-4">
          <p className="label mb-2">Sourates concernées</p>
          <ul className="flex flex-wrap gap-1.5">
            {summary.surahs.map((s) => (
              <li key={s} className="rounded-full bg-surface2 px-3 py-1.5 text-sm font-medium">
                {s}. {surahMeta(s).tr}
              </li>
            ))}
          </ul>
        </div>
        {summary.activeMs >= 60_000 && (
          <p className="mt-4 flex justify-between border-t border-line/60 pt-4 text-sm">
            <span className="text-muted">Temps actif</span>
            <span className="font-semibold">{formatDuration(summary.activeMs)}</span>
          </p>
        )}
      </section>

      <section className="card mt-3 p-5" aria-label="Progression réalisée">
        <p className="label mb-3">Progression réalisée</p>
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-muted">Programme du jour</span>
          <span className="font-semibold tabular-nums">{summary.itemsDone} / {summary.itemsTotal}</span>
        </div>
        <ProgressBar value={summary.itemsTotal ? summary.itemsDone / summary.itemsTotal : 0} />
        {learnToday.map((i) => {
          const g = goals.find((x) => x.id === i.goalId);
          if (!g) return null;
          const p = goalProgress(g);
          return (
            <div key={i.id} className="mt-4">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-muted">Apprentissage — {surahMeta(g.surah).tr}</span>
                <span className="font-semibold tabular-nums">{p.done} / {p.total}</span>
              </div>
              <ProgressBar value={p.total ? p.done / p.total : 0} tone="good" />
              <p className="mt-1 text-xs text-muted">{rangeLabel(g.surah, g.from, g.to)}</p>
            </div>
          );
        })}
        {o.memorizedVerses > 0 && <p className="mt-4 text-sm text-muted">Vous entretenez aujourd’hui environ {o.ratio < 0.01 ? 'moins de 1' : Math.round(o.ratio * 100)} % du Coran.</p>}
      </section>

      <div className="mt-6 flex flex-col gap-2">
        {!complete && (
          <button className="btn-soft" onClick={() => { if (startSession()) nav('/session'); }}>
            Continuer maintenant
          </button>
        )}
        <Link to="/" className="btn-primary">Retour à l’accueil</Link>
        <Link to="/progression/general" className="btn-ghost">Voir ma progression</Link>
      </div>
    </Screen>
  );
}

function Big({ n, l, tone }: { n: number; l: string; tone?: string }) {
  return (
    <div>
      <p className={`font-display text-4xl font-semibold tabular-nums ${tone ?? ''}`}>{n}</p>
      <p className="mt-0.5 text-xs leading-tight text-muted">{l}</p>
    </div>
  );
}
