import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ring, ProgressBar, Screen, Sheet, cx } from '@/components/ui';
import { ENGINE, GRADE_LABEL } from '@/engine/config';
import { goalProgress, learningSegment, weeklyReviewPages } from '@/engine/plan';
import { rangePages } from '@/engine/pages';
import { addDays, diffDays, endOfMonth, parseKey, startOfMonth, startOfWeek } from '@/engine/dates';
import { dueReinforcement } from '@/engine/plan';
import { activeDaySet, activeDaysIn, allHizbStats, allSurahStats, currentStreak, overall } from '@/engine/progress';
import { ayahId, fromAyahId, formatDuration, hizbRange, rangeLabel, surahMeta } from '@/engine/quran';
import { periodReport } from '@/engine/reports';
import { groupRuns } from '@/engine/rotation';
import type { Grade, HistoryEntry, ProgressPoint, SessionSummary, VerseState } from '@/engine/types';
import { formatDateShort, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';
import { GoalsCompact, History } from './ProgressMore';
import { SurahGrid } from '../wird/SurahGrid';

type Range = 7 | 30 | 90 | 0; // 0 = tout
const RANGES: { v: Range; l: string }[] = [
  { v: 7, l: '7 jours' },
  { v: 30, l: '30 jours' },
  { v: 90, l: '90 jours' },
  { v: 0, l: 'Tout' },
];

const H2 = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <h2 className="label mb-2.5 mt-[30px] flex items-baseline justify-between">
    <span>{children}</span>
    {right}
  </h2>
);

/**
 * Tableau de progression — même structure que l'app de référence :
 * vue d'ensemble, évolution (7/30/90 jours/tout), versets à renforcer, objectif et régularité, bilan, historique.
 * Tout est calculé à partir des données réellement enregistrées.
 */
