import { ArrowRight, Check, Play } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays, startOfWeek } from '@/engine/dates';
import { activeDaySet, activeDaysIn, currentStreak, overall } from '@/engine/progress';
import { rangeLabel, surahMeta } from '@/engine/quran';
import { formatDateLong, greeting, useToday } from '@/lib/hooks';
import { planCounts } from '@/lib/plan';
import { useWird } from '@/store/useWird';
import { Page, ProgressBar, cx } from '@/components/ui';

export default function Home() {
  const nav = useNavigate();
  const today = useToday();
  const { profile, plan, verses, history, summaries, startSession } = useWird();
  const c = planCounts(plan);
  const o = useMemo(() => overall(verses, today), [verses, today]);
  const days = useMemo(() => activeDaySet(history), [history]);
  const streak = currentStreak(days, today);
  const weekStart = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekActive = activeDaysIn(days, weekStart, addDays(weekStart, 6));
  const hasAny = o.memorizedVerses + o.learningVerses > 0;
  const finished = c.total > 0 && c.open === 0;
  const started = c.done > 0 || c.inProgress !== null;
  const hasSummary = summaries.some((s) => s.date === today);

  const go = () => {
    if (finished) return nav('/session/bilan');
    if (startSession()) nav('/session');
  };

  const message = (() => {
    if (history.length === 0) return 'Votre première séance vous attend, sans pression.';
    if (days.has(today)) return streak >= 3 ? `${streak} jours de suite. Belle constance, qu’Allah vous facilite.` : 'Vous avez travaillé aujourd’hui. Très bien.';
    if (streak >= 1) return `${streak} ${streak > 1 ? 'jours' : 'jour'} de suite jusqu’ici. Une petite séance suffit pour continuer.`;
    return 'Bon retour. Reprenez simplement là où vous en étiez : rien à rattraper.';
  })();

  return (
    <Page>
      <header className="flex items-start justify-between gap-4 pb-5 pt-8">
        <div>
          <p className="text-sm text-muted">{formatDateLong()}</p>
          <h1 className="mt-1 font-display text-[30px] font-semibold leading-tight tracking-tight">
            {greeting()}
            {profile.name ? `, ${profile.name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-muted">Un peu chaque jour, c’est déjà beaucoup.</p>
        </div>
        <Link to="/profil" aria-label="Profil" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft font-display text-lg font-semibold text-primary">
          {(profile.name[0] ?? 'W').toUpperCase()}
        </Link>
      </header>

      {profile.demo && (
        <Link to="/profil/donnees" className="mb-4 block rounded-xl bg-warn-soft px-4 py-2.5 text-xs font-medium text-warn">
          Données de démonstration — effaçables depuis Profil › Données.
        </Link>
      )}

      {/* Carte principale */}
      <section className="card animate-fade-up overflow-hidden p-5" aria-labelledby="wird-title">
        <h2 id="wird-title" className="label">
          Votre Wird du jour
        </h2>
        {c.total === 0 ? (
          <div className="mt-3">
            <p className="font-display text-xl font-semibold">{hasAny ? 'Rien de prévu pour aujourd’hui.' : 'Commençons par votre mémorisation.'}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {hasAny ? 'Ajoutez des versets à réviser ou un nouvel apprentissage depuis Mon Wird.' : 'Indiquez ce que vous avez déjà mémorisé pour lancer la rotation de révision, ou choisissez un premier apprentissage.'}
            </p>
            <Link to="/wird/sourates" className="btn-primary mt-4 w-full">
              Choisir mes sourates <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Stat label="Révisions" n={c.review.items} sub={c.review.verses} tone="text-primary" />
              <Stat label="Renforcement" n={c.reinforce.items} sub={c.reinforce.verses} tone="text-warn" />
              <Stat label="Nouveau" n={c.learn.items} sub={c.learn.verses} tone="text-good" />
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span>Avancement du programme</span>
                <span className="tabular-nums">
                  {c.done} / {c.total}
                </span>
              </div>
              <ProgressBar value={c.total ? c.done / c.total : 0} />
            </div>
            <button onClick={go} className="btn-primary mt-5 w-full">
              {finished ? <Check size={18} /> : <Play size={18} />}
              {finished ? 'Wird accompli — voir le bilan' : started ? 'Reprendre' : 'Commencer mon Wird'}
            </button>
            {finished && !hasSummary && <p className="mt-2 text-center text-xs text-muted">Bravo, tout le programme du jour est traité.</p>}
            {!finished && <p className="mt-2 text-center text-xs text-muted">L’ordre reste libre. Vous pouvez interrompre à tout moment.</p>}
          </>
        )}
      </section>

      {/* Reprise */}
      {c.inProgress && !finished && (
        <button onClick={go} className="card mt-3 flex w-full items-center gap-3 p-4 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-soft text-primary">
            <Play size={16} />
          </span>
          <span className="flex-1">
            <span className="label block">Reprise</span>
            <span className="text-[15px] font-semibold">
              {surahMeta(c.inProgress.surah).tr}
              <span className="font-normal text-muted"> · {rangeLabel(c.inProgress.surah, c.inProgress.from, c.inProgress.to).replace(/^Sourate \d+ — /, '')}</span>
            </span>
          </span>
          <ArrowRight size={18} className="text-muted" />
        </button>
      )}

      {/* Progression */}
      <Link to="/progression/general" className="card mt-3 block p-5">
        <div className="flex items-center justify-between">
          <h2 className="label">Où j’en suis</h2>
          <ArrowRight size={16} className="text-muted" />
        </div>
        {hasAny ? (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Fig n={o.surahsWorked} label="sourates travaillées" />
              <Fig n={o.hizbCovered} label="hizb couverts" />
              <Fig n={`${o.ratio === 0 ? 0 : o.ratio < 0.01 ? '<1' : Math.round(o.ratio * 100)}%`} label="du Coran" />
            </div>
            <ProgressBar value={o.ratio} className="mt-4" />
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Votre progression apparaîtra ici dès que vous aurez ajouté des versets.</p>
        )}
      </Link>

      {/* Régularité */}
      <section className="card mt-3 p-5" aria-label="Régularité">
        <div className="flex items-center justify-between">
          <h2 className="label">Régularité</h2>
          <span className="text-xs text-muted">{weekActive} / 7 cette semaine</span>
        </div>
        <div className="mt-3 flex justify-between">
          {week.map((d, i) => (
            <div key={d} className="flex flex-col items-center gap-1.5">
              <span className={cx('flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition', days.has(d) ? 'bg-primary text-primary-ink' : d === today ? 'border border-primary/50 text-primary' : 'bg-surface2 text-muted')}>{days.has(d) ? <Check size={14} /> : ''}</span>
              <span className="text-[10px] font-medium uppercase text-muted">{'LMMJVSD'[i]}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">{message}</p>
      </section>
    </Page>
  );
}

function Stat({ label, n, sub, tone }: { label: string; n: number; sub: number; tone: string }) {
  return (
    <div className="rounded-xl bg-bg px-2 py-3">
      <p className={cx('font-display text-3xl font-semibold tabular-nums', n ? tone : 'text-muted/60')}>{n}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-ink">{label}</p>
      <p className="text-[11px] text-muted">{sub} {sub > 1 ? 'versets' : 'verset'}</p>
    </div>
  );
}

function Fig({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-semibold tabular-nums">{n}</p>
      <p className="text-xs leading-tight text-muted">{label}</p>
    </div>
  );
}
