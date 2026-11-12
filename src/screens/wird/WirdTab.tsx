import { ArrowRight, Check, Pause, Play, Search, SkipForward, Undo2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AddLearningSheet } from '@/components/AddLearningSheet';
import { FastScroll } from '@/components/FastScroll';
import { matchSurah } from '@/components/SurahPickerList';
import { ConfirmSheet, Empty, GradeChip, ProgressBar, Screen, Segmented, Sheet, SurahNumber, Tabs, cx, toast } from '@/components/ui';
import { addDays } from '@/engine/dates';
import { formatPages } from '@/engine/pages';
import { goalProgress, itemPages, learningSegment } from '@/engine/plan';
import { allSurahStats, hizbSurahs, type SurahStats } from '@/engine/progress';
import { HIZB_STARTS, rangeLabel, surahMeta, SURAHS } from '@/engine/quran';
import type { PlanItem, WorkKind } from '@/engine/types';
import { formatDateLong, useToday } from '@/lib/hooks';
import { planCounts } from '@/lib/plan';
import { useWird } from '@/store/useWird';
import { SurahGrid } from './SurahGrid';

type Tab = 'aujourdhui' | 'sourates' | 'apprentissage';
const TABS: { value: Tab; label: string }[] = [
  { value: 'aujourdhui', label: 'Aujourd’hui' },
  { value: 'sourates', label: 'Mes sourates' },
  { value: 'apprentissage', label: 'Apprentissage' },
];

export default function WirdTab() {
  const { tab } = useParams<{ tab: string }>();
  const nav = useNavigate();
  if (tab !== 'aujourdhui' && tab !== 'sourates' && tab !== 'apprentissage') return <Navigate to="/wird/aujourdhui" replace />;
  return (
    <Screen title="Mon Wird" tabs={<Tabs<Tab> value={tab} onChange={(t) => nav(`/wird/${t}`, { replace: true })} options={TABS} />}>
      {tab === 'aujourdhui' && <Today />}
      {tab === 'sourates' && <MySurahs />}
      {tab === 'apprentissage' && <Learning />}
    </Screen>
  );
}

// ---------------------------------------------------------------- Aujourd'hui
const KINDS: { kind: WorkKind; title: string; hint: string }[] = [
  { kind: 'learn', title: 'À apprendre', hint: 'Nouvelles sourates, à votre rythme.' },
  { kind: 'review', title: 'À réviser', hint: 'Rotation générale : tout ce que vous avez appris revient à son tour.' },
  { kind: 'reinforce', title: 'Renforcement', hint: 'Versets fragiles proposés plus souvent, jusqu’à ce qu’ils se stabilisent.' },
];

function Today() {
  const nav = useNavigate();
  const today = useToday();
  const { plan, dayLog, session, startSession, skipItem, reopenItem, settings } = useWird();
  const c = planCounts(plan);
  const finished = c.total > 0 && c.open === 0;
  const yesterday = dayLog.find((d) => d.date === addDays(today, -1));
  const begin = () => {
    if (startSession()) nav('/session');
  };

  if (c.total === 0)
    return (
      <Empty title="Rien au programme aujourd’hui" action={<Link to="/profil/wird" className="btn-primary">Régler mes objectifs</Link>}>
        Ajoutez ce que vous connaissez dans « Mes sourates », ou fixez un objectif d’apprentissage ou de révision en pages.
      </Empty>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{formatDateLong()}</p>
        <p className="text-sm font-semibold tabular-nums text-primary">{c.done} / {c.total} traités</p>
      </div>
      {finished ? (
        <button onClick={() => nav('/session/bilan')} className="btn-soft w-full"><Check size={18} /> Séance terminée — voir le bilan</button>
      ) : (
        <button onClick={begin} className="btn-primary w-full"><Play size={18} /> {session || c.done > 0 ? 'Reprendre la séance' : 'Commencer la séance'}</button>
      )}
      {yesterday && yesterday.notDone + yesterday.skipped > 0 && (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">Hier, une partie du programme n’a pas été traitée. Rien n’est reporté : vous repartez d’une page propre.</p>
      )}
      {KINDS.map(({ kind, title, hint }) => {
        const items = plan!.items.filter((i) => i.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind}>
            <h2 className="mb-1 flex items-baseline justify-between">
              <span className="font-display text-xl font-semibold">{title}</span>
              <span className="text-xs text-muted">{formatPages(items.reduce((a, i) => a + itemPages(i), 0))} · {items.filter((i) => i.status === 'done').length}/{items.length}</span>
            </h2>
            <p className="mb-2 text-xs text-muted">{hint}</p>
            <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-surface">
              {items.map((it) => <ItemRow key={it.id} it={it} onOpen={begin} onSkip={() => { skipItem(it.id); toast('Élément ignoré pour aujourd’hui'); }} onReopen={() => reopenItem(it.id)} />)}
            </ul>
          </section>
        );
      })}
      {settings.learnPagesPerDay === 0 && <p className="text-xs text-muted">L’objectif d’apprentissage est à 0 : aucun nouvel apprentissage n’est proposé (Profil › Paramètres du Wird).</p>}
    </div>
  );
}

