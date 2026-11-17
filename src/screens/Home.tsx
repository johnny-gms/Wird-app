import { BookOpen, Check, ChevronRight, Clock, Flame, RefreshCw, Star } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProfileAvatar } from '@/components/Avatar';
import { ProgressBar, Sheet, cx } from '@/components/ui';
import { addDays, diffDays, startOfWeek } from '@/engine/dates';
import { formatPages, pageOf } from '@/engine/pages';
import { goalProgress, itemPages, learningSegment, upcomingRotation } from '@/engine/plan';
import { activeDaySet, activeDaysIn, allSurahStats, cellState, currentStreak, overall, pagesByDay } from '@/engine/progress';
import { ayahId, fromAyahId, rangeLabel, surahMeta } from '@/engine/quran';
import type { PlanItem, WorkKind } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { formatDateLong, formatDateShort, greeting, useToday } from '@/lib/hooks';
import { loadQuranText } from '@/lib/quranText';
import { useWird } from '@/store/useWird';
import { CELL_BG } from './wird/SurahGrid';

const LABEL: Record<WorkKind, string> = { learn: 'Nouvel apprentissage', review: 'Révision', reinforce: 'Renforcement' };
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Première lettre arabe du nom de la sourate (sans « Al- »), pour le médaillon de la carte d'apprentissage. */
function surahLetter(n: number): string {
  const bare = surahMeta(n).ar.replace(/[ً-ٰٟۖ-ۭ]/g, '').replace(/^[اٱأ]ل/, '');
  return Array.from(bare)[0] ?? String(n);
}

const rnd = (x: number) => Math.round(x * 10) / 10;

