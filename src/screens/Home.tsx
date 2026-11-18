import { ChevronRight, Flame } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProfileAvatar } from '@/components/Avatar';
import { Sheet, cx } from '@/components/ui';
import { addDays, diffDays, startOfWeek } from '@/engine/dates';
import { formatPages } from '@/engine/pages';
import { goalProgress, itemPages, learningEnabled, learningSegment } from '@/engine/plan';
import { activeDaySet, allSurahStats, cellState, currentStreak, overall, pagesByDay } from '@/engine/progress';
import { rangeLabel, surahMeta } from '@/engine/quran';
import type { PlanItem } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { formatDateLong, greeting, useToday } from '@/lib/hooks';
import { loadQuranText } from '@/lib/quranText';
import { useWird } from '@/store/useWird';
import { CELL_BG } from './wird/SurahGrid';

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];


/** Accueil : mémorisation (révisions du jour), sourate à apprendre, progression, verset. */
export default function Home() {
  const nav = useNavigate();
  const today = useToday();
  const store = useWird();
  const { profile, plan, verses, goals, history, session, settings } = store;
  const [awayHidden, setAwayHidden] = useState(false);
  const [flame, setFlame] = useState(false);
  const [motivation, setMotivation] = useState<string | null>(null);
  useEffect(() => {
    void loadQuranText().then((d) => d && setMotivation(d.s[72][3].split(' ').slice(-3).join(' ')));
  }, []);
  const stale = !!session && !!plan && session.date !== plan.date;
  const items = plan?.items ?? [];
  const o = useMemo(() => overall(verses, today), [verses, today]);
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  const cnt = useMemo(() => {
    const c = { learned: 0, learning: 0, reinforce: 0, none: 0 };
    for (const st of stats) c[cellState(st)]++;
    return c;
  }, [stats]);
  const days = useMemo(() => activeDaySet(history), [history]);
  const streak = currentStreak(days, today);
  const wk0 = startOfWeek(today);
  const weekDots = Array.from({ length: 7 }, (_, i) => days.has(addDays(wk0, i)));
  const weekCount = weekDots.filter(Boolean).length;
  const todayIdx = diffDays(wk0, today);
  const pagesWeek = pagesByDay(history, today, 7).map((d) => d.pages);
  const maxPages = Math.max(0.01, ...pagesWeek);
  const weekBars = pagesWeek.map((p) => p / maxPages);
  const doneToday = days.has(today);
  const lastDay = [...days].sort().pop();
  const away = !!lastDay && diffDays(lastDay, today) >= 7 && !awayHidden;
  const pagesOf = (list: PlanItem[]) => list.reduce((a, i) => a + itemPages(i), 0);
  const hasAny = o.memorizedVerses + o.learningVerses > 0;

  // Mémorisation : uniquement les révisions et renforcements du jour (jamais l'apprentissage)
  const reviewItems = items.filter((i) => i.kind !== 'learn' && i.status !== 'skipped');
  const reviewPending = reviewItems.filter((i) => i.status === 'pending');
  const reviewDoneCount = reviewItems.filter((i) => i.status === 'done').length;
  const reviewRatio = reviewItems.length ? reviewDoneCount / reviewItems.length : 0;
  const nextReview = reviewPending[0];
  // la séance ouverte contient-elle des révisions ? (sinon c'est une séance d'apprentissage : on le dit)
  const sessionHasReview = !!session && (session.scope === 'all' ? reviewPending.length > 0 : session.scope.some((id) => items.some((i) => i.id === id && i.kind !== 'learn')));
  const startReview = () => {
    haptic('tap');
    if (session) {
      if (store.startSession()) nav('/session');
      return;
    }
    if (store.startSession(reviewPending.map((i) => i.id))) nav('/session');
  };

  // Apprentissage : la sourate en cours, avec son avancement
  const goal = goals.find((g) => !g.completedAt && !g.paused && learningSegment({ verses }, g));
  const seg = goal ? learningSegment({ verses }, goal) : null;
  const gp = goal ? goalProgress(goal) : null;
  const startLearn = () => {
    haptic('tap');
    if (store.startLearnAhead(goal?.id)) nav('/session');
    else nav('/apprendre');
  };

  return (
    <div className="mx-auto w-full max-w-[520px] animate-fade px-[18px] pb-10 pt-safe">
      <Sheet open={!!stale} onClose={() => undefined} title="Ta dernière séance n’a pas été terminée">
        <p className="mb-5 text-[15px] leading-relaxed text-muted">Que souhaites-tu faire ? Les passages non terminés sont intégrés à ton programme du jour, sans surcharge.</p>
        <div className="flex flex-col gap-2">
          <button className="btn-primary" onClick={() => { store.resumeStaleSession(); haptic('tap'); nav('/session'); }}>Reprendre ma précédente séance</button>
          <button className="btn-soft" onClick={() => { store.discardStaleSession(); haptic('tap'); }}>Commencer la séance du jour</button>
        </div>
      </Sheet>
      {profile.demo && <Link to="/profil" className="mb-3 block rounded-2xl bg-warn-soft px-4 py-2.5 text-xs font-medium text-warn">Données de démonstration — tu peux les effacer depuis Profil.</Link>}
      {away && (
        <div className="card mb-3 p-4">
          <b>Content de te revoir.</b>
          <p className="text-sm text-muted">Tes acquis sont intacts. Rien à rattraper : on reprend simplement ton programme du jour.</p>
          <button className="btn-soft mt-2 !min-h-[40px] text-sm" onClick={() => setAwayHidden(true)}>Merci, c’est noté</button>
        </div>
      )}

      <header className="flex items-start justify-between gap-3 pt-[18px]">
        <div className="min-w-0">
          <p className="eyebrow text-[13px] text-muted">{formatDateLong()}</p>
          <h1 className="mt-0.5 text-[21px] font-bold leading-tight tracking-[-0.3px]">{greeting()}{profile.name ? `, ${profile.name}` : ''}</h1>
        </div>
        <Link to="/profil" aria-label="Profil" className="shrink-0"><ProfileAvatar name={profile.name} gender={profile.gender} size={42} /></Link>
      </header>

      {/* Mémorisation : les révisions du jour (jamais l'apprentissage) */}
      <article className="mem-card mt-[18px]">
        <div className="relative z-[1] flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-[10.5px] font-bold uppercase tracking-[1.4px] opacity-70">Mémorisation</p>
            <h2 className="mt-2 text-[21px] font-extrabold leading-tight tracking-[-0.3px]">
              {session ? 'Séance en cours' : nextReview ? `${surahMeta(nextReview.surah).tr} · ${rangeLabel(nextReview.surah, nextReview.from, nextReview.to).replace(/^Sourate \d+ — /, '')}` : reviewItems.length ? 'Révisions terminées' : 'Rien à réviser pour le moment'}
            </h2>
            <p className="mt-1 text-[13.5px] opacity-75">
              {session ? (sessionHasReview ? 'Reprends là où tu t’es arrêté.' : 'Une séance d’apprentissage est ouverte : reprends-la quand tu veux.') : nextReview ? `${reviewPending.length > 1 ? `et ${reviewPending.length - 1} autre${reviewPending.length > 2 ? 's' : ''} passage${reviewPending.length > 2 ? 's' : ''} · ` : ''}≈ ${formatPages(pagesOf(reviewPending))}` : reviewItems.length ? 'Qu’Allah te facilite, à demain 🌿' : hasAny ? 'Profite de ta journée.' : 'Tes révisions apparaîtront ici.'}
            </p>
            {streak > 0 && <p className="streak-line mt-2 font-mono text-[12.5px] font-semibold">🔥 {streak} jour{streak > 1 ? 's' : ''} d’affilée</p>}
          </div>
          <FocusRing value={reviewRatio} />
        </div>
        <div className="relative z-[1] mt-4 flex items-center gap-3">
          {(session || reviewPending.length > 0) && <button className="mem-btn rounded-full px-5 py-3 text-[14.5px] font-bold transition active:scale-95" onClick={startReview}>{session ? 'Reprendre' : 'Commencer'}</button>}
          <span className="text-[13px] opacity-70 tabular-nums" aria-label="Révisions faites aujourd’hui">{reviewDoneCount} / {reviewItems.length} passages</span>
        </div>
      </article>

      {/* Série et semaine */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <button className="tile" onClick={() => { haptic('tap'); setFlame(true); }} aria-label="Voir ma série">
          <p className="eyebrow text-[10.5px] font-bold uppercase tracking-[1.2px] text-muted">Série</p>
          <p className="mt-2 text-[34px] font-extrabold leading-none tracking-[-1px] tabular-nums">{streak}<span className="ml-1.5 text-[14px] font-semibold text-muted">jour{streak > 1 ? 's' : ''}</span></p>
          <div className="mt-3 flex h-8 items-end gap-1" aria-hidden>
            {weekBars.map((h, i) => <i key={i} className={cx('block w-full rounded-sm', i === weekBars.length - 1 ? 'bg-accent' : 'bg-accent/35')} style={{ height: `${Math.max(14, h * 100)}%` }} />)}
          </div>
        </button>
        <div className="tile">
          <p className="eyebrow text-[10.5px] font-bold uppercase tracking-[1.2px] text-muted">Cette semaine</p>
          <div className="mt-3 grid grid-cols-7 gap-1" aria-hidden>
            {weekDots.map((on, i) => <i key={i} className={cx('mx-auto block h-3.5 w-3.5 rounded-full', on ? 'bg-accent' : 'bg-surface2', i === todayIdx && !on && 'ring-2 ring-accent/70')} />)}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1 text-center font-mono text-[9.5px] text-muted" aria-hidden>{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}</div>
          <p className="mt-2.5 font-mono text-[12px] font-semibold">{weekCount} sur 7 jours</p>
        </div>
      </div>

      {/* Sourate à apprendre */}
      {learningEnabled(settings) && (
        <section className="card mt-3.5 p-[18px]" aria-label="Sourate à apprendre">
          <p className="eyebrow text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted">Sourate à apprendre</p>
          {goal && gp && seg ? (
            <>
              <div className="mt-2 flex items-center justify-between gap-3">
                <h2 className="truncate text-[19px] font-bold tracking-[-0.2px]">{surahMeta(goal.surah).tr}</h2>
                <span className="ar shrink-0 text-[24px] leading-none text-primary" lang="ar">{surahMeta(goal.surah).ar}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={Math.round((gp.done / gp.total) * 100)} aria-valuemin={0} aria-valuemax={100}><i className="block h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${gp.total ? (gp.done / gp.total) * 100 : 0}%` }} /></div>
              <p className="mt-2 text-[13.5px] text-muted"><b className="text-ink tabular-nums">{gp.done}</b> / {gp.total} versets appris</p>
              <button className="btn-primary mt-3.5 w-full" onClick={startLearn}>Continuer</button>
            </>
          ) : (
            <>
              <p className="mt-2 text-[15px] font-semibold">Aucune sourate en cours</p>
              <p className="mt-0.5 text-[13.5px] text-muted">Choisis la sourate que tu veux apprendre.</p>
              <Link to="/wird" className="btn-primary mt-3.5 w-full">Choisir une sourate</Link>
            </>
          )}
        </section>
      )}

      {/* Progression */}
      <div className="sec-head">
        <h2 className="title-section">Ma progression</h2>
        <Link to="/progression" className="flex items-center gap-1 text-[13.5px] font-semibold text-muted">Voir le détail <ChevronRight size={16} /></Link>
      </div>
      <div className="card p-[18px]">
        <div className="flex items-center gap-[18px]">
          <Donut learned={cnt.learned} learning={cnt.learning} reinforce={cnt.reinforce} />
          <ul className="min-w-0 flex-1 space-y-[9px] text-[13.5px]">
            {([['learned', 'Mémorisées'], ['learning', 'En cours'], ['reinforce', 'À renforcer'], ['none', 'Non commencées']] as const).map(([k, l]) => (
              <li key={k} className="flex items-center gap-2"><i className={cx('h-[9px] w-[9px] shrink-0 rounded-full', CELL_BG[k])} /><span className="flex-1 truncate">{l}</span><b className="tabular-nums">{cnt[k]}</b></li>
            ))}
          </ul>
        </div>
        <Link to="/progression" aria-label="Voir le tableau des 114 sourates" className="mt-[18px] grid grid-cols-[repeat(19,1fr)] gap-1">
          {stats.map((st) => <i key={st.surah} title={`${st.surah}. ${surahMeta(st.surah).tr}`} className={cx('block aspect-square rounded-[4px]', CELL_BG[cellState(st)])} />)}
        </Link>
      </div>

      {/* Verset du jour */}
      <div className="verse-card mt-3.5">
        <div className="w-full text-center">
          <p className="ar text-[26px] leading-[1.6] text-primary" lang="ar" dir="rtl">{motivation ?? '\u00A0'}</p>
          <em className="serif mt-1 block text-[14.5px] italic">« Et récite le Coran lentement et clairement. »</em>
          <small className="mt-1.5 block text-xs text-muted">Al-Muzzammil · verset 4</small>
        </div>
      </div>

      {/* Série */}
      <Sheet open={flame} onClose={() => setFlame(false)} title="Ma série">
        <FlameSheet streak={streak} doneToday={doneToday} days={days} today={today} total={days.size} onStart={() => { setFlame(false); startReview(); }} hasWork={reviewPending.length > 0} />
      </Sheet>
    </div>
  );
}

function FlameSheet({ streak, doneToday, days, today, total, onStart, hasWork }: { streak: number; doneToday: boolean; days: Set<string>; today: string; total: number; onStart: () => void; hasWork: boolean }) {
  const wk = startOfWeek(today);
  const msg = doneToday ? 'Ta flamme est allumée pour aujourd’hui. À demain, in cha Allah !' : streak ? 'Travaille au moins un passage aujourd’hui pour garder ta flamme allumée.' : 'Termine une séance aujourd’hui pour rallumer ta flamme.';
  return (
    <div className="pb-2">
      <div className="mx-auto mt-1 grid h-[110px] w-[96px] place-items-center">
        <div className={cx('relative grid place-items-center', streak ? '' : 'opacity-40 grayscale')}>
          <Flame size={96} className="text-hard" fill="currentColor" strokeWidth={1} />
          <b className="absolute bottom-3 text-[30px] font-extrabold text-white">{streak}</b>
        </div>
      </div>
      <h3 className="text-center text-[20px] font-bold">{streak} jour{streak > 1 ? 's' : ''} d’affilée</h3>
      <p className="mx-auto mt-1.5 max-w-xs text-center text-sm leading-relaxed text-muted">{msg}</p>
      <div className="mt-[18px] grid grid-cols-7 gap-1.5">
        {DAYS.map((d, i) => {
          const k = addDays(wk, i);
          const on = days.has(k);
          return (
            <div key={i} className="text-center">
              <small className="mb-1.5 block text-xs font-semibold text-muted">{d}</small>
              <i className={cx('mx-auto grid h-[38px] w-[38px] place-items-center rounded-full', on ? 'bg-hard-soft text-hard' : 'bg-surface2 text-muted/50', k === today && 'ring-2 ring-hard')}><Flame size={17} fill={on ? 'currentColor' : 'none'} /></i>
            </div>
          );
        })}
      </div>
      <div className="mt-[18px] grid grid-cols-1 gap-2.5">
        <div className="card rounded-2xl p-3.5"><b className="block text-xl font-extrabold">{total} j</b><small className="text-[12.5px] text-muted">Jours de travail au total</small></div>
      </div>
      {!doneToday && hasWork && <button className="btn-primary mt-4 w-full" onClick={onStart}>Commencer ma séance</button>}
    </div>
  );
}




/** Anneau de progression : part de sourates apprises / en cours / à renforcer sur 114. */
function Donut({ learned, learning, reinforce }: { learned: number; learning: number; reinforce: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  let off = 0;
  const seg = (n: number, cls: string) => {
    const len = (n / 114) * C;
    const el = n > 0 ? <circle key={cls} r={R} cx="64" cy="64" fill="none" strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} className={cls} /> : null;
    off += len;
    return el;
  };
  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <svg viewBox="0 0 128 128" className="-rotate-90" aria-hidden>
        <circle r={R} cx="64" cy="64" fill="none" strokeWidth="14" className="stroke-neutral" />
        {seg(learned, 'stroke-good')}
        {seg(learning, 'stroke-blue')}
        {seg(reinforce, 'stroke-hard')}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <b className="text-[22px] font-extrabold leading-none">{learned}</b>
        <span className="mt-1 text-[11.5px] text-muted">mémorisées</span>
      </div>
    </div>
  );
}


/** Anneau d'avancement du jour (comme la maquette « focus ») : pourcentage au centre. */
function FocusRing({ value }: { value: number }) {
  const size = 88;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${pct} % des révisions faites`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="rgba(255,255,255,.14)" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke="rgb(var(--ring))" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[19px] font-extrabold tabular-nums">{pct}<small className="text-[11px] opacity-70">%</small></div>
    </div>
  );
}
