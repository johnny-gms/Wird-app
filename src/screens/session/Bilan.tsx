import { Flame } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { GradeChip, ProgressBar, Screen, cx, toast } from '@/components/ui';
import { formatPages } from '@/engine/pages';
import { goalProgress, itemPages, learningSegment, upcomingRotation } from '@/engine/plan';
import { activeDaySet, currentStreak, overall } from '@/engine/progress';
import { formatDuration, rangeLabel, surahMeta } from '@/engine/quran';
import { haptic } from '@/lib/haptics';
import { useToday } from '@/lib/hooks';
import { planCounts } from '@/lib/plan';
import { useWird } from '@/store/useWird';
import { lastMode } from './Phone';

const GOLD = '#E3C277';

/** Nombre qui se compte jusqu'à sa valeur (sauf si l'utilisateur préfère moins d'animations). */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}</>;
}

/** Cadre doré et vert de la fin de séance : badge, titre, chiffres clés et bouton de sortie. */
function Hero({ title, lead, stats, foot, onDone }: { title: string; lead: string; stats: { n: number; l: string; tone?: string }[]; foot?: string; onDone: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-[28px] px-5 pb-5 pt-7 text-center text-[#F6F1E4]" style={{ background: 'radial-gradient(120% 80% at 50% -10%, rgba(227,194,119,.38) 0%, rgba(227,194,119,0) 55%), linear-gradient(165deg,#1f5240 0%,#12352a 100%)', boxShadow: '0 24px 44px -22px rgba(18,53,42,.75)' }} aria-label="Bilan de la séance">
      {/* étoiles discrètes */}
      {[[8, 10, 8], [86, 14, 6], [14, 46, 5], [90, 52, 7], [50, 4, 4]].map(([x, y, r], i) => (
        <svg key={i} aria-hidden viewBox="0 0 24 24" className="absolute opacity-40" style={{ left: `${x}%`, top: `${y}%`, width: r * 2, height: r * 2 }}><path d="M12 1l2.6 7.6L22 11l-7.4 2.4L12 21l-2.6-7.6L2 11l7.4-2.4z" fill={GOLD} /></svg>
      ))}
      <div className="relative mx-auto grid h-[92px] w-[92px] place-items-center rounded-full" style={{ background: 'linear-gradient(140deg,#2F7A55 0%,#1D4A37 100%)', boxShadow: `0 0 0 4px ${GOLD}, 0 0 0 10px rgba(227,194,119,.25), 0 18px 36px -12px rgba(0,0,0,.5)`, animation: 'cgPop .6s cubic-bezier(.2,1.6,.4,1) both' }}>
        <svg viewBox="0 0 24 24" className="h-[42px] w-[42px]" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 12.5 4 4L18 8" style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: 'cgDraw .5s .45s ease forwards' }} />
        </svg>
      </div>
      <h1 className="mt-6 text-[27px] font-extrabold leading-tight tracking-[-0.5px]" style={{ animation: 'cgRise .5s .4s ease both' }}>{title}</h1>
      <p className="mx-auto mt-1.5 max-w-[300px] text-[14.5px] leading-snug opacity-80" style={{ animation: 'cgRise .5s .55s ease both' }}>{lead}</p>
      <div className="mt-6 grid gap-2 rounded-[20px] bg-black/15 px-2 py-4" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, animation: 'cgRise .5s .7s ease both' }}>
        {stats.map((s) => (
          <div key={s.l}>
            <p className="text-[34px] font-extrabold leading-none tabular-nums" style={{ color: s.tone ?? '#F6F1E4' }}><CountUp to={s.n} /></p>
            <p className="mt-1.5 text-[12px] leading-tight opacity-70">{s.l}</p>
          </div>
        ))}
      </div>
      {foot && <p className="mt-3 text-[13px] opacity-75">{foot}</p>}
      <button className="mt-5 w-full rounded-2xl bg-[#F6F1E4] py-4 text-[16px] font-extrabold text-[#12352A] transition active:scale-[.98]" onClick={onDone}>Terminé pour aujourd’hui</button>
    </section>
  );
}

