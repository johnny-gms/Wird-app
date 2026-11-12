import { ArrowRight, Check, Pause, Play, SkipForward, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AddLearningSheet } from '@/components/AddLearningSheet';
import { SurahNumber, GradeChip, Page, PageTitle, ProgressBar, Segmented, Empty, ConfirmSheet, cx, toast } from '@/components/ui';
import { matchSurah } from '@/components/SurahPickerList';
import { addDays } from '@/engine/dates';
import { goalProgress, learningSegment } from '@/engine/plan';
import { allSurahStats, type SurahStats } from '@/engine/progress';
import { rangeLabel, surahMeta, SURAHS } from '@/engine/quran';
import type { PlanItem, WorkKind } from '@/engine/types';
import { formatDateLong, useToday } from '@/lib/hooks';
import { planCounts } from '@/lib/plan';
import { useWird } from '@/store/useWird';
import { Search } from 'lucide-react';

type Tab = 'aujourdhui' | 'sourates' | 'apprentissage';

export default function WirdTab() {
  const { tab } = useParams<{ tab: string }>();
  const nav = useNavigate();
  if (tab !== 'aujourdhui' && tab !== 'sourates' && tab !== 'apprentissage') return <Navigate to="/wird/aujourdhui" replace />;
  return (
    <Page>
      <PageTitle>Mon Wird</PageTitle>
      <Segmented<Tab>
        value={tab}
        onChange={(t) => nav(`/wird/${t}`, { replace: true })}
        options={[
          { value: 'aujourdhui', label: 'Aujourd’hui' },
          { value: 'sourates', label: 'Mes sourates' },
          { value: 'apprentissage', label: 'Apprentissage' },
        ]}
      />
      <div className="mt-5">
        {tab === 'aujourdhui' && <Today />}
        {tab === 'sourates' && <MySurahs />}
        {tab === 'apprentissage' && <Learning />}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- Aujourd'hui
const KINDS: WorkKind[] = ['review', 'reinforce', 'learn'];

function Today() {
  const nav = useNavigate();
  const today = useToday();
  const { plan, dayLog, startSession, skipItem, reopenItem, settings } = useWird();
  const c = planCounts(plan);
  const finished = c.total > 0 && c.open === 0;
  const yesterday = dayLog.find((d) => d.date === addDays(today, -1));

  const begin = (id?: string) => {
    if (startSession(id)) nav('/session');
  };

  if (c.total === 0)
    return (
      <Empty title="Rien au programme aujourd’hui" action={<Link to="/wird/sourates" className="btn-primary">Choisir mes sourates</Link>}>
        Indiquez ce que vous avez déjà mémorisé pour alimenter la rotation de révision, ou ajoutez un nouvel apprentissage.
      </Empty>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{formatDateLong()}</p>
        <p className="text-sm font-semibold tabular-nums text-primary">
          {c.done} / {c.total} traités
        </p>
      </div>
      {!finished && (
        <button onClick={() => begin()} className="btn-primary w-full">
          <Play size={18} /> {c.done > 0 || c.inProgress ? 'Reprendre mon Wird' : 'Commencer mon Wird'}
        </button>
      )}
      {finished && (
        <button onClick={() => nav('/session/bilan')} className="btn-soft w-full">
          <Check size={18} /> Wird accompli — voir le bilan
        </button>
      )}
      {yesterday && yesterday.notDone + yesterday.skipped > 0 && (
        <p className="rounded-xl bg-surface2 px-4 py-3 text-sm leading-relaxed text-muted">Hier, une partie du programme n’a pas été traitée. Ce n’est pas grave : rien n’est reporté, vous repartez d’une page propre.</p>
      )}
      {KINDS.map((k) => {
        const items = plan!.items.filter((i) => i.kind === k);
        if (!items.length) return null;
        return (
          <section key={k}>
            <h2 className="label mb-2 flex items-center justify-between">
              <span>{k === 'review' ? 'Révisions' : k === 'reinforce' ? 'Renforcement' : 'Nouvel apprentissage'}</span>
              <span className="normal-case tracking-normal">{items.filter((i) => i.status === 'done').length} / {items.length}</span>
            </h2>
            <p className="mb-2 text-xs text-muted">
              {k === 'review' ? 'Rotation générale : tout ce que vous avez mémorisé revient à son tour.' : k === 'reinforce' ? 'Versets fragiles proposés plus souvent, jusqu’à ce qu’ils se stabilisent.' : 'À votre rythme, sans quantité imposée.'}
            </p>
            <ul className="card divide-y divide-line/60 overflow-hidden">
              {items.map((it) => (
                <ItemRow key={it.id} it={it} onOpen={() => begin(it.id)} onSkip={() => { skipItem(it.id); toast('Élément ignoré pour aujourd’hui'); }} onReopen={() => reopenItem(it.id)} />
              ))}
            </ul>
          </section>
        );
      })}
      {!settings.learningEnabled && <p className="text-xs text-muted">Le nouvel apprentissage est désactivé dans les réglages du Wird.</p>}
    </div>
  );
}

function StatusPill({ it }: { it: PlanItem }) {
  if (it.status === 'done' && it.grade) return <GradeChip grade={it.grade} />;
  const map = { pending: ['À faire', 'bg-surface2 text-muted'], in_progress: ['En cours', 'bg-soft text-primary'], skipped: ['Ignoré', 'bg-surface2 text-muted line-through'], done: ['Terminé', 'bg-good-soft text-good'] } as const;
  const [label, cls] = map[it.status];
  return <span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', cls)}>{label}</span>;
}

function ItemRow({ it, onOpen, onSkip, onReopen }: { it: PlanItem; onOpen: () => void; onSkip: () => void; onReopen: () => void }) {
  const s = surahMeta(it.surah);
  const done = it.status === 'done';
  return (
    <li className={cx('flex items-center gap-3 px-4 py-3.5', done && 'opacity-75')}>
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen} disabled={done} aria-label={`${s.tr}, ${rangeLabel(it.surah, it.from, it.to)}`}>
        <SurahNumber n={it.surah} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{s.tr}</span>
          <span className="block text-[13px] text-muted">{rangeLabel(it.surah, it.from, it.to)}</span>
          <span className="mt-1.5 block"><StatusPill it={it} /></span>
        </span>
      </button>
      {it.status === 'skipped' ? (
        <button onClick={onReopen} aria-label="Remettre au programme" className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface2">
          <Undo2 size={18} />
        </button>
      ) : !done ? (
        <button onClick={onSkip} aria-label="Passer cet élément" className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface2">
          <SkipForward size={18} />
        </button>
      ) : (
        <Check size={18} className="mx-3 text-good" />
      )}
    </li>
  );
}

// ---------------------------------------------------------------- Mes sourates
type Filter = 'all' | 'memorized' | 'progress' | 'maintain' | 'reinforce';

function MySurahs() {
  const today = useToday();
  const verses = useWird((s) => s.verses);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  const list = useMemo(
    () =>
      SURAHS.filter((s) => matchSurah(s, q)).filter((s) => {
        const st = stats[s.id - 1];
        switch (f) {
          case 'memorized': return st.state === 'complete';
          case 'progress': return st.state === 'partial' || st.state === 'learning';
          case 'maintain': return st.needsMaintenance;
          case 'reinforce': return st.needsReinforcement;
          default: return true;
        }
      }),
    [q, f, stats],
  );
  const FILTERS: { v: Filter; l: string }[] = [
    { v: 'all', l: 'Toutes' },
    { v: 'memorized', l: 'Terminées' },
    { v: 'progress', l: 'En cours' },
    { v: 'maintain', l: 'À entretenir' },
    { v: 'reinforce', l: 'Renforcement' },
  ];
  return (
    <div>
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-10" placeholder="Rechercher (nom, numéro, arabe)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une sourate" />
      </div>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
        {FILTERS.map((x) => (
          <button key={x.v} onClick={() => setF(x.v)} aria-pressed={f === x.v} className={cx('min-h-[36px] shrink-0 rounded-full px-3.5 text-sm font-semibold transition', f === x.v ? 'bg-primary text-primary-ink' : 'bg-surface2 text-muted')}>
            {x.l}
          </button>
        ))}
      </div>
      <ul className="card mt-4 divide-y divide-line/60 overflow-hidden">
        {list.map((s) => (
          <SurahRow key={s.id} st={stats[s.id - 1]} />
        ))}
        {!list.length && <li className="p-8 text-center text-sm text-muted">Aucune sourate ne correspond.</li>}
      </ul>
    </div>
  );
}

export function stateLabel(st: SurahStats): { label: string; cls: string } {
  if (st.state === 'complete') return { label: 'Mémorisée', cls: 'bg-good-soft text-good' };
  if (st.state === 'partial') return { label: 'En cours', cls: 'bg-soft text-primary' };
  if (st.state === 'learning') return { label: 'Apprentissage', cls: 'bg-warn-soft text-warn' };
  return { label: '', cls: '' };
}

export function SurahRow({ st }: { st: SurahStats }) {
  const s = surahMeta(st.surah);
  const lab = stateLabel(st);
  return (
    <li>
      <Link to={`/wird/sourates/${s.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-surface2">
        <SurahNumber n={s.id} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{s.tr}</span>
            {lab.label && <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', lab.cls)}>{lab.label}</span>}
          </span>
          <span className="block text-xs text-muted">
            {s.fr} · {s.n} versets
            {st.needsReinforcement && <span className="text-warn"> · renforcement</span>}
            {st.needsMaintenance && <span className="text-hard"> · à entretenir</span>}
          </span>
          {(st.memorized > 0 || st.learning > 0) && <ProgressBar value={st.memorized / st.total} className="mt-2" tone="good" />}
        </span>
        <span className="ar text-2xl leading-none" lang="ar">
          {s.ar}
        </span>
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
  const ctx = { verses, goals, rotation: { cursor: null, cycles: 0 }, settings };

  return (
    <div className="space-y-4">
      {!settings.learningEnabled && <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Le nouvel apprentissage est désactivé : il n’apparaît pas dans le programme du jour. Réactivez-le depuis Profil › Paramètres du Wird.</p>}
      {active.length === 0 && (
        <Empty title="Aucun apprentissage en cours">Ajoutez une sourate ou quelques versets à mémoriser. Aucune quantité quotidienne n’est imposée.</Empty>
      )}
      {active.map((g) => {
        const s = surahMeta(g.surah);
        const p = goalProgress(g);
        const seg = learningSegment(ctx, g);
        const complete = p.done >= p.total || !seg;
        return (
          <article key={g.id} className="card p-4">
            <div className="flex items-center gap-3">
              <SurahNumber n={g.surah} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{s.tr}</p>
                <p className="text-[13px] text-muted">{rangeLabel(g.surah, g.from, g.to)}</p>
              </div>
              {g.paused && <span className="rounded-full bg-surface2 px-2.5 py-1 text-xs font-semibold text-muted">En pause</span>}
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span>{complete ? 'Tous les versets ont été travaillés' : seg ? `Prochain : ${seg.from === seg.to ? `verset ${seg.from}` : `versets ${seg.from} à ${seg.to}`}` : ''}</span>
                <span className="tabular-nums">{p.done} / {p.total}</span>
              </div>
              <ProgressBar value={p.total ? p.done / p.total : 0} tone="good" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={complete ? 'btn-primary min-h-[44px] flex-1' : 'btn-soft min-h-[44px] flex-1'} onClick={() => setConfirm({ id: g.id, kind: 'complete' })}>
                <Check size={16} /> Marquer comme terminé
              </button>
              <button className="btn-outline min-h-[44px]" onClick={() => toggleGoalPause(g.id)} aria-label={g.paused ? 'Reprendre cet apprentissage' : 'Mettre en pause'}>
                {g.paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button className="btn-ghost min-h-[44px] text-alert" onClick={() => setConfirm({ id: g.id, kind: 'delete' })}>
                Retirer
              </button>
            </div>
          </article>
        );
      })}
      <button className="btn-outline w-full" onClick={() => setAdd(true)}>
        + Ajouter une sourate ou des versets
      </button>
      {done.length > 0 && (
        <section>
          <h2 className="label mb-2">Apprentissages terminés</h2>
          <ul className="card divide-y divide-line/60">
            {done.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                <Check size={16} className="text-good" />
                <span className="flex-1 text-sm">
                  <b>{surahMeta(g.surah).tr}</b> <span className="text-muted">· {rangeLabel(g.surah, g.from, g.to).replace(/^Sourate \d+ — /, '')}</span>
                </span>
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