export default function ProgressPage() {
  const today = useToday();
  const { verses, history, progressLog, summaries, personalGoals } = useWird();
  const [range, setRange] = useState<Range>(30);

  const o = useMemo(() => overall(verses, today), [verses, today]);
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  const days = useMemo(() => activeDaySet(history), [history]);
  const inProgress = stats.filter((s) => s.state === 'partial' || s.state === 'learning').length;
  const reinforceSurahs = stats.filter((s) => s.needsReinforcement).length;
  const streakNow = currentStreak(days, today);

  return (
    <Screen title="Ma progression">
      <p className="-mt-1 text-sm text-muted">Basée uniquement sur ce que tu as réellement enregistré.</p>

      {/* ---------- Versets mémorisés ---------- */}
      <div className="kpi mt-4">
        <p className="text-[13px] font-semibold opacity-70">Sourates mémorisées</p>
        <div className="flex items-center justify-between gap-3">
          <p className="mt-1 text-[38px] font-extrabold leading-none tracking-[-1px] tabular-nums">{o.surahsComplete}<span className="ml-1.5 text-[18px] font-bold opacity-70">/ 114</span></p>
          {streakNow > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[12.5px] font-bold text-[#CFE3D3]">🔥 {streakNow} jour{streakNow > 1 ? 's' : ''}</span>}
        </div>
        <p className="mt-1 text-[13px] opacity-70">{inProgress} en cours · {reinforceSurahs} à renforcer · {o.ratio === 0 ? '0' : o.ratio < 0.01 ? '<1' : Math.round(o.ratio * 100)} % du Coran</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"><i className="block h-full rounded-full bg-[#A9C4AE] transition-[width] duration-700" style={{ width: `${Math.max((o.surahsComplete / 114) * 100, 2)}%` }} /></div>
      </div>

      {/* ---------- Les 114 sourates ---------- */}
      <H2>Mes 114 sourates</H2>
      <SurahGrid />

      {/* ---------- Ta semaine, ta solidité, ton prochain jalon ---------- */}
      <H2>Ce qui compte pour toi</H2>
      <Insights today={today} />

      {/* ---------- Évolution ---------- */}
      <H2>Évolution</H2>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Période">
        {RANGES.map((r) => (
          <button key={r.v} role="tab" aria-selected={range === r.v} onClick={() => setRange(r.v)} className="chip">{r.l}</button>
        ))}
      </div>
      <Evolution range={range} today={today} history={history} progressLog={progressLog} summaries={summaries} days={days} />

      {/* ---------- Bilan ---------- */}
      <Bilan today={today} history={history} progressLog={progressLog} summaries={summaries} />

      {/* ---------- Versets à renforcer ---------- */}
      <H2>Mes versets à renforcer</H2>
      <Reinforce verses={verses} history={history} progressLog={progressLog} today={today} />

      {/* ---------- Historique ---------- */}
      <H2>Historique</H2>
      <History />

      {/* ---------- Suivi des hizb ---------- */}
      <H2>Suivi des hizb</H2>
      <HizbSection />

      {/* ---------- Objectif et régularité : uniquement une fois un objectif inscrit ---------- */}
      {personalGoals.length > 0 && (
        <>
          <H2>Objectif et régularité</H2>
          <WeekGoal today={today} days={days} summaries={summaries} />
        </>
      )}

      {/* ---------- Objectifs personnels ---------- */}
      <H2>Mes objectifs</H2>
      <GoalsCompact />
    </Screen>
  );
}

function Big({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <p className="font-display text-[30px] font-semibold leading-none">{n}</p>
      <p className="mt-1.5 text-[15px] leading-snug text-muted">{l}</p>
    </div>
  );
}
const Title = ({ children }: { children: React.ReactNode }) => <p className="text-base font-bold">{children}</p>;

// ------------------------------------------------------------------ Évolution
function weekBuckets(from: string, today: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let s = startOfWeek(from);
  while (s <= today) {
    out.push({ start: s, end: addDays(s, 6) });
    s = addDays(s, 7);
  }
  return out;
}

function Evolution({ range, today, history, progressLog, summaries, days }: { range: Range; today: string; history: HistoryEntry[]; progressLog: ProgressPoint[]; summaries: SessionSummary[]; days: Set<string> }) {
  const first = history.length ? history.reduce((m, h) => (h.date < m ? h.date : m), today) : today;
  const from = range === 0 ? first : addDays(today, -(range - 1));
  // 7 jours : barres quotidiennes ; sinon : barres hebdomadaires (26 semaines au plus)
  const buckets = useMemo(() => {
    if (range === 7) return Array.from({ length: 7 }, (_, i) => ({ start: addDays(today, i - 6), end: addDays(today, i - 6) }));
    return weekBuckets(from, today).slice(-26);
  }, [range, from, today]);
  const sessions = buckets.map((b) => activeDaysIn(days, b.start, b.end));
  const timeMs = buckets.map((b) => summaries.filter((s) => s.date >= b.start && s.date <= b.end).reduce((a, s) => a + s.activeMs, 0));
  const totalSessions = sessions.reduce((a, n) => a + n, 0);
  const totalMs = timeMs.reduce((a, n) => a + n, 0);
  const rep = useMemo(() => periodReport(history, progressLog, from, today), [history, progressLog, from, today]);
  const unit = range === 7 ? 'jour' : 'sem.';
  const labelL = formatDateShort(buckets[0]?.start ?? today).replace(/^\w+\.? /, '');
  const labelR = range === 7 ? 'aujourd’hui' : 'sem. en cours';

  // courbe : points du journal de progression dans la période (+ dernier point avant)
  const pts = useMemo(() => {
    const before = [...progressLog].filter((p) => p.date < from).pop();
    const inR = progressLog.filter((p) => p.date >= from);
    const all = [...(before ? [before] : []), ...inR];
    return all.length && all[all.length - 1].date !== today ? [...all, { date: today, memorized: all[all.length - 1].memorized }] : all;
  }, [progressLog, from, today]);
  const varies = new Set(pts.map((p) => p.memorized)).size > 1;

  return (
    <div className="space-y-3">
      <div className="card mt-3 p-4">
        <Title>Progression mémorisée</Title>
        {varies ? (
          <>
            <p className="mt-0.5 text-sm text-muted">Évolution de ta mémorisation sur la période.</p>
            <Line points={pts.map((p) => p.memorized)} />
          </>
        ) : (
          <p className="mt-0.5 text-sm leading-snug text-muted">Le suivi démarre à tes prochaines séances : la courbe se dessinera avec tes vraies données.</p>
        )}
      </div>

      <div className="card p-4">
        <Title>Séances par {range === 7 ? 'jour' : 'semaine'}</Title>
        <p className="mt-0.5 text-sm text-muted">{totalSessions} jour{totalSessions > 1 ? 's' : ''} de travail sur la période</p>
        {totalSessions > 0 ? <Bars values={sessions} left={labelL} right={labelR} unit={unit} /> : <p className="mt-1 text-xs text-muted">Pas encore de données sur cette période.</p>}
      </div>

      <div className="card p-4">
        <Title>Temps consacré</Title>
        <p className="mt-0.5 text-sm text-muted">{totalMs >= 60_000 ? formatDuration(totalMs) : '0 min'} sur la période (temps actif mesuré)</p>
        {totalMs >= 60_000 ? <Bars values={timeMs} left={labelL} right={labelR} unit={unit} /> : <p className="mt-1 text-xs text-muted">Pas encore de données sur cette période.</p>}
      </div>

      <div className="card p-4">
        <Title>Évaluations</Title>
        <Grades r={rep.byGrade} total={rep.verses} />
      </div>

      <Regularity today={today} days={days} />
    </div>
  );
}

function Line({ points }: { points: number[] }) {
  const W = 300;
  const H = 80;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const xy = points.map((p, i) => [(i / Math.max(1, points.length - 1)) * W, H - 8 - ((p - min) / Math.max(1, max - min)) * (H - 16)] as const);
  const line = xy.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Évolution de la mémorisation">
      <polygon points={`0,${H} ${line} ${W},${H}`} className="fill-primary/10" />
      <polyline points={line} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-primary" />
    </svg>
  );
}

function Bars({ values, left, right, unit }: { values: number[]; left: string; right: string; unit: string }) {
  const max = Math.max(1, ...values);
  return (
    <>
      <div className="mt-3 flex h-[70px] items-end gap-[3px]" role="img" aria-label={`Valeurs par ${unit}`}>
        {values.map((v, i) => (
          <i key={i} className={cx('block min-h-[3px] flex-1 rounded-t-[3px]', i === values.length - 1 ? 'bg-primary' : 'bg-sage')} style={{ height: `${Math.max(4, (v / max) * 100)}%`, opacity: v ? 1 : 0.55 }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted"><span>{left}</span><span>{right}</span></div>
    </>
  );
}

const GR: Grade[] = ['mastered', 'hesitant', 'difficult', 'failed'];
const GR_BG: Record<Grade, string> = { mastered: 'bg-good', hesitant: 'bg-warn', difficult: 'bg-hard', failed: 'bg-alert' };
function Grades({ r, total }: { r: Record<Grade, number>; total: number }) {
  if (!total) return <p className="mt-0.5 text-sm text-muted">Aucune évaluation sur cette période.</p>;
  return (
    <>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface2">
        {GR.map((g) => r[g] > 0 && <div key={g} className={GR_BG[g]} style={{ width: `${(r[g] / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {GR.map((g) => (
          <li key={g} className="flex items-center gap-2"><i className={cx('h-[11px] w-[11px] rounded-[3px]', GR_BG[g])} /><span className="text-muted">{GRADE_LABEL[g]}</span><b className="ml-auto tabular-nums">{r[g]}</b></li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Versets évalués sur la période.</p>
    </>
  );
}

function Regularity({ today, days }: { today: string; days: Set<string> }) {
  const dots = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const a7 = activeDaysIn(days, addDays(today, -6), today);
  const a30 = activeDaysIn(days, addDays(today, -29), today);
  return (
    <div className="card p-4">
      <Title>Régularité</Title>
      <div className="mt-3 grid grid-cols-[repeat(15,1fr)] gap-1.5" role="img" aria-label={`${a30} jours actifs sur 30`}>
        {dots.map((d) => (
          <i key={d} className={cx('block aspect-square rounded-[5px]', days.has(d) ? 'bg-primary' : 'bg-surface2', d === today && 'ring-2 ring-primary/40')} title={d} />
        ))}
      </div>
      <p className="mt-3 text-sm leading-snug text-muted">{a7} jour{a7 > 1 ? 's' : ''} actif{a7 > 1 ? 's' : ''} sur 7 · {a30} sur 30. Chaque reprise compte, sans pression.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Versets à renforcer
type Run = { surah: number; from: number; to: number; ids: number[] };
function RunList({ runs, empty }: { runs: Run[]; empty: string }) {
  if (!runs.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-1">
      {runs.slice(0, 6).map((r) => (
        <li key={`${r.surah}-${r.from}`}>
          <Link to={`/wird/sourates/${r.surah}`} className="text-sm"><b>{surahMeta(r.surah).tr}</b> <span className="text-muted">· {rangeLabel(r.surah, r.from, r.to).replace(/^Sourate \d+ — /, '')}</span></Link>
        </li>
      ))}
      {runs.length > 6 && <li className="text-xs text-muted">et {runs.length - 6} autre{runs.length - 6 > 1 ? 's' : ''}…</li>}
    </ul>
  );
}

function Reinforce({ verses, history, progressLog, today }: { verses: Record<number, VerseState>; history: HistoryEntry[]; progressLog: ProgressPoint[]; today: string }) {
  const data = useMemo(() => {
    const hard: number[] = [];
    const late = new Set<number>(dueReinforcement(verses, addDays(today, -1)).map((v) => v.id));
    const perSurah = new Map<number, number>();
    for (const k in verses) {
      const v = verses[k];
      if (v.status !== 'memorized') continue;
      if (v.lastGrade === 'difficult' || v.lastGrade === 'failed') hard.push(v.id);
      if (diffDays(v.lastReviewedAt ?? v.addedAt, today) > ENGINE.maintainAfterDays) late.add(v.id);
      if (v.fragile || v.lastGrade === 'difficult' || v.lastGrade === 'failed') {
        const s = fromAyahId(v.id).surah;
        perSurah.set(s, (perSurah.get(s) ?? 0) + 1);
      }
    }
    const rec = periodReport(history, progressLog, '0000-01-01', today).difficulties;
    const recIds = new Set<number>();
    rec.forEach((d) => { for (let a = d.from; a <= d.to; a++) recIds.add(ayahId(d.surah, a)); });
    return {
      hard: groupRuns(hard, 50),
      hardN: hard.length,
      rec: groupRuns([...recIds], 50),
      recN: recIds.size,
      late: groupRuns([...late], 50),
      lateN: late.size,
      top: [...perSurah.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    };
  }, [verses, history, progressLog, today]);
  return (
    <div className="space-y-4">
      <div><p className="mb-1 text-[15px] font-bold">Évalués Difficile ou Non maîtrisé <span className="font-normal text-muted">({data.hardN})</span></p><RunList runs={data.hard} empty="Rien ici pour l’instant." /></div>
      <div><p className="mb-1 text-[15px] font-bold">Qui échouent régulièrement <span className="font-normal text-muted">({data.recN})</span></p><RunList runs={data.rec} empty="Aucun verset récurrent." /></div>
      <div><p className="mb-1 text-[15px] font-bold">En retard <span className="font-normal text-muted">({data.lateN})</span></p><RunList runs={data.late} empty="Aucun retard." /></div>
      <div>
        <p className="mb-1 text-[15px] font-bold">Sourates qui demandent le plus de travail</p>
        {data.top.length ? (
          <ul className="space-y-1">{data.top.map(([s, n]) => <li key={s} className="text-sm"><Link to={`/wird/sourates/${s}`}><b>{surahMeta(s).tr}</b> <span className="text-muted">· {n} verset{n > 1 ? 's' : ''}</span></Link></li>)}</ul>
        ) : <p className="text-sm text-muted">—</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Objectif de la semaine
function WeekGoal({ today, days, summaries }: { today: string; days: Set<string>; summaries: SessionSummary[] }) {
  const personalGoals = useWird((s) => s.personalGoals);
  const wk = startOfWeek(today);
  const active = activeDaysIn(days, wk, addDays(wk, 6));
  const target = personalGoals.find((g) => g.type === 'regularity' && g.daysPerWeek && !g.achievedAt)?.daysPerWeek;
  const wkSummaries = summaries.filter((s) => s.date >= wk && s.date <= addDays(wk, 6));
  const ms = wkSummaries.reduce((a, s) => a + s.activeMs, 0);
  const avg = wkSummaries.length ? Math.round(ms / wkSummaries.length / 60000) : 0;
  const streak = currentStreak(days, today);
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between"><Title>Cette semaine</Title><span className="text-sm text-muted tabular-nums">{target ? `${active} / ${target} jours` : `${active} jour${active > 1 ? 's' : ''} actif${active > 1 ? 's' : ''}`}</span></div>
      {target ? <ProgressBar value={active / target} className="mt-3" /> : <p className="mt-1 text-xs text-muted">Aucun objectif chiffré : tu peux en définir un dans « Mes objectifs » (facultatif).</p>}
      <p className="mt-3 text-sm leading-snug text-muted">{wkSummaries.length} séance{wkSummaries.length > 1 ? 's' : ''} · temps moyen par séance : {avg} min · {streak > 1 ? `${streak} jours de suite · ` : ''}tu avances à ton rythme</p>
    </div>
  );
}

// ------------------------------------------------------------------ Bilan (semaine / mois)
function Bilan({ today, history, progressLog, summaries }: { today: string; history: HistoryEntry[]; progressLog: ProgressPoint[]; summaries: SessionSummary[] }) {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [offset, setOffset] = useState(0);
  const { from, to, label } = useMemo(() => {
    if (mode === 'week') {
      const f = addDays(startOfWeek(today), offset * 7);
      return { from: f, to: addDays(f, 6), label: offset === 0 ? 'Bilan de la semaine' : `Semaine du ${formatDateShort(f)}` };
    }
    const d = parseKey(today);
    const m = new Date(d.getFullYear(), d.getMonth() + offset, 1, 12);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
    return { from: startOfMonth(key), to: endOfMonth(key), label: offset === 0 ? 'Bilan du mois' : new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(m) };
  }, [mode, offset, today]);
  const r = useMemo(() => periodReport(history, progressLog, from, to), [history, progressLog, from, to]);
  const ms = summaries.filter((s) => s.date >= from && s.date <= to).reduce((a, s) => a + s.activeMs, 0);
  return (
    <>
      <H2 right={
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <button className="chip !min-h-[30px] !px-3" aria-pressed={mode === 'week'} onClick={() => { setMode('week'); setOffset(0); }}>Semaine</button>
          <button className="chip !min-h-[30px] !px-3" aria-pressed={mode === 'month'} onClick={() => { setMode('month'); setOffset(0); }}>Mois</button>
        </span>
      }>{label.startsWith('Bilan') ? label.replace('Bilan de la', 'Bilan de la').toUpperCase() : label}</H2>
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between text-sm text-muted">
          <button onClick={() => setOffset(offset - 1)} aria-label="Période précédente" className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface2"><ChevronLeft size={18} /></button>
          <span className="text-xs">{formatDateShort(from)} → {formatDateShort(to)}</span>
          <button onClick={() => setOffset(offset + 1)} disabled={offset >= 0} aria-label="Période suivante" className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface2 disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Big n={r.verses} l="versets travaillés" />
          <Big n={r.surahs.length} l="sourates travaillées" />
          <Big n={r.items} l="révisions réalisées" />
          <div><p className="font-display text-[30px] font-semibold leading-none">{ms >= 60_000 ? Math.round(ms / 60000) : 0}<span className="ml-1 text-sm">min</span></p><p className="mt-1.5 text-[15px] leading-snug text-muted">temps total</p></div>
        </div>
        <p className="mt-4 text-sm leading-snug"><b>Sourates travaillées :</b> <span className="text-muted">{r.surahs.length ? r.surahs.slice(0, 6).map((s) => surahMeta(s.surah).tr).join(', ') : 'aucune pour l’instant'}</span></p>
        <p className="mt-1.5 text-sm leading-snug"><b>Points forts :</b> <span className="text-muted">{r.byGrade.mastered > 0 ? `${r.byGrade.mastered} verset${r.byGrade.mastered > 1 ? 's' : ''} maîtrisé${r.byGrade.mastered > 1 ? 's' : ''}` : 'ils apparaîtront avec tes séances'}</span></p>
        <p className="mt-1.5 text-sm leading-snug"><b>Difficultés récurrentes :</b> <span className="text-muted">{r.difficulties.length ? r.difficulties.slice(0, 3).map((d) => `${surahMeta(d.surah).tr} ${d.from === d.to ? d.from : `${d.from}–${d.to}`}`).join(' · ') : 'aucune sur cette période'}</span></p>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Hizb
function HizbSection() {
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
      <p className="mb-3 text-sm leading-relaxed text-muted">{any ? 'Un hizb est « couvert » lorsque tous ses versets sont dans ta mémorisation.' : 'Aucune donnée pour le moment : les hizb se colorent à mesure que tu ajoutes des versets appris.'}</p>
      <div className="card p-4"><div className="grid grid-cols-[repeat(30,1fr)] gap-[3px]" role="group" aria-label="60 Hizb">
        {stats.map((h) => (
          <button key={h.hizb} onClick={() => setSel(h.hizb)} aria-label={`Hizb ${h.hizb}, ${Math.round(h.ratio * 100)} %`} title={`Hizb ${h.hizb}`} className={cx('aspect-square rounded-[4px] transition active:scale-90', h.complete ? 'bg-good' : h.memorized ? 'bg-good/40' : 'bg-surface2')} />
        ))}
      </div>
      <p className="mt-3 text-sm"><b>{stats.filter((h) => h.complete).length}</b> <span className="text-muted">Hizb couverts sur 60 · {stats.filter((h) => h.memorized && !h.complete).length} partiels</span></p>
      </div>
      <div className="mt-4 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="h-[11px] w-[11px] rounded-[3px] bg-good" />Couvert</span>
        <span className="flex items-center gap-1.5"><i className="h-[11px] w-[11px] rounded-[3px] bg-good/30" />Partiel</span>
        <span className="flex items-center gap-1.5"><i className="h-[11px] w-[11px] rounded-[3px] bg-neutral" />Non commencé</span>
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


// ------------------------------------------------------------------ Ce qui compte pour toi
const DAY_L = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const fmt1 = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Math.round(n * 10) / 10);

/**
 * Trois repères qui aident vraiment :
 *  - la semaine en cours : ce qui est fait par rapport au rythme choisi, et les jours travaillés ;
 *  - la solidité : comment se sont passées les révisions des 30 derniers jours ;
 *  - le prochain jalon : ce qu'il reste pour finir la sourate en cours, et le temps estimé à ton rythme.
 */
function Insights({ today }: { today: string }) {
  const { history, settings, goals, verses } = useWird();
  const days = useMemo(() => activeDaySet(history), [history]);
  const wk = startOfWeek(today);
  const week = history.filter((h) => h.date >= wk && h.date <= today);
  const learnPages = week.filter((h) => h.kind === 'learn').reduce((a, h) => a + rangePages(h.surah, h.from, h.to), 0);
  const learnVerses = week.filter((h) => h.kind === 'learn').reduce((a, h) => a + h.to - h.from + 1, 0);
  const reviewPages = week.filter((h) => h.kind === 'review').reduce((a, h) => a + rangePages(h.surah, h.from, h.to), 0);
  const lw = settings.learnWeekly;
  const learnDone = lw?.unit === 'verses' ? learnVerses : learnPages;
  const reviewTarget = weeklyReviewPages(settings);
  const streak = currentStreak(days, today);

  // solidité des révisions (30 jours)
  const since = addDays(today, -29);
  const recent = history.filter((h) => (h.kind === 'review' || h.kind === 'reinforce') && h.date >= since);
  const counts: Record<Grade, number> = { mastered: 0, hesitant: 0, difficult: 0, failed: 0 };
  for (const h of recent) counts[h.grade] += h.to - h.from + 1;
  const total = counts.mastered + counts.hesitant + counts.difficult + counts.failed;
  const masteredPct = total ? Math.round((counts.mastered / total) * 100) : 0;
  const fragileNow = useMemo(() => Object.values(verses).filter((v) => v.status === 'memorized' && v.fragile).length, [verses]);
  const SEG: { g: Grade; cls: string }[] = [{ g: 'mastered', cls: 'bg-good' }, { g: 'hesitant', cls: 'bg-warn' }, { g: 'difficult', cls: 'bg-hard' }, { g: 'failed', cls: 'bg-alert' }];

  // prochain jalon
  const goal = goals.find((g) => !g.completedAt && !g.paused && learningSegment({ verses }, g));
  const gp = goal ? goalProgress(goal) : null;
  const weeklyPages = lw ? (lw.unit === 'pages' ? lw.amount : 0) : 0;
  const remainingPages = goal ? rangePages(goal.surah, Math.max(goal.cursor, goal.from), goal.to) : 0;
  const remainingVerses = gp ? gp.total - gp.done : 0;
  const etaWeeks = goal && lw ? Math.max(1, Math.ceil(lw.unit === 'pages' ? remainingPages / Math.max(0.25, weeklyPages) : remainingVerses / Math.max(1, lw.amount))) : null;

  return (
    <div className="space-y-3">
      <section className="card p-4" aria-label="Ta semaine">
        <div className="flex items-baseline justify-between"><Title>Ta semaine</Title><span className="text-xs text-muted">{streak > 0 ? `🔥 ${streak} jour${streak > 1 ? 's' : ''} d’affilée` : 'du lundi à aujourd’hui'}</span></div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {DAY_L.map((d, i) => {
            const k = addDays(wk, i);
            const on = days.has(k);
            return (
              <div key={i} className="text-center">
                <small className="block text-[11.5px] font-semibold text-muted">{d}</small>
                <i className={cx('mx-auto mt-1 grid h-9 w-9 place-items-center rounded-full text-[13px] font-bold not-italic', on ? 'bg-accent text-primary-ink' : 'bg-surface2 text-muted/60', k === today && 'ring-2 ring-accent/60 ring-offset-2 ring-offset-surface')}>{on ? '✓' : ''}</i>
              </div>
            );
          })}
        </div>
        <div className="mt-4 space-y-3.5">
          <Bar label="Apprentissage" value={learnDone} target={lw ? lw.amount : 0} text={lw ? `${fmt1(learnDone)} / ${fmt1(lw.amount)} ${lw.unit === 'verses' ? 'versets' : 'pages'}` : `${fmt1(learnPages)} page${learnPages > 1 ? 's' : ''}`} />
          <Bar label="Révision" value={reviewPages} target={reviewTarget} text={`${fmt1(reviewPages)} / ${fmt1(reviewTarget)} pages`} />
        </div>
      </section>

      <section className="card p-4" aria-label="Solidité de tes révisions">
        <div className="flex items-baseline justify-between"><Title>Solidité de tes révisions</Title><span className="text-xs text-muted">30 derniers jours</span></div>
        {total === 0 ? (
          <p className="mt-2 text-sm text-muted">Dès tes premières révisions, tu verras ici comment elles se passent.</p>
        ) : (
          <>
            <p className="mt-2 text-[34px] font-extrabold leading-none tracking-[-0.8px] tabular-nums">{masteredPct}<span className="text-[18px] text-muted"> %</span></p>
            <p className="mt-1 text-[13.5px] text-muted">de tes versets révisés étaient bien maîtrisés.</p>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface2" role="img" aria-label={`Maîtrisés ${masteredPct} %`}>
              {SEG.map(({ g, cls }) => (counts[g] ? <i key={g} className={cx('block h-full', cls)} style={{ width: `${(counts[g] / total) * 100}%` }} /> : null))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
              {SEG.map(({ g, cls }) => <li key={g} className="flex items-center gap-2"><i className={cx('h-2.5 w-2.5 rounded-full', cls)} /><span className="flex-1 truncate text-muted">{GRADE_LABEL[g]}</span><b className="tabular-nums">{counts[g]}</b></li>)}
            </ul>
          </>
        )}
        {fragileNow > 0 && <p className="mt-3 rounded-2xl bg-hard-soft px-3.5 py-2.5 text-[13px] text-hard">{fragileNow} verset{fragileNow > 1 ? 's' : ''} à renforcer : {fragileNow > 1 ? 'ils reviennent' : 'il revient'} dans ton programme, au bon moment.</p>}
      </section>

      {goal && gp && (
        <section className="card p-4" aria-label="Prochain jalon">
          <Title>Prochain jalon</Title>
          <p className="mt-2 text-[16px] leading-snug">Plus que <b className="tabular-nums">{remainingVerses}</b> verset{remainingVerses > 1 ? 's' : ''} pour finir <b>{surahMeta(goal.surah).tr}</b>.</p>
          <div className="mt-3"><ProgressBar value={gp.total ? gp.done / gp.total : 0} /></div>
          <p className="mt-2 text-[13px] text-muted">{gp.done} / {gp.total} versets appris{etaWeeks ? ` · ≈ ${etaWeeks} semaine${etaWeeks > 1 ? 's' : ''} à ton rythme` : ''}</p>
        </section>
      )}
    </div>
  );
}

function Bar({ label, value, target, text }: { label: string; value: number; target: number; text: string }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm"><b>{label}</b><span className="text-muted tabular-nums">{text}</span></div>
      <ProgressBar value={target > 0 ? value / target : 0} />
    </div>
  );
}