export default function Bilan() {
  const nav = useNavigate();
  const today = useToday();
  const loc = useLocation();
  const extraState = (loc.state as { extra?: { ms: number; ids: string[] } } | null)?.extra;
  const [minutes, setMinutes] = useState(10);
  const { summaries, plan, goals, verses, rotation, settings, history, profile, startSession, addAdhoc, lastValidation, undoValidation, session } = useWird();
  const summary = [...summaries].reverse().find((s) => s.date === today);
  const c = planCounts(plan);
  const o = useMemo(() => overall(verses, today), [verses, today]);
  const streak = useMemo(() => currentStreak(activeDaySet(history), today), [history, today]);
  // après une annulation de validation, la séance est restaurée : on la rouvre au lieu de retourner à l'accueil
  if (!summary) return session ? <Navigate to="/session" replace /> : <Navigate to="/" replace />;
  const complete = c.open === 0;
  // séance supplémentaire : bilan simplifié
  const extraItems = extraState ? (plan?.items ?? []).filter((i) => extraState.ids.includes(i.id)) : [];
  const startExtra = (kind: 'next' | 'free') => {
    if (kind === 'free') {
      toast('Choisis une sourate, puis « Réviser maintenant »');
      nav('/wird');
      return;
    }
    const chunks = upcomingRotation({ verses, goals, rotation, settings }, plan, Math.max(1, Math.round(minutes / 5)));
    const ids = chunks.map((g) => addAdhoc(g.surah, g.from, g.to)).filter((x): x is string => !!x);
    if (!ids.length) {
      toast('Aucun passage à proposer pour le moment');
      return;
    }
    if (startSession(ids, { mode: lastMode() ?? undefined, minutes })) nav('/session');
  };
  const learnToday = (plan?.items ?? []).filter((i) => i.kind === 'learn' && i.status === 'done');
  // L'app distingue révision et apprentissage : le bouton « continuer » s'adapte à ce qui vient d'être travaillé.
  const sessionItems = extraState ? extraItems : plan?.items.filter((i) => i.status === 'done') ?? [];
  const hasLearn = sessionItems.some((i) => i.kind === 'learn');
  const hasReview = sessionItems.some((i) => i.kind !== 'learn');
  const startLearnMore = () => {
    const g = goals.find((x) => !x.completedAt && !x.paused && learningSegment({ verses }, x));
    const seg = g ? learningSegment({ verses }, g) : null;
    if (!g || !seg) {
      toast('Rien de plus à apprendre pour le moment');
      return;
    }
    const waiting = (plan?.items ?? []).find((i) => i.kind === 'learn' && i.status === 'pending' && i.goalId === g.id);
    const id = waiting?.id ?? addAdhoc(g.surah, seg.from, Math.min(seg.to, seg.from + Math.max(2, Math.round(minutes / 3)) - 1), { kind: 'learn', goalId: g.id });
    if (id && startSession([id], { mode: lastMode() ?? undefined, minutes })) nav('/session');
  };
  const done = () => {
    haptic('success');
    nav('/session/felicitations', { replace: true });
  };
  const name = profile.name;

  // ------------------------------------------------------------ Séance supplémentaire
  if (extraState) {
    return (
      <Screen title="Encore une belle étape" sub="Chaque minute de plus compte, in châ’ Allah.">
        <Hero
          title={`Macha’Allah${name ? `, ${name}` : ''} !`}
          lead="Séance supplémentaire terminée. Qu’Allah accepte ton effort."
          stats={[{ n: extraItems.length, l: `passage${extraItems.length > 1 ? 's' : ''} travaillé${extraItems.length > 1 ? 's' : ''}`, tone: GOLD }, { n: Math.max(1, Math.round(extraState.ms / 60000)), l: 'min de travail' }]}
          onDone={done}
        />
        <section className="card mt-4 p-4" aria-label="Passages travaillés">
          <p className="label mb-1">Passages travaillés</p>
          <ul className="divide-y divide-line">
            {extraItems.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1"><b className="block truncate">{surahMeta(i.surah).tr}</b><span className="text-muted">{rangeLabel(i.surah, i.from, i.to).replace(/^Sourate \d+ — /, '')}</span></span>
                {i.grade && <GradeChip grade={i.grade} />}
              </li>
            ))}
          </ul>
        </section>
        <div className="mt-4 flex flex-col gap-2">
          {hasReview && <button className="btn-soft" onClick={() => startExtra('next')}>Continuer à réviser ?</button>}
          {hasLearn && <button className="btn-soft" onClick={startLearnMore}>Continuer à apprendre ?</button>}
        </div>
      </Screen>
    );
  }

  // ------------------------------------------------------------ Séance principale
  const donePages = (plan?.items ?? []).filter((i) => i.status === 'done').reduce((a, i) => a + itemPages(i), 0);
  return (
    <Screen title={complete ? 'Séance accomplie' : 'Bien joué pour aujourd’hui'} sub={complete ? 'Qu’Allah accepte ton effort. À demain, in châ’ Allah.' : 'Ce qui reste peut attendre : rien n’est reporté ni dû.'}>
      <Hero
        title={`Macha’Allah${name ? `, ${name}` : ''} !`}
        lead={complete ? 'Tu as terminé ton programme du jour.' : 'Ton bilan est enregistré, chaque passage compte.'}
        stats={[
          { n: summary.verses, l: `verset${summary.verses > 1 ? 's' : ''} travaillé${summary.verses > 1 ? 's' : ''}`, tone: GOLD },
          { n: summary.mastered, l: 'maîtrisés', tone: '#8EE0B0' },
          { n: summary.toReinforce, l: 'à renforcer', tone: '#F2B766' },
        ]}
        foot={`≈ ${formatPages(donePages)} travaillées${summary.activeMs >= 60_000 ? ` · ${formatDuration(summary.activeMs)}` : ''}`}
        onDone={done}
      />

      {streak > 0 && (
        <div className="mt-3 flex items-center gap-3.5 rounded-[22px] bg-hard-soft p-4">
          <span className="chip-ic bg-surface text-hard"><Flame size={22} fill="currentColor" /></span>
          <div><b className="block text-[16px]">{streak} jour{streak > 1 ? 's' : ''} d’affilée</b><span className="text-[13px] text-muted">Ta flamme est allumée. Continue demain, in châ’ Allah.</span></div>
        </div>
      )}

      <section className="card mt-3 p-5" aria-label="Sourates travaillées">
        <p className="label mb-2.5">Sourates travaillées</p>
        <ul className="flex flex-wrap gap-1.5">
          {summary.surahs.map((s) => (
            <li key={s} className="rounded-full bg-soft px-3 py-1.5 text-sm font-semibold text-primary">{s}. {surahMeta(s).tr}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Les versets à renforcer reviendront d’eux-mêmes dans ton programme, au bon moment.</p>
      </section>

      <section className="card mt-3 p-5" aria-label="Progression réalisée">
        <p className="label mb-3">Ta progression</p>
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
            </div>
          );
        })}
        {o.memorizedVerses > 0 && <p className="mt-4 text-sm text-muted">Tu entretiens aujourd’hui environ {o.ratio < 0.01 ? 'moins de 1' : Math.round(o.ratio * 100)} % du Coran.</p>}
      </section>

      <section className="card mt-3 p-5" aria-label="Séance supplémentaire">
        <b className="block">Envie de continuer ?</b>
        <p className="mt-1 text-sm text-muted">Une séance supplémentaire, sans pression. La durée est indicative.</p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Durée indicative">
          {[5, 10, 15, 20].map((m) => <button key={m} role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)} className={cx('chip chip-sm')}>{m} min</button>)}
        </div>
        <div className="mt-3 grid gap-2">
          {(hasReview || !hasLearn) && <button className="btn-soft" onClick={() => startExtra('next')}>Continuer à réviser ?</button>}
          {hasLearn && <button className="btn-soft" onClick={startLearnMore}>Continuer à apprendre ?</button>}
          <button className="btn-soft" onClick={() => startExtra('free')}>Choisir une sourate ou un passage</button>
          {!complete && <button className="btn-soft" onClick={() => { if (startSession()) nav('/session'); }}>Reprendre le programme restant</button>}
        </div>
      </section>

      <div className="mt-4 flex flex-col items-center gap-1">
        <Link to="/progression" className="btn-ghost">Voir ma progression</Link>
        {lastValidation && <button className="text-xs font-semibold text-muted underline underline-offset-4" onClick={() => { if (undoValidation()) { haptic('warning'); nav('/session', { replace: true }); } }}>Une erreur ? Annuler la validation</button>}
      </div>
    </Screen>
  );
}
