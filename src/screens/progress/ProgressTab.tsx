import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Empty, ProgressBar, Ring, Screen, Segmented, Sheet, Tabs, cx } from '@/components/ui';
import { SurahRow } from '../wird/WirdTab';
import { activeDaySet, activeDaysIn, allHizbStats, allSurahStats, currentStreak, overall, volumeByDay } from '@/engine/progress';
import { addDays } from '@/engine/dates';
import { fromAyahId, hizbRange, rangeLabel, surahMeta } from '@/engine/quran';
import { useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';
import { Goals, History, Reports } from './ProgressMore';

type Tab = 'general' | 'sourates' | 'hizb' | 'historique' | 'bilans' | 'objectifs';
const TABS: { value: Tab; label: string }[] = [
  { value: 'general', label: 'Vue générale' },
  { value: 'sourates', label: 'Sourates' },
  { value: 'hizb', label: 'Hizb' },
  { value: 'historique', label: 'Historique' },
  { value: 'bilans', label: 'Bilans' },
  { value: 'objectifs', label: 'Objectifs' },
];

export default function ProgressTab() {
  const { tab } = useParams<{ tab: string }>();
  const nav = useNavigate();
  if (!TABS.some((t) => t.value === tab)) return <Navigate to="/progression/general" replace />;
  return (
    <Screen title="Progression" tabs={<Tabs<Tab> value={tab as Tab} onChange={(t) => nav(`/progression/${t}`, { replace: true })} options={TABS} />}>
      {tab === 'general' && <General />}
      {tab === 'sourates' && <SurahsTab />}
      {tab === 'hizb' && <HizbTab />}
      {tab === 'historique' && <History />}
      {tab === 'bilans' && <Reports />}
      {tab === 'objectifs' && <Goals />}
    </Screen>
  );
}

// ------------------------------------------------------------------ Vue générale
function General() {
  const today = useToday();
  const { verses, history, progressLog } = useWird();
  const o = useMemo(() => overall(verses, today), [verses, today]);
  const days = useMemo(() => activeDaySet(history), [history]);
  const streak = currentStreak(days, today);
  const vol = useMemo(() => volumeByDay(history, today, 14), [history, today]);
  const last30 = activeDaysIn(days, addDays(today, -29), today);
  const vol7 = vol.slice(-7).reduce((a, d) => a + d.verses, 0);
  const vol30 = useMemo(() => volumeByDay(history, today, 30).reduce((a, d) => a + d.verses, 0), [history, today]);
  const pct = o.ratio === 0 ? '0' : o.ratio < 0.01 ? '<1' : String(Math.round(o.ratio * 100));
  const hasAny = o.memorizedVerses + o.learningVerses > 0;
  const maxV = Math.max(1, ...vol.map((d) => d.verses));
  const evo = progressLog.length >= 2 && new Set(progressLog.map((p) => p.memorized)).size > 1 ? progressLog : null;

  return (
    <div className="space-y-3">
      <section className="card flex items-center gap-5 p-5">
        <Ring value={o.ratio} size={92} stroke={8}>
          <span className="font-display text-xl">{pct}%</span>
        </Ring>
        <div>
          <h2 className="font-display text-xl font-semibold">Progression générale</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{hasAny ? 'Part du Coran que vous entretenez, selon vos propres indications.' : 'Rien n’est encore suivi. Ajoutez vos sourates depuis Mon Wird.'}</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Tile n={o.surahsWorked} l="sourates travaillées" s={`dont ${o.surahsComplete} complète${o.surahsComplete > 1 ? 's' : ''}`} />
        <Tile n={o.hizbCovered} l="hizb couverts" s="sur 60" />
        <Tile n={days.size} l="jours actifs" s={`${last30} sur les 30 derniers jours`} />
        <Tile n={streak} l={streak > 1 ? 'jours de suite' : 'jour de suite'} s="série en cours" />
      </div>

      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="label">Volume de travail</h2>
          <span className="text-xs text-muted">{vol7} versets cette semaine · {vol30} sur 30 jours</span>
        </div>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucun travail enregistré pour l’instant.</p>
        ) : (
          <div className="mt-4 flex h-24 items-end gap-1.5" role="img" aria-label="Versets travaillés par jour sur 14 jours">
            {vol.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                <div className={cx('w-full rounded-t-md', d.verses ? 'bg-primary' : 'bg-surface2')} style={{ height: `${Math.max(d.verses ? 8 : 3, (d.verses / maxV) * 100)}%` }} title={`${d.date} : ${d.verses}`} />
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">14 derniers jours</p>
      </section>

      <section className="card p-5">
        <h2 className="label">Évolution de la progression</h2>
        {evo ? <Spark points={evo.map((p) => p.memorized)} /> : <p className="mt-3 text-sm text-muted">Pas encore assez de données : la courbe apparaîtra lorsque votre mémorisation aura évolué.</p>}
      </section>
    </div>
  );
}

function Spark({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 300;
  const h = 70;
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - 6 - ((p - min) / Math.max(1, max - min)) * (h - 12)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" role="img" aria-label="Évolution de la mémorisation">
      <polyline points={pts} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-primary" />
    </svg>
  );
}

function Tile({ n, l, s }: { n: number; l: string; s: string }) {
  return (
    <div className="card p-4">
      <p className="font-display text-3xl font-semibold tabular-nums">{n}</p>
      <p className="mt-0.5 text-sm font-semibold">{l}</p>
      <p className="text-xs text-muted">{s}</p>
    </div>
  );
}

// ------------------------------------------------------------------ Sourates
type SF = 'done' | 'progress' | 'maintain' | 'reinforce';
function SurahsTab() {
  const today = useToday();
  const verses = useWird((s) => s.verses);
  const [f, setF] = useState<SF>('progress');
  const stats = useMemo(() => allSurahStats(verses, today).filter((s) => s.state !== 'none'), [verses, today]);
  const groups: Record<SF, typeof stats> = {
    done: stats.filter((s) => s.state === 'complete'),
    progress: stats.filter((s) => s.state !== 'complete'),
    maintain: stats.filter((s) => s.needsMaintenance),
    reinforce: stats.filter((s) => s.needsReinforcement),
  };
  const opts: { value: SF; label: string }[] = [
    { value: 'progress', label: `En cours (${groups.progress.length})` },
    { value: 'done', label: `Terminées (${groups.done.length})` },
    { value: 'maintain', label: `À entretenir (${groups.maintain.length})` },
    { value: 'reinforce', label: `Renforcement (${groups.reinforce.length})` },
  ];
  if (!stats.length) return <Empty title="Aucune sourate suivie">Ajoutez une sourate depuis Mon Wird › Mes sourates pour suivre sa progression.</Empty>;
  return (
    <div>
      <Segmented<SF> scroll value={f} onChange={setF} options={opts} />
      <ul className="card mt-4 divide-y divide-line/60 overflow-hidden">
        {groups[f].map((s) => <SurahRow key={s.surah} st={s} />)}
        {!groups[f].length && <li className="p-8 text-center text-sm text-muted">Aucune sourate dans cette catégorie.</li>}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Hizb
function HizbTab() {
  const verses = useWird((s) => s.verses);
  const stats = useMemo(() => allHizbStats(verses), [verses]);
  const [sel, setSel] = useState<number | null>(null);
  const any = stats.some((h) => h.memorized > 0);
  const detail = sel ? stats[sel - 1] : null;
  const range = sel ? hizbRange(sel) : null;
  const surahsIn = useMemo(() => {
    if (!range) return [];
    const a = fromAyahId(range[0]).surah;
    const b = fromAyahId(range[1]).surah;
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }, [range]);
  return (
    <div>
      <p className="mb-3 text-sm leading-relaxed text-muted">{any ? 'Un hizb est « couvert » lorsque tous ses versets sont dans votre mémorisation.' : 'Aucune donnée pour le moment : les hizb se colorent à mesure que vous ajoutez des versets mémorisés.'}</p>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
        {stats.map((h) => (
          <button key={h.hizb} onClick={() => setSel(h.hizb)} aria-label={`Hizb ${h.hizb}, ${Math.round(h.ratio * 100)} %`} className={cx('relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl border text-sm font-bold tabular-nums transition active:scale-95', h.complete ? 'border-good/40 bg-good-soft text-good' : h.memorized ? 'border-line bg-surface text-ink' : 'border-line/60 bg-surface2/50 text-muted')}>
            {h.memorized > 0 && !h.complete && <span className="absolute inset-x-0 bottom-0 bg-good/25" style={{ height: `${h.ratio * 100}%` }} />}
            <span className="relative">{h.hizb}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-good-soft ring-1 ring-good/40" />Couvert</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-good/25" />Partiel</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-surface2" />Non commencé</span>
      </div>
      <Sheet open={!!detail} onClose={() => setSel(null)} title={detail ? `Hizb ${detail.hizb}` : ''}>
        {detail && range && (
          <div>
            <p className="text-sm text-muted">
              De {rangeStart(range[0])} à {rangeStart(range[1])}
            </p>
            <div className="mt-4 flex items-center gap-4">
              <Ring value={detail.ratio} size={64}>{Math.round(detail.ratio * 100)}%</Ring>
              <p className="text-sm">{detail.complete ? 'Hizb entièrement couvert.' : detail.memorized ? 'Hizb partiellement couvert.' : 'Pas encore de verset suivi dans ce hizb.'}</p>
            </div>
            <p className="label mb-2 mt-5">Sourates concernées</p>
            <ul className="flex flex-wrap gap-1.5">
              {surahsIn.map((s) => <li key={s} className="rounded-full bg-surface2 px-3 py-1.5 text-sm">{s}. {surahMeta(s).tr}</li>)}
            </ul>
            <ProgressBar value={detail.ratio} tone="good" className="mt-5" />
          </div>
        )}
      </Sheet>
    </div>
  );
}

function rangeStart(id: number): string {
  const { surah, ayah } = fromAyahId(id);
  return rangeLabel(surah, ayah, ayah).replace(' — verset', ', verset');
}