function StatusPill({ it }: { it: PlanItem }) {
  if (it.status === 'done' && it.grade) return <GradeChip grade={it.grade} />;
  const map = { pending: ['À faire', 'bg-surface2 text-muted'], in_progress: ['À faire', 'bg-surface2 text-muted'], skipped: ['Ignoré', 'bg-surface2 text-muted line-through'], done: ['Terminé', 'bg-good-soft text-good'] } as const;
  const [label, cls] = map[it.status];
  return <span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', cls)}>{label}</span>;
}

function ItemRow({ it, onOpen, onSkip, onReopen }: { it: PlanItem; onOpen: () => void; onSkip: () => void; onReopen: () => void }) {
  const s = surahMeta(it.surah);
  const done = it.status === 'done';
  return (
    <li className={cx('flex items-center gap-3 px-3.5 py-3', done && 'opacity-75')}>
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen} disabled={done} aria-label={`${s.tr}, ${rangeLabel(it.surah, it.from, it.to)}`}>
        <SurahNumber n={it.surah} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{s.tr}</span>
          <span className="block text-[13px] text-muted">{rangeLabel(it.surah, it.from, it.to)} · {formatPages(itemPages(it))}</span>
          <span className="mt-1.5 block"><StatusPill it={it} /></span>
        </span>
      </button>
      {it.status === 'skipped' ? (
        <button onClick={onReopen} aria-label="Remettre au programme" className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface2"><Undo2 size={18} /></button>
      ) : !done ? (
        <button onClick={onSkip} aria-label="Passer cet élément" className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface2"><SkipForward size={18} /></button>
      ) : (
        <Check size={18} className="mx-3 text-good" />
      )}
    </li>
  );
}

// ---------------------------------------------------------------- Mes sourates
type View = 'grid' | 'list';
type Filter = 'all' | 'learned' | 'progress' | 'reinforce' | 'maintain';

function MySurahs() {
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem('wird-surah-view') as View) || 'grid'; } catch { return 'grid'; }
  });
  const change = (v: View) => {
    setView(v);
    try { localStorage.setItem('wird-surah-view', v); } catch { /* ignore */ }
  };
  return (
    <div>
      <div className="mb-4 max-w-[220px]">
        <Segmented<View> value={view} onChange={change} options={[{ value: 'grid', label: 'Tableau' }, { value: 'list', label: 'Liste' }]} />
      </div>
      {view === 'grid' ? <SurahGrid /> : <SurahList />}
    </div>
  );
}

