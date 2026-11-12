import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ring, ProgressBar, Screen, Sheet, cx } from '@/components/ui';
import { ENGINE, GRADE_LABEL } from '@/engine/config';
import { addDays, diffDays, endOfMonth, parseKey, startOfMonth, startOfWeek } from '@/engine/dates';
import { dueReinforcement } from '@/engine/plan';
import { activeDaySet, activeDaysIn, allHizbStats, allSurahStats, currentStreak, memorizedPages, overall } from '@/engine/progress';
import { ayahId, fromAyahId, formatDuration, hizbRange, rangeLabel, surahMeta } from '@/engine/quran';
import { periodReport } from '@/engine/reports';
import { groupRuns } from '@/engine/rotation';
import type { Grade, HistoryEntry, ProgressPoint, SessionSummary, VerseState } from '@/engine/types';
import { formatDateShort, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';
import { Goals, History } from './ProgressMore';

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
  const { verses, history, progressLog, summaries } = useWird();
  const [range, setRange] = useState<Range>(30);

  const o = useMemo(() => overall(verses, today), [verses, today]);
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  const pagesMem = useMemo(() => memorizedPages(verses), [verses]);
  const days = useMemo(() => activeDaySet(history), [history]);
  const inProgress = stats.filter((s) => s.state === 'partial' || s.state === 'learning').length;
  const reinforceSurahs = stats.filter((s) => s.needsReinforcement).length;
  const learningVerses = o.learningVerses;

  return (
    <Screen title="Ma progression">
      <p className="-mt-1 text-sm text-muted">Basée uniquement sur ce que vous avez réellement enregistré.</p>

      {/* ---------- Vue d'ensemble ---------- */}
      <H2>Vue d’ensemble</H2>
      <div className="card grid grid-cols-2 gap-x-4 gap-y-5 p-4">
        <Big n={o.surahsWorked} l="sourates commencées" />
        <Big n={o.surahsComplete} l="entièrement apprises" />
        <Big n={inProgress} l="en cours" />
        <Big n={reinforceSurahs} l="à renforcer" />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <Tile n={o.memorizedVerses === 0 ? '0' : `≈ ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Math.round(pagesMem * 10) / 10)}`} l="pages mémorisées" />
        <Tile n={String(learningVerses)} l="versets en apprentissage" />
        <Tile n={String(o.fragileVerses)} l="versets à renforcer" />
      </div>
      <p className="mt-2 text-xs text-muted">{o.hizbCovered} hizb couverts sur 60 · {o.ratio === 0 ? '0' : o.ratio < 0.01 ? '<1' : Math.round(o.ratio * 100)} % du Coran</p>

      {/* ---------- Évolution ---------- */}
      <H2>Évolution</H2>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Période">
        {RANGES.map((r) => (
          <button key={r.v} role="tab" aria-selected={range === r.v} onClick={() => setRange(r.v)} className="chip">{r.l}</button>
        ))}
      </div>
      <Evolution range={range} today={today} history={history} progressLog={progressLog} summaries={summaries} days={days} />

      {/* ---------- Versets à renforcer ---------- */}
      <H2>Mes versets à renforcer</H2>
      <Reinforce verses={verses} history={history} progressLog={progressLog} today={today} />

      {/* ---------- Objectif et régularité ---------- */}
      <H2>Objectif et régularité</H2>
      <WeekGoal today={today} days={days} summaries={summaries} />

      {/* ---------- Bilan ---------- */}
      <Bilan today={today} history={history} progressLog={progressLog} summaries={summaries} />

      {/* ---------- Historique ---------- */}
      <H2>Historique</H2>
      <History />

      {/* ---------- Suivi des hizb ---------- */}
      <H2>Suivi des hizb</H2>
      <HizbSection />

      {/* ---------- Objectifs personnels ---------- */}
      <H2>Mes objectifs</H2>
      <Goals />

      <Link to="/wird/sourates" className="btn-soft mt-8 w-full">Voir le tableau des 114 sourates</Link>
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
function Tile({ n, l }: { n: string; l: string }) {
  return (
    <div className="rounded-[14px] bg-surface2 px-2 py-2.5 text-center">
      <p className="font-display text-[22px] font-semibold leading-tight">{n}</p>
      <p className="text-xs leading-snug text-muted">{l}</p>
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
            <p className="mt-0.5 text-sm text-muted">{rep.memorizedDelta !== null && rep.memorizedDelta !== 0 ? `${rep.memorizedDelta > 0 ? '+' : ''}${rep.memorizedDelta} versets sur la période.` : 'Évolution de votre mémorisation suivie.'}</p>
            <Line points={pts.map((p) => p.memorized)} />
          </>
        ) : (
          <p className="mt-0.5 text-sm leading-snug text-muted">Le suivi démarre à vos prochaines séances : la courbe se dessinera avec vos vraies données.</p>
        )}
      </div>

      <div className="card p-4">
        <Title>Séances par {range === 7 ? 'jour' : 'semaine'}</Title>
        <p className="mt-0.5 text-sm text-muted">{totalSessions} jour{totalSessions > 1 ? 's' : ''} de travail sur la période</p>
        <Bars values={sessions} left={labelL} right={labelR} unit={unit} />
      </div>

      <div className="card p-4">
        <Title>Temps consacré</Title>
        <p className="mt-0.5 text-sm text-muted">{totalMs >= 60_000 ? formatDuration(totalMs) : '0 min'} sur la période (temps actif mesuré)</p>
        <Bars values={timeMs} left={labelL} right={labelR} unit={unit} />
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
      {target ? <ProgressBar value={active / target} className="mt-3" /> : <p className="mt-1 text-xs text-muted">Aucun objectif chiffré : vous pouvez en définir un dans « Mes objectifs » (facultatif).</p>}
      <p className="mt-3 text-sm leading-snug text-muted">{wkSummaries.length} séance{wkSummaries.length > 1 ? 's' : ''} · temps moyen par séance : {avg} min · {streak > 1 ? `${streak} jours de suite · ` : ''}vous avancez à votre rythme</p>
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
          <div><p className="font-display text-[30px] font-semibold leading-none">{r.memorizedDelta === null ? '—' : `${r.memorizedDelta > 0 ? '+' : ''}${r.memorizedDelta}`}</p><p className="mt-1.5 text-[15px] leading-snug text-muted">versets ajoutés au suivi</p></div>
          <Big n={r.items} l="révisions réalisées" />
          <div><p className="font-display text-[30px] font-semibold leading-none">{ms >= 60_000 ? Math.round(ms / 60000) : 0}<span className="ml-1 text-sm">min</span></p><p className="mt-1.5 text-[15px] leading-snug text-muted">temps total</p></div>
        </div>
        <p className="mt-4 text-sm leading-snug"><b>Sourates travaillées :</b> <span className="text-muted">{r.surahs.length ? r.surahs.slice(0, 6).map((s) => surahMeta(s.surah).tr).join(', ') : 'aucune pour l’instant'}</span></p>
        <p className="mt-1.5 text-sm leading-snug"><b>Points forts :</b> <span className="text-muted">{r.byGrade.mastered > 0 ? `${r.byGrade.mastered} verset${r.byGrade.mastered > 1 ? 's' : ''} maîtrisé${r.byGrade.mastered > 1 ? 's' : ''}` : 'ils apparaîtront avec vos séances'}</span></p>
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
      <p className="mb-3 text-sm leading-relaxed text-muted">{any ? 'Un hizb est « couvert » lorsque tous ses versets sont dans votre mémorisation.' : 'Aucune donnée pour le moment : les hizb se colorent à mesure que vous ajoutez des versets mémorisés.'}</p>
      <div className="grid grid-cols-5 gap-2.5">
        {stats.map((h) => (
          <button key={h.hizb} onClick={() => setSel(h.hizb)} aria-label={`Hizb ${h.hizb}, ${Math.round(h.ratio * 100)} %`} className={cx('relative flex aspect-square min-h-[44px] flex-col items-center justify-center overflow-hidden rounded-xl text-[15px] font-semibold tabular-nums transition active:scale-95', h.complete ? 'bg-good text-white' : h.memorized ? 'border-2 border-line bg-surface text-ink' : 'bg-neutral text-neutral-ink')}>
            {h.memorized > 0 && !h.complete && <span className="absolute inset-x-0 bottom-0 bg-good/30" style={{ height: `${h.ratio * 100}%` }} />}
            <span className="relative">{h.hizb}</span>
          </button>
        ))}
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