/** Accueil : où reprendre, tuiles du jour, révisions du jour (menu déroulant), progression, repères, régularité. */
export default function Home() {
  const nav = useNavigate();
  const today = useToday();
  const store = useWird();
  const { profile, plan, verses, goals, history, session, settings, rotation } = store;
  const [awayHidden, setAwayHidden] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [flame, setFlame] = useState(false);
  const [motivation, setMotivation] = useState<string | null>(null);
  useEffect(() => {
    void loadQuranText().then((d) => d && setMotivation(d.s[72][3].split(' ').slice(-3).join(' ')));
  }, []);
  const stale = !!session && !!plan && session.date !== plan.date;
  const items = plan?.items ?? [];
  const pending = items.filter((i) => i.status === 'pending');
  const done = items.filter((i) => i.status === 'done');
  const o = useMemo(() => overall(verses, today), [verses, today]);
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  const cnt = useMemo(() => {
    const c = { learned: 0, learning: 0, reinforce: 0, none: 0 };
    for (const st of stats) c[cellState(st)]++;
    return c;
  }, [stats]);
  const days = useMemo(() => activeDaySet(history), [history]);
  const streak = currentStreak(days, today);
  const doneToday = days.has(today);
  const wk = startOfWeek(today);
  const weekDays = activeDaysIn(days, wk, addDays(wk, 6));
  const weekPages = pagesByDay(history, today, 7).reduce((a, d) => a + d.pages, 0);
  const lastDay = [...days].sort().pop();
  const away = !!lastDay && diffDays(lastDay, today) >= 7 && !awayHidden;
  const pagesOf = (list: PlanItem[]) => list.reduce((a, i) => a + itemPages(i), 0);
  const learnDone = pagesOf(done.filter((i) => i.kind === 'learn'));
  const reviewDone = pagesOf(done.filter((i) => i.kind !== 'learn'));
  const learnTarget = pagesOf(items.filter((i) => i.kind === 'learn'));
  const reviewTarget = pagesOf(items.filter((i) => i.kind !== 'learn'));
  const lastEntry = history[history.length - 1];
  const upcoming = useMemo(() => upcomingRotation({ verses, goals, rotation, settings }, plan, 1)[0], [verses, goals, rotation, settings, plan]);
  const reinforceNext = useMemo(() => {
    let best: { date: string; id: number } | null = null;
    for (const k in verses) {
      const v = verses[k];
      if (v.status === 'memorized' && v.fragile && v.reinforceDue && v.reinforceDue > today && (!best || v.reinforceDue < best.date)) best = { date: v.reinforceDue, id: v.id };
    }
    return best;
  }, [verses, today]);

  const go = (id?: string) => {
    haptic('tap');
    if (store.startSession(id)) nav('/session');
  };
  const lastPage = lastEntry ? pageOf(ayahId(lastEntry.surah, lastEntry.from)) : 1;
  const hasAny = o.memorizedVerses + o.learningVerses > 0;

  // Apprentissage en cours : l'objectif actif qui a encore des versets à travailler
  const goal = goals.find((g) => !g.completedAt && !g.paused && learningSegment({ verses }, g));
  const seg = goal ? learningSegment({ verses }, goal) : null;
  const gp = goal ? goalProgress(goal) : null;
  const learnItem = goal ? pending.find((i) => i.kind === 'learn' && i.goalId === goal.id) : undefined;

  const dueTitle = session
    ? 'Séance en cours'
    : pending.length
      ? `${pending.length} élément${pending.length > 1 ? 's' : ''} à travailler aujourd’hui.`
      : items.length
        ? 'Programme du jour terminé.'
        : 'Rien de prévu aujourd’hui.';
  const dueSub = session
    ? 'Reprends là où tu t’es arrêté.'
    : pending.length
      ? `≈ ${formatPages(pagesOf(pending))} · Continue ta révision.`
      : items.length
        ? 'Qu’Allah te facilite, à demain 🌿'
        : hasAny
          ? 'Profite de ta journée.'
          : 'Choisis une sourate à apprendre depuis Mon Wird.';

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
          <p className="text-[13px] text-muted">{formatDateLong()}</p>
          <h1 className="mt-0.5 text-[21px] font-bold leading-tight tracking-[-0.3px]">{greeting()}{profile.name ? `, ${profile.name}` : ''}</h1>
        </div>
        <Link to="/profil" aria-label="Profil" className="shrink-0"><ProfileAvatar name={profile.name} gender={profile.gender} size={42} /></Link>
      </header>

      {/* Apprentissage en cours */}
      {goal && gp && seg ? (
        <article className="learn-card mt-[18px]">
          <div className="relative z-[1] flex items-center gap-3.5">
            <div className="ar grid h-[50px] w-[50px] shrink-0 place-items-center rounded-[14px] border border-white/10 bg-white/10 text-[24px] font-bold" lang="ar">{surahLetter(goal.surah)}</div>
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[1.4px] opacity-60">En apprentissage</p>
              <h2 className="mt-0.5 truncate text-[17px] font-bold">Sourate {surahMeta(goal.surah).tr}</h2>
              <p className="mt-0.5 text-[13px] opacity-70">{gp.done} / {gp.total} versets · prochain : {seg.from === seg.to ? `verset ${seg.from}` : `versets ${seg.from} à ${seg.to}`}</p>
            </div>
          </div>
          <div className="relative z-[1] mt-[18px] flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><i className="block h-full rounded-full bg-gradient-to-r from-[#2F9E66] to-[#5CCB8C] transition-[width] duration-700" style={{ width: `${gp.total ? (gp.done / gp.total) * 100 : 0}%` }} /></div>
            <span className="min-w-[38px] text-[15px] font-bold tabular-nums">{gp.total ? Math.round((gp.done / gp.total) * 100) : 0}%</span>
            {learnItem ? <button className="btn-orange" onClick={() => go(learnItem.id)}>Continuer</button> : <Link to="/revisions" className="btn-orange">Voir</Link>}
          </div>
        </article>
      ) : (
        <article className="learn-card mt-[18px]">
          <div className="relative z-[1] flex items-center gap-3.5">
            <div className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-[14px] border border-white/10 bg-white/10"><BookOpen size={24} /></div>
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[1.4px] opacity-60">Ta mémorisation</p>
              <h2 className="mt-0.5 text-[17px] font-bold">Commençons doucement</h2>
              <p className="mt-0.5 text-[13px] opacity-70">{done.length ? 'Le programme du jour est terminé.' : 'Choisis la sourate que tu veux travailler.'}</p>
            </div>
          </div>
          <div className="relative z-[1] mt-[18px] flex justify-end"><Link to="/wird" className="btn-orange">Choisir une sourate</Link></div>
        </article>
      )}

      {/* Tuiles */}
      <div className="mt-3.5 grid grid-cols-3 gap-2.5">
        <button className="tile" onClick={() => { haptic('tap'); setFlame(true); }} aria-label="Voir ma série">
          <span className={cx('chip-ic !h-[34px] !w-[34px] !rounded-[11px]', doneToday ? 'ic-a' : 'bg-surface2 text-muted/70')}><Flame size={17} /></span>
          <small className="mt-2.5 block text-[12px] font-medium text-muted">{doneToday ? 'Série 🔥' : streak ? 'À entretenir' : 'Série'}</small>
          <b className="text-[19px] font-extrabold tracking-[-0.3px]">{streak}<span className="ml-0.5 text-[12.5px] font-semibold text-muted">jour{streak > 1 ? 's' : ''}</span></b>
        </button>
        <Link to="/progression" className="tile">
          <span className="chip-ic ic-g !h-[34px] !w-[34px] !rounded-[11px]"><Star size={17} /></span>
          <small className="mt-2.5 block text-[12px] font-medium text-muted">Sourates</small>
          <b className="text-[19px] font-extrabold tracking-[-0.3px]">{cnt.learned}<span className="ml-0.5 text-[12.5px] font-semibold text-muted">/ 114</span></b>
        </Link>
        <div className="tile">
          <span className="chip-ic ic-b !h-[34px] !w-[34px] !rounded-[11px]"><Clock size={17} /></span>
          <small className="mt-2.5 block text-[12px] font-medium text-muted">Aujourd’hui</small>
          <b className="text-[19px] font-extrabold tracking-[-0.3px]">{rnd(learnDone + reviewDone)}<span className="ml-0.5 text-[12.5px] font-semibold text-muted">/ {rnd(learnTarget + reviewTarget)} p.</span></b>
        </div>
      </div>

      {/* Programme du jour (menu déroulant) */}
      <div className="mt-3.5">
        <button className="flex w-full items-center gap-3.5 rounded-[22px] border border-line bg-surface p-[18px] text-left shadow-card transition active:scale-[.99]" onClick={() => { haptic('tap'); setDueOpen((v) => !v); }} aria-expanded={dueOpen}>
          <span className="chip-ic ic-g"><RefreshCw size={21} /></span>
          <span className="min-w-0 flex-1"><b className="block text-base font-bold tracking-[-0.2px]">{dueTitle}</b><small className="mt-0.5 block text-[13.5px] text-muted">{dueSub}</small></span>
          <ChevronRight size={20} className={cx('shrink-0 text-muted/70 transition-transform duration-300', dueOpen ? '-rotate-90' : 'rotate-90')} />
        </button>
        <div className={cx('grid transition-[grid-template-rows] duration-300', dueOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="overflow-hidden">
            <div className="card mt-2.5 px-4 py-2">
              {items.length ? (
                <>
                  <div className="flex items-center justify-between pt-2 text-sm"><b>{done.length} / {items.length} fait{done.length > 1 ? 's' : ''}</b><span className="text-muted">≈ {formatPages(pagesOf(items))} au programme</span></div>
                  <div className="my-2.5"><ProgressBar value={items.length ? done.length / items.length : 0} /></div>
                  {items.map((it) => {
                    const isDone = it.status === 'done';
                    const s = surahMeta(it.surah);
                    return (
                      <div key={it.id} className="flex items-center justify-between gap-2 border-t border-line py-3">
                        <Link to={`/wird/${it.surah}`} className="min-w-0 flex-1">
                          <b className="block truncate text-[15px]">{s.tr} · {rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')}</b>
                          <span className="text-[12.5px] text-muted">{LABEL[it.kind]} · {it.kind === 'review' ? `page ${pageOf(ayahId(it.surah, it.from))}` : `≈ ${formatPages(itemPages(it))}`}{it.status === 'skipped' ? ' · ignoré' : ''}</span>
                        </Link>
                        {isDone ? (
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-good text-white"><Check size={14} strokeWidth={3} /></span>
                        ) : it.status === 'pending' ? (
                          <span className="flex items-center gap-1">
                            <button className="rounded-full bg-surface2 px-3.5 py-2 text-[13.5px] font-bold text-primary" onClick={() => go(it.id)}>Commencer</button>
                            <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2" aria-label="Passer cet élément" onClick={() => { store.skipItem(it.id); haptic('tap'); }}>⋯</button>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="py-3">
                  <p><b>Rien de prévu aujourd’hui.</b></p>
                  <p className="text-sm text-muted">{hasAny ? 'Profite de ta journée, ou ajuste tes objectifs en pages.' : 'Choisis une sourate à apprendre depuis Mon Wird.'}</p>
                </div>
              )}
              <div className="flex justify-center gap-5 border-t border-line py-3 text-sm font-semibold text-primary">
                <button onClick={() => { store.refreshPlan(); haptic('tap'); }}>Recalculer</button>
                <Link to="/wird">Ajouter des versets</Link>
              </div>
            </div>
            {pending.length > 0 ? (
              <button className="btn-primary mt-3 w-full" onClick={() => go()}>{session ? 'Reprendre ma séance' : 'Commencer ma séance'}</button>
            ) : items.length > 0 ? (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-sm"><Check size={16} className="text-good" /> Programme du jour terminé, bravo 🌿</p>
            ) : null}
          </div>
        </div>
      </div>

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

      {(learnTarget > 0 || reviewTarget > 0) && (
        <>
          <div className="sec-head"><h2 className="title-section">Tes repères du jour</h2></div>
          <div className="card space-y-3 p-[18px]">
            {learnTarget > 0 && <Goal label="À apprendre" done={learnDone} total={learnTarget} />}
            {reviewTarget > 0 && <Goal label="À réviser" done={reviewDone} total={reviewTarget} />}
            <p className="text-xs text-muted">Des repères, jamais une obligation : ce qui n’est pas fait n’est pas reporté.</p>
          </div>
        </>
      )}

      <div className="sec-head"><h2 className="title-section">Régularité</h2></div>
      <div className="grid grid-cols-2 gap-2.5">
        <Stat big={<>{weekDays}<small className="text-[15px]">/7</small></>} label="jours actifs cette semaine" />
        <Stat big={<>{rnd(weekPages)}<small className="text-[15px]"> p.</small></>} label="pages travaillées" />
      </div>
      <div className="card mt-2.5 p-4">
        <p className="text-[13px] text-muted">Prochaine révision importante</p>
        <p className="mt-0.5"><b>{reinforceNext ? NextRein(reinforceNext.id, reinforceNext.date, today) : upcoming ? `${surahMeta(upcoming.surah).tr} · ${rangeLabel(upcoming.surah, upcoming.from, upcoming.to).replace(/^Sourate \d+ — /, '')} (≈ dans ${upcoming.inDays} j)` : 'Rien de prévu'}</b></p>
      </div>
      <Link to={`/coran?p=${lastPage}`} className="mt-2.5 flex items-center gap-3.5 rounded-[22px] border border-line bg-surface p-[18px] shadow-card transition active:scale-[.99]">
        <span className="chip-ic ic-b"><BookOpen size={21} /></span>
        <span className="min-w-0 flex-1"><b className="block text-base font-bold">Le Coran numérique</b><small className="text-[13.5px] text-muted">Lecture page par page, sans distraction.</small></span>
        <ChevronRight size={20} className="text-muted/70" />
      </Link>

      {/* Verset du jour */}
      <div className="verse-card mt-3.5">
        <div className="min-w-0 flex-1">
          <p className="ar text-[24px] leading-[1.6] text-primary" lang="ar" dir="rtl">{motivation ?? '\u00A0'}</p>
          <em className="serif mt-0.5 block text-[14.5px] not-italic italic">« Et récite le Coran lentement et clairement. »</em>
          <small className="mt-1 block text-xs text-muted">Al-Muzzammil · verset 4</small>
        </div>
      </div>

      {/* Série */}
      <Sheet open={flame} onClose={() => setFlame(false)} title="Ma série">
        <FlameSheet streak={streak} doneToday={doneToday} days={days} today={today} total={days.size} onStart={() => { setFlame(false); go(); }} hasWork={pending.length > 0} />
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

function Stat({ big, label }: { big: ReactNode; label: string }) {
  return <div className="card p-4"><span className="text-[30px] font-extrabold leading-none tracking-[-0.5px]">{big}</span><p className="mt-1 text-[13px] text-muted">{label}</p></div>;
}

function NextRein(id: number, date: string, today: string): string {
  const { surah, ayah } = fromAyahId(id);
  return `${surahMeta(surah).tr} · verset ${ayah} · ${date === addDays(today, 1) ? 'demain' : formatDateShort(date)}`;
}

function Goal({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><b>{label}</b><span className="text-muted tabular-nums">{formatPages(done)} / {formatPages(total)}</span></div>
      <div className="mt-1.5"><ProgressBar value={total ? Math.min(1, done / total) : 0} /></div>
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