function SurahList() {
  const today = useToday();
  const verses = useWird((s) => s.verses);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const [hizb, setHizb] = useState<number | null>(null);
  const [hizbOpen, setHizbOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  const inHizb = useMemo(() => (hizb ? new Set(hizbSurahs(hizb)) : null), [hizb]);
  const list = useMemo(
    () =>
      SURAHS.filter((s) => matchSurah(s, q)).filter((s) => !inHizb || inHizb.has(s.id)).filter((s) => {
        const st = stats[s.id - 1];
        switch (f) {
          case 'learned': return st.state === 'complete';
          case 'progress': return st.state === 'partial' || st.state === 'learning';
          case 'reinforce': return st.needsReinforcement;
          case 'maintain': return st.needsMaintenance;
          default: return true;
        }
      }),
    [q, f, stats, inHizb],
  );
  const FILTERS: { v: Filter; l: string }[] = [
    { v: 'all', l: 'Toutes' }, { v: 'learned', l: 'Apprises' }, { v: 'progress', l: 'En cours' }, { v: 'reinforce', l: 'À renforcer' }, { v: 'maintain', l: 'À entretenir' },
  ];
  return (
    <div>
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-10" placeholder="Rechercher (nom, numéro, arabe)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une sourate" />
      </div>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
        <button onClick={() => setHizbOpen(true)} className={cx('flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold', hizb ? 'border-gold bg-gold/15 text-ink' : 'border-line bg-surface text-primary')}>
          {hizb ? `Hizb ${hizb}` : 'Par hizb'}
          {hizb && <X size={14} onClick={(e) => { e.stopPropagation(); setHizb(null); }} aria-label="Retirer le filtre hizb" />}
        </button>
        {FILTERS.map((x) => (
          <button key={x.v} onClick={() => setF(x.v)} aria-pressed={f === x.v} className={cx('min-h-[36px] shrink-0 rounded-full border px-3.5 text-sm font-semibold transition', f === x.v ? 'border-deep bg-deep text-ivory' : 'border-line bg-surface text-muted')}>
            {x.l}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{list.length} sourate{list.length > 1 ? 's' : ''}{hizb ? ` dans le hizb ${hizb}` : ''}</p>
      <ul ref={listRef} className="mt-2 divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-surface">
        {list.map((s) => <SurahRow key={s.id} st={stats[s.id - 1]} />)}
        {!list.length && <li className="p-8 text-center text-sm text-muted">Aucune sourate ne correspond.</li>}
      </ul>
      <FastScroll targetRef={listRef} count={list.length} label={(i) => (list[i] ? `${list[i].id}. ${list[i].tr}` : '')} />
      <Sheet open={hizbOpen} onClose={() => setHizbOpen(false)} title="Filtrer par hizb">
        <p className="mb-3 text-sm text-muted">Affiche les sourates dont au moins un verset appartient au hizb choisi (Mushaf de Médine).</p>
        <div className="grid grid-cols-6 gap-2">
          {HIZB_STARTS.map((_, i) => (
            <button key={i} onClick={() => { setHizb(i + 1); setHizbOpen(false); }} className={cx('flex h-11 items-center justify-center rounded-lg border text-sm font-bold tabular-nums', hizb === i + 1 ? 'border-deep bg-deep text-ivory' : 'border-line bg-surface')}>{i + 1}</button>
          ))}
        </div>
        {hizb && <button className="btn-ghost mt-3 w-full" onClick={() => { setHizb(null); setHizbOpen(false); }}>Toutes les sourates</button>}
      </Sheet>
    </div>
  );
}

export function stateLabel(st: SurahStats): { label: string; cls: string } {
  if (st.state === 'complete') return { label: 'Apprise', cls: 'bg-good-soft text-good' };
  if (st.state === 'partial') return { label: 'En cours', cls: 'bg-blue-soft text-blue' };
  if (st.state === 'learning') return { label: 'Apprentissage', cls: 'bg-blue-soft text-blue' };
  return { label: '', cls: '' };
}

export function SurahRow({ st }: { st: SurahStats }) {
  const s = surahMeta(st.surah);
  const lab = stateLabel(st);
  return (
    <li>
      <Link to={`/wird/sourates/${s.id}`} className="flex items-center gap-3 px-3.5 py-3 active:bg-surface2">
        <SurahNumber n={s.id} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{s.tr}</span>
            {lab.label && <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', lab.cls)}>{lab.label}</span>}
          </span>
          <span className="block text-xs text-muted">
            {s.fr} · {s.n} versets
            {st.needsReinforcement && <span className="font-semibold text-hard"> · à renforcer</span>}
            {st.needsMaintenance && <span className="text-warn"> · à entretenir</span>}
          </span>
          {(st.memorized > 0 || st.learning > 0) && <ProgressBar value={st.memorized / st.total} tone="good" className="mt-2" />}
        </span>
        <span className="ar text-2xl leading-none" lang="ar">{s.ar}</span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------- Mon apprentissage
function Learning() {
  const { goals, verses, settings, toggleGoalPause, completeGoal, deleteGoal } = useWird();
  const [add, setAdd] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'complete' | 'delete' } | null>(null);
  const active = goals.filter((g) => !g.completedAt);
  const done = goals.filter((g) => g.completedAt);
  const ctx = { verses };

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
        {settings.learnPagesPerDay > 0 ? (<>Objectif : <b className="text-ink">{formatPages(settings.learnPagesPerDay)} par jour</b>, nouvelles sourates {settings.learnDirection === 'forward' ? 'de Al-Fatiha vers An-Nas' : 'de An-Nas vers Al-Fatiha'}. </>) : 'Aucun objectif d’apprentissage (0 page par jour). '}
        <Link to="/profil/wird" className="font-semibold text-primary">Modifier</Link>
      </p>
      {active.length === 0 && <Empty title="Aucun apprentissage en cours">{settings.learnPagesPerDay > 0 ? 'WIRD ouvrira automatiquement la prochaine sourate à apprendre.' : 'Ajoutez une sourate ou quelques versets à mémoriser.'}</Empty>}
      {active.map((g) => {
        const s = surahMeta(g.surah);
        const p = goalProgress(g);
        const seg = learningSegment(ctx, g);
        const complete = p.done >= p.total || !seg;
        return (
          <article key={g.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <SurahNumber n={g.surah} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{s.tr} {g.auto && <span className="ml-1 rounded-full bg-blue-soft px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-blue">Auto</span>}</p>
                <p className="text-[13px] text-muted">{rangeLabel(g.surah, g.from, g.to)}</p>
              </div>
              {g.paused && <span className="rounded-full bg-surface2 px-2.5 py-1 text-xs font-semibold text-muted">En pause</span>}
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span>{complete ? 'Tous les versets ont été travaillés' : seg ? `Prochain : ${seg.from === seg.to ? `verset ${seg.from}` : `versets ${seg.from} à ${seg.to}`}` : ''}</span>
                <span className="tabular-nums">{p.done} / {p.total}</span>
              </div>
              <ProgressBar value={p.total ? p.done / p.total : 0} tone="blue" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!g.auto && (
                <button className={complete ? 'btn-primary min-h-[44px] flex-1' : 'btn-soft min-h-[44px] flex-1'} onClick={() => setConfirm({ id: g.id, kind: 'complete' })}>
                  <Check size={16} /> Marquer comme terminé
                </button>
              )}
              {g.auto && <p className="flex-1 self-center text-xs leading-relaxed text-muted">Se termine automatiquement quand tous les versets ont été travaillés.</p>}
              <button className="btn-outline min-h-[44px]" onClick={() => toggleGoalPause(g.id)} aria-label={g.paused ? 'Reprendre cet apprentissage' : 'Mettre en pause'}>{g.paused ? <Play size={16} /> : <Pause size={16} />}</button>
              {!g.auto && <button className="btn-ghost min-h-[44px] text-alert" onClick={() => setConfirm({ id: g.id, kind: 'delete' })}>Retirer</button>}
            </div>
          </article>
        );
      })}
      <button className="btn-outline w-full" onClick={() => setAdd(true)}>+ Choisir moi-même une sourate ou des versets</button>
      {done.length > 0 && (
        <section>
          <h2 className="label mb-2">Apprentissages terminés</h2>
          <ul className="divide-y divide-line/70 rounded-xl border border-line bg-surface">
            {done.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                <Check size={16} className="text-good" />
                <span className="flex-1 text-sm"><b>{surahMeta(g.surah).tr}</b> <span className="text-muted">· {rangeLabel(g.surah, g.from, g.to).replace(/^Sourate \d+ — /, '')}</span></span>
                <Link to={`/wird/sourates/${g.surah}`} aria-label="Ouvrir la sourate"><ArrowRight size={16} className="text-muted" /></Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AddLearningSheet open={add} onClose={() => setAdd(false)} />
      <ConfirmSheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'complete' ? 'Marquer comme terminé ?' : 'Retirer cet apprentissage ?'}
        message={confirm?.kind === 'complete' ? 'Ces versets entrent dans votre rotation de révision et seront proposés en confirmation dès demain.' : 'Les versets encore en apprentissage ne seront plus suivis. Les versets déjà mémorisés restent dans votre rotation.'}
        confirmLabel={confirm?.kind === 'complete' ? 'Oui, terminé' : 'Retirer'}
        danger={confirm?.kind === 'delete'}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'complete') { completeGoal(confirm.id); toast('Apprentissage terminé — bravo'); }
          else deleteGoal(confirm.id);
        }}
      />
    </div>
  );
}
