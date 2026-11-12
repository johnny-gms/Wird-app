import { ArrowRight, Check, Play } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen, SurahNumber, ProgressBar, cx } from '@/components/ui';
import { itemPages } from '@/engine/plan';
import { formatPages } from '@/engine/pages';
import { activeDaySet, activeDaysIn, allSurahStats, cellState, currentStreak, memorizedPages, overall, pagesByDay } from '@/engine/progress';
import { addDays } from '@/engine/dates';
import { rangeLabel, surahMeta } from '@/engine/quran';
import { TOTAL_PAGES } from '@/engine/pages';
import type { PlanItem, WorkKind } from '@/engine/types';
import { formatDateLong, greeting, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';
import { CELL_BG } from './wird/SurahGrid';

const GROUPS: { kind: WorkKind; label: string }[] = [
  { kind: 'learn', label: 'À apprendre' },
  { kind: 'review', label: 'À réviser' },
  { kind: 'reinforce', label: 'Renforcement' },
];

export default function Home() {
  const nav = useNavigate();
  const today = useToday();
  const { profile, plan, verses, session, startSession } = useWird();
  const items = plan?.items ?? [];
  const open = items.filter((i) => i.status === 'pending');
  const done = items.filter((i) => i.status === 'done');
  const pagesOf = (k: WorkKind) => items.filter((i) => i.kind === k).reduce((a, i) => a + itemPages(i), 0);
  const o = useMemo(() => overall(verses, today), [verses, today]);
  const pagesMem = useMemo(() => memorizedPages(verses), [verses]);
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  const hasAny = o.memorizedVerses + o.learningVerses > 0;
  const finished = items.length > 0 && open.length === 0;
  const started = !!session || done.length > 0;

  const go = () => {
    if (finished) return nav('/session/bilan');
    if (startSession()) nav('/session');
  };

  const headline = items.length === 0 ? 'Commençons doucement' : finished ? 'Séance terminée' : started ? 'Reprenons là où vous en étiez' : 'Prêt pour votre séance';
  const sub =
    items.length === 0
      ? hasAny ? 'Rien de prévu aujourd’hui. Ajustez vos objectifs ou ajoutez des versets.' : 'Indiquez les sourates que vous connaissez pour lancer la révision.'
      : finished ? 'Qu’Allah accepte votre effort. À demain, in châ’ Allah.' : 'Vous voyez tout le programme, puis vous évaluez à la fin.';

  return (
    <Screen
      title={<>{greeting()}{profile.name ? `, ${profile.name}` : ''}</>}
      sub={formatDateLong()}
      right={
        <Link to="/profil" aria-label="Profil" className="mt-1 flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-surface2 font-display text-lg font-bold">
          {(profile.name[0] ?? 'W').toUpperCase()}
        </Link>
      }
    >
      {profile.demo && (
        <Link to="/profil/donnees" className="mb-3 block rounded-xl bg-warn-soft px-4 py-2.5 text-xs font-medium text-warn">
          Données de démonstration — effaçables depuis Profil › Données.
        </Link>
      )}

      {/* ---------- Carte principale ---------- */}
      <section className="hero px-[18px] py-5" aria-label="Programme du jour">
        <p className="text-sm text-white/75">Programme du jour</p>
        <h2 className="mt-1 font-display text-[30px] font-semibold normal-case leading-[1.1] tracking-normal text-white">{headline}</h2>
        <p className="mt-2 text-[15px] leading-snug text-white/75">{sub}</p>
        {items.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/20 pt-3 text-center">
            <Figure label="à apprendre" value={pagesOf('learn')} />
            <Figure label="à réviser" value={pagesOf('review')} sub={pagesOf('reinforce') > 0 ? `+ ${formatPages(pagesOf('reinforce'))} renfort` : undefined} />
            <div>
              <p className="font-display text-[22px] font-semibold leading-none tabular-nums">{done.length}<span className="text-base text-white/60"> / {items.length}</span></p>
              <p className="mt-1.5 text-xs text-white/70">terminé</p>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <Link to={hasAny ? '/profil/wird' : '/wird/sourates'} className="btn mt-4 w-full bg-white text-primary">{hasAny ? 'Régler mes objectifs' : 'Choisir mes sourates'}</Link>
        ) : (
          <button onClick={go} className="btn mt-4 w-full bg-white text-primary">
            {finished ? <Check size={18} /> : <Play size={18} />}
            {finished ? 'Voir le bilan' : started ? 'Reprendre la séance' : 'Commencer la séance'}
          </button>
        )}
      </section>

      {/* ---------- Programme ---------- */}
      {items.length > 0 && (
        <section aria-labelledby="prog">
          <h2 id="prog" className="label mb-2.5 mt-[30px] flex items-baseline justify-between">
            <span>Aujourd’hui</span>
            <span className="text-xs font-medium normal-case tracking-normal">{open.length ? `${open.length} à faire` : 'Tout est fait'}</span>
          </h2>
          <div className="space-y-3">
            {GROUPS.map(({ kind, label }) => {
              const list = items.filter((i) => i.kind === kind);
              if (!list.length) return null;
              return (
                <div key={kind}>
                  <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><span className={cx('h-2 w-2 rounded-full', kind === 'learn' ? 'bg-blue' : kind === 'review' ? 'bg-primary' : 'bg-hard')} />{label}<span className="font-normal text-muted">· {formatPages(list.reduce((a, i) => a + itemPages(i), 0))}</span></p>
                  <ul className="card divide-y divide-line overflow-hidden">
                    {list.map((it) => <Row key={it.id} it={it} />)}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- Progression ---------- */}
      <section aria-labelledby="prog2">
        <h2 id="prog2" className="label mb-2.5 mt-[30px] flex items-baseline justify-between">
          <span>Ma progression</span>
          <Link to="/wird/sourates" className="flex items-center gap-1 text-xs font-semibold normal-case tracking-normal text-primary">Les 114 sourates <ArrowRight size={13} /></Link>
        </h2>
        {hasAny ? (
          <div className="card p-4">
            <div className="flex items-end gap-4">
              <div>
                <p className="font-display text-[40px] font-semibold leading-none tabular-nums">{o.ratio === 0 ? 0 : o.ratio < 0.01 ? '<1' : Math.round(o.ratio * 100)}<span className="text-2xl text-muted">%</span></p>
                <p className="mt-1 text-sm text-muted">du Coran</p>
              </div>
              <div className="flex-1 pb-1">
                <ProgressBar value={pagesMem / TOTAL_PAGES} />
                <p className="mt-1.5 text-xs text-muted">≈ {formatPages(pagesMem)} sur {TOTAL_PAGES}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2.5">
              <Mini n={o.surahsComplete} l="sourates apprises" />
              <Mini n={Math.max(0, o.surahsWorked - o.surahsComplete)} l="en cours" />
              <Mini n={o.hizbCovered} l="hizb couverts" />
            </dl>
            <Link to="/wird/sourates" aria-label="Voir les 114 sourates" className="mt-4 flex h-8 items-stretch gap-[2px] overflow-hidden rounded-md">
              {stats.map((st) => <span key={st.surah} className={cx('flex-1', CELL_BG[cellState(st)])} title={`${st.surah}. ${surahMeta(st.surah).tr}`} />)}
            </Link>
            <Legend />
          </div>
        ) : (
          <p className="card p-4 text-sm text-muted">Votre progression apparaîtra dès que vous aurez ajouté des sourates.</p>
        )}
      </section>

      <Regularity today={today} />
    </Screen>
  );
}

function Figure({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const f = formatPages(value);
  const [n, ...rest] = f.split(' ');
  return (
    <div>
      <p className="font-display text-[22px] font-semibold leading-none tabular-nums">{value > 0 && value < 0.05 ? '<0,1' : n}<span className="ml-1 text-xs font-medium text-white/65">{value > 0 && value < 0.05 ? 'page' : rest.join(' ')}</span></p>
      <p className="mt-1.5 text-xs text-white/70">{label}</p>
      {sub && <p className="text-[10px] text-white/55">{sub}</p>}
    </div>
  );
}

function Mini({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-[14px] bg-surface2 px-2 py-2.5 text-center">
      <dd className="font-display text-[22px] font-semibold leading-tight">{n}</dd>
      <dt className="text-xs text-muted">{l}</dt>
    </div>
  );
}

export function Legend() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-muted">
      {[['learned', 'Apprise'], ['learning', 'En cours'], ['reinforce', 'À renforcer'], ['none', 'Non commencée']].map(([k, l]) => (
        <li key={k} className="flex items-center gap-1.5"><i className={cx('h-[11px] w-[11px] rounded-[3px]', CELL_BG[k as keyof typeof CELL_BG])} />{l}</li>
      ))}
    </ul>
  );
}

function Row({ it }: { it: PlanItem }) {
  const s = surahMeta(it.surah);
  const done = it.status === 'done';
  const skipped = it.status === 'skipped';
  return (
    <li>
      <Link to={`/wird/sourates/${it.surah}`} className={cx('flex items-center gap-3 px-3.5 py-3 active:bg-surface2', (done || skipped) && 'opacity-60')}>
        <SurahNumber n={it.surah} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{s.tr}</span>
          <span className="block text-xs text-muted">{rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')} · {formatPages(itemPages(it))}</span>
        </span>
        <span className="ar text-xl leading-none" lang="ar">{s.ar}</span>
        {done ? <Check size={18} className="text-good" /> : skipped ? <span className="text-[11px] font-semibold text-muted">ignoré</span> : <span className="h-4 w-4 rounded-full border-2 border-line" />}
      </Link>
    </li>
  );
}

/** Régularité : un chapelet de 30 perles — une par jour, plus grosse quand le travail du jour est plus important. */
function Regularity({ today }: { today: string }) {
  const history = useWird((s) => s.history);
  const days = useMemo(() => activeDaySet(history), [history]);
  const beads = useMemo(() => pagesByDay(history, today, 30), [history, today]);
  const streak = currentStreak(days, today);
  const active30 = activeDaysIn(days, addDays(today, -29), today);
  const pages7 = beads.slice(-7).reduce((a, d) => a + d.pages, 0);
  const W = 300;
  const step = W / 30;
  const message =
    history.length === 0 ? 'Votre première séance vous attend, sans pression.'
    : days.has(today) ? (streak >= 3 ? `${streak} jours de suite. Belle constance, qu’Allah vous facilite.` : 'Séance faite aujourd’hui. Très bien.')
    : streak >= 1 ? `${streak} ${streak > 1 ? 'jours' : 'jour'} de suite jusqu’ici. Une séance, même courte, prolonge le chapelet.`
    : 'Bon retour. Reprenez là où vous en étiez : rien à rattraper.';
  return (
    <section aria-labelledby="reg">
      <h2 id="reg" className="label mb-2.5 mt-[30px]">Régularité</h2>
      <div className="card p-4">
        <svg viewBox={`0 0 ${W} 34`} className="w-full" role="img" aria-label={`${active30} jours actifs sur les 30 derniers jours`}>
          <line x1={step / 2} x2={W - step / 2} y1="17" y2="17" stroke="rgb(var(--line))" strokeWidth="1" />
          {beads.map((d, i) => {
            const cx0 = step * i + step / 2;
            const on = d.pages > 0;
            const r = on ? 3.2 + Math.min(1, d.pages / 3) * 3.6 : 2;
            const isToday = i === beads.length - 1;
            return (
              <g key={d.date}>
                {isToday && <circle cx={cx0} cy="17" r={r + 3} fill="none" stroke="rgb(var(--gold))" strokeWidth="1.2" />}
                <circle cx={cx0} cy="17" r={r} fill={on ? 'rgb(var(--primary))' : 'rgb(var(--surface))'} stroke={on ? 'none' : 'rgb(var(--line))'} strokeWidth="1.2" />
              </g>
            );
          })}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-muted"><span>il y a 30 jours</span><span>aujourd’hui</span></div>
        <dl className="mt-3 grid grid-cols-3 gap-2.5">
          <Mini n={streak} l={streak > 1 ? 'jours de suite' : 'jour de suite'} />
          <Mini n={active30} l="jours actifs / 30" />
          <Mini n={Math.round(pages7 * 10) / 10} l="pages cette semaine" />
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-muted">{message}</p>
      </div>
    </section>
  );
}
