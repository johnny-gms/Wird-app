import { BookOpen, Check, ChevronRight, Leaf } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProfileAvatar } from '@/components/Avatar';
import { ProgressBar, Screen, cx } from '@/components/ui';
import { addDays, diffDays, startOfWeek } from '@/engine/dates';
import { formatPages, pageOf } from '@/engine/pages';
import { itemPages, upcomingRotation } from '@/engine/plan';
import { activeDaySet, activeDaysIn, allSurahStats, cellState, overall, pagesByDay } from '@/engine/progress';
import { ayahId, fromAyahId, rangeLabel, surahMeta } from '@/engine/quran';
import type { PlanItem, WorkKind } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { formatDateLong, formatDateShort, greeting, useToday } from '@/lib/hooks';
import { loadQuranText } from '@/lib/quranText';
import { useWird } from '@/store/useWird';
import { CELL_BG } from './wird/SurahGrid';

const LABEL: Record<WorkKind, string> = { learn: 'Nouvel apprentissage', review: 'Révision', reinforce: 'Renforcement' };

/** Accueil : où reprendre, programme du jour, progression, objectifs du jour, régularité. */
export default function Home() {
  const nav = useNavigate();
  const today = useToday();
  const store = useWird();
  const { profile, plan, verses, goals, history, session, settings, rotation } = store;
  const [awayHidden, setAwayHidden] = useState(false);
  const [motivation, setMotivation] = useState<string | null>(null);
  useEffect(() => {
    void loadQuranText().then((d) => d && setMotivation(d.s[72][3].split(' ').slice(-3).join(' ')));
  }, []);
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

  // Carte verte adaptative : l'action la plus pertinente selon l'état réel
  const next = pending[0];
  const hero = session ? (
    <>
      <p className="text-sm text-white/75">Séance en cours</p>
      <div className="title-section my-1.5 !text-[26px]">Reprenons là où tu en étais</div>
      <p className="text-white/80">{pending.length ? `${pending.length} élément${pending.length > 1 ? 's' : ''} encore au programme.` : 'Il ne reste que l’évaluation.'} Tout ce que tu as saisi est conservé.</p>
      <button className="btn mt-3.5 w-full bg-white text-primary" onClick={() => go()}>Reprendre la séance</button>
    </>
  ) : next ? (
    <>
      <p className="text-sm text-white/75">Aujourd’hui</p>
      <div className="title-section my-1.5 !text-[26px]">Continuons ensemble</div>
      <p className="text-white/80">{surahMeta(next.surah).tr} · {rangeLabel(next.surah, next.from, next.to).replace(/^Sourate \d+ — /, '')}{pending.length > 1 ? ` et ${pending.length - 1} autre${pending.length > 2 ? 's' : ''}` : ''}.</p>
      <button className="btn mt-3.5 w-full bg-white text-primary" onClick={() => go()}>Commencer les révisions</button>
    </>
  ) : (
    <>
      <p className="text-sm text-white/75">Ta mémorisation</p>
      <div className="title-section my-1.5 !text-[26px]">Commençons doucement</div>
      <p className="text-white/80">{done.length ? 'Le programme du jour est terminé. Tu peux choisir une sourate à explorer.' : 'Choisis la sourate que tu veux travailler.'}</p>
      <Link className="btn mt-3.5 w-full bg-white text-primary" to="/wird">Choisir une sourate</Link>
    </>
  );

  return (
    <Screen
      title={<>{greeting()}{profile.name ? `, ${profile.name}` : ''}</>}
      sub={formatDateLong()}
      right={<Link to="/profil" aria-label="Profil" className="mt-1"><ProfileAvatar name={profile.name} gender={profile.gender} size={42} /></Link>}
    >
      {profile.demo && <Link to="/profil" className="mb-3 block rounded-xl bg-warn-soft px-4 py-2.5 text-xs font-medium text-warn">Données de démonstration — tu peux les effacer depuis Profil.</Link>}
      {away && (
        <div className="card mb-3 p-4">
          <b>Content de te revoir.</b>
          <p className="text-sm text-muted">Tes acquis sont intacts. Rien à rattraper : on reprend simplement ton programme du jour.</p>
          <button className="btn-soft mt-2 !min-h-[40px] text-sm" onClick={() => setAwayHidden(true)}>Merci, c’est noté</button>
        </div>
      )}

      <div className="hero px-[18px] py-5">{hero}</div>

      <h2 className="label mb-2.5 mt-[30px]">Aujourd’hui</h2>
      <div className="card p-4">
        {items.length ? (
          <>
            <div className="flex items-center justify-between"><b>{done.length} / {items.length} fait{done.length > 1 ? 's' : ''}</b><span className="text-sm text-muted">≈ {formatPages(pagesOf(items))} au programme</span></div>
            <div className="my-2.5"><ProgressBar value={items.length ? done.length / items.length : 0} /></div>
            {items.map((it) => {
              const isDone = it.status === 'done';
              return (
                <div key={it.id} className="flex items-center justify-between gap-2 border-t border-line py-2.5">
                  <Link to={`/wird/${it.surah}`} className="min-w-0 flex-1">
                    <b className="block">{surahMeta(it.surah).tr} · {rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')}</b>
                    <span className="text-sm text-muted">{LABEL[it.kind]} · {it.kind === 'review' ? `page ${pageOf(ayahId(it.surah, it.from))}` : `≈ ${formatPages(itemPages(it))}`}{it.status === 'skipped' ? ' · ignoré' : ''}</span>
                  </Link>
                  {isDone ? <span className="whitespace-nowrap rounded-full bg-good px-2.5 py-0.5 text-xs text-white">Fait ✓</span> : it.status === 'pending' ? (
                    <span className="flex items-center gap-1.5">
                      <button className="btn-soft !min-h-[36px] !px-3 text-sm" onClick={() => go(it.id)}>Commencer</button>
                      <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2" aria-label="Passer cet élément" onClick={() => { store.skipItem(it.id); haptic('tap'); }}>⋯</button>
                    </span>
                  ) : null}
                </div>
              );
            })}
            {pending.length > 0 ? <button className="btn-primary mt-3 w-full" onClick={() => go()}>{session ? 'Reprendre ma séance' : 'Commencer ma séance'}</button> : <p className="mt-3 flex items-center gap-1.5"><Check size={16} className="text-good" /> Programme du jour terminé, bravo 🌿</p>}
          </>
        ) : (
          <>
            <p><b>Rien de prévu aujourd’hui.</b></p>
            <p className="text-sm text-muted">{hasAny ? 'Profite de ta journée, ou ajuste tes objectifs en pages.' : 'Choisis une sourate à apprendre depuis Mon Wird.'}</p>
            <div className="mt-2.5 flex gap-2">
              <Link to="/wird" className="btn-soft !min-h-[36px] !px-3 text-sm">Mes sourates</Link>
              <Link to="/revisions" className="btn-soft !min-h-[36px] !px-3 text-sm">Mes révisions</Link>
            </div>
          </>
        )}
        <div className="mt-2 flex justify-center gap-5 text-sm font-semibold text-primary">
          <button onClick={() => { store.refreshPlan(); haptic('tap'); }}>Recalculer</button>
          <Link to="/wird">Ajouter des versets</Link>
        </div>
      </div>

      <div className="mb-2.5 mt-[30px] flex items-baseline justify-between">
        <h2 className="font-display text-[22px] font-semibold tracking-[-0.2px]">Ma progression</h2>
        <Link to="/progression" className="flex items-center text-sm text-muted">Voir le détail <ChevronRight size={16} /></Link>
      </div>
      <div className="card p-4">
        <div className="flex items-center gap-5">
          <Donut learned={cnt.learned} learning={cnt.learning} reinforce={cnt.reinforce} />
          <ul className="min-w-0 flex-1 space-y-2.5 text-[15px]">
            {([['learned', 'Mémorisées'], ['learning', 'En cours'], ['reinforce', 'À renforcer'], ['none', 'Non commencées']] as const).map(([k, l]) => (
              <li key={k} className="flex items-center gap-2.5"><i className={cx('h-3 w-3 shrink-0 rounded-full', CELL_BG[k])} /><span className="flex-1 truncate">{l}</span><b className="tabular-nums">{cnt[k]}</b></li>
            ))}
          </ul>
        </div>
        <Link to="/progression" aria-label="Voir le tableau des 114 sourates" className="mt-5 grid grid-cols-[repeat(19,1fr)] gap-[5px]">
          {stats.map((st) => <i key={st.surah} title={`${st.surah}. ${surahMeta(st.surah).tr}`} className={cx('block aspect-square rounded-[5px]', CELL_BG[cellState(st)])} />)}
        </Link>
      </div>

      {(learnTarget > 0 || reviewTarget > 0) && (
        <>
          <h2 className="label mb-2.5 mt-[30px]">Tes repères du jour</h2>
          <div className="card space-y-3 p-4">
            {learnTarget > 0 && <Goal label="À apprendre" done={learnDone} total={learnTarget} />}
            {reviewTarget > 0 && <Goal label="À réviser" done={reviewDone} total={reviewTarget} />}
            <p className="text-xs text-muted">Des repères, jamais une obligation : ce qui n’est pas fait n’est pas reporté.</p>
          </div>
        </>
      )}

      <h2 className="label mb-2.5 mt-[30px]">Régularité</h2>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="card p-4"><span className="font-display text-[30px] font-semibold leading-none">{weekDays}<small className="text-[15px]">/7</small></span><p className="text-sm text-muted">jours actifs cette semaine</p></div>
        <div className="card p-4"><span className="font-display text-[30px] font-semibold leading-none">{Math.round(weekPages * 10) / 10}<small className="text-[15px]"> p.</small></span><p className="text-sm text-muted">pages travaillées</p></div>
      </div>
      <div className="card mt-2.5 p-4">
        <p className="text-sm text-muted">Prochaine révision importante</p>
        <p><b>{reinforceNext ? NextRein(reinforceNext.id, reinforceNext.date, today) : upcoming ? `${surahMeta(upcoming.surah).tr} · ${rangeLabel(upcoming.surah, upcoming.from, upcoming.to).replace(/^Sourate \d+ — /, '')} (≈ dans ${upcoming.inDays} j)` : 'Rien de prévu'}</b></p>
      </div>
      <div className="card mt-2.5 flex items-center justify-between gap-3 p-4">
        <div><b>Le Coran numérique</b><p className="text-sm text-muted">Lecture page par page, sans distraction.</p></div>
        <Link to={`/coran?p=${lastPage}`} className="btn-soft !min-h-[36px] !px-3 text-sm"><BookOpen size={16} /> Ouvrir</Link>
      </div>
      <div className="mt-5 rounded-[28px] bg-primary/10 px-5 py-5">
        <p className="ar text-center text-[30px] leading-[1.7] text-primary" lang="ar" dir="rtl">{motivation ?? '\u00A0'}</p>
        <p className="mt-1 text-center font-display text-[15.5px] font-semibold italic leading-snug">« Et récite le Coran lentement et clairement. »</p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted"><Leaf size={15} className="text-primary" /> Al-Muzzammil · verset 4</p>
      </div>
    </Screen>
  );
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
    <div className="relative h-[112px] w-[112px] shrink-0">
      <svg viewBox="0 0 128 128" className="-rotate-90" aria-hidden>
        <circle r={R} cx="64" cy="64" fill="none" strokeWidth="14" className="stroke-neutral" />
        {seg(learned, 'stroke-good')}
        {seg(learning, 'stroke-blue')}
        {seg(reinforce, 'stroke-hard')}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <b className="font-display text-[34px] font-semibold leading-none">{learned}</b>
        <span className="mt-1 text-xs text-muted">mémorisées</span>
      </div>
    </div>
  );
}
