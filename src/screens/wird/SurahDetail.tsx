import { BookOpen, Check, ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { VersePicker } from '@/components/VersePicker';
import { VerseSheet, KIND_BG } from '@/components/VerseSheet';
import { GradeChip, KindBadge, ProgressBar, Sheet, SubPage, cx, toast } from '@/components/ui';
import { ENGINE } from '@/engine/config';
import { diffDays } from '@/engine/dates';
import { dueReinforcement } from '@/engine/plan';
import { KIND_NAME, surahStats, verseKind } from '@/engine/progress';
import { ayahId, fromAyahId, rangeLabel, surahMeta, SURAHS } from '@/engine/quran';
import { groupRuns } from '@/engine/rotation';
import { haptic } from '@/lib/haptics';
import { formatDateShort, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';

export default function SurahDetail() {
  const { id } = useParams();
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > SURAHS.length) return <Navigate to="/wird" replace />;
  return <Detail key={n} surah={n} />;
}

/** Séries contiguës d'un ensemble de numéros de versets. */
function runsOf(sel: Set<number>): [number, number][] {
  const a = [...sel].sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (const v of a) {
    const l = out[out.length - 1];
    if (l && l[1] === v - 1) l[1] = v;
    else out.push([v, v]);
  }
  return out;
}

function Detail({ surah }: { surah: number }) {
  const nav = useNavigate();
  const today = useToday();
  const { verses, history, goals, addMemorized, removeVerses, addGoal, addAdhoc, startSession, restoreTrash, applyKnownSurahs } = useWird();
  const meta = surahMeta(surah);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [verse, setVerse] = useState<number | null>(null);
  const st = useMemo(() => surahStats(verses, surah, today), [verses, surah, today]);

  const { fragileRuns, dueRuns } = useMemo(() => {
    const fragile: number[] = [];
    const due = new Set<number>(dueReinforcement(verses, today).filter((v) => fromAyahId(v.id).surah === surah).map((v) => v.id));
    for (let a = 1; a <= meta.n; a++) {
      const v = verses[ayahId(surah, a)];
      if (v?.status === 'memorized') {
        if (v.fragile) fragile.push(v.id);
        if (diffDays(v.lastReviewedAt ?? v.addedAt, today) > ENGINE.maintainAfterDays) due.add(v.id);
      }
    }
    return { fragileRuns: groupRuns(fragile, 50), dueRuns: groupRuns([...due], 50) };
  }, [verses, surah, today, meta.n]);
  const entries = useMemo(() => history.filter((h) => h.surah === surah).slice(-20).reverse(), [history, surah]);

  const runs = runsOf(sel);
  const hasMemorizedSel = runs.some(([f, t]) => Array.from({ length: t - f + 1 }, (_, i) => verses[ayahId(surah, f + i)]?.status === 'memorized').some(Boolean));
  const activeGoal = goals.find((g) => g.surah === surah && !g.completedAt);
  const complete = st.state === 'complete';

  const close = () => {
    setPicking(false);
    setSel(new Set());
    setSelecting(false);
  };

  return (
    <SubPage title={`${meta.id}. ${meta.tr}`} back={-1} sub={<span className="flex items-baseline justify-between gap-3"><span>{meta.n} versets · {Math.round((st.memorized / st.total) * 100)} % appris</span><span className="ar text-[26px] leading-none text-ink" lang="ar">{meta.ar}</span></span>}>
      <SurahNav surah={surah} />

      <section className="card mt-3 p-4" aria-label="Progression de la sourate">
        <div className="flex items-center justify-between gap-3">
          <p className="label">Progression</p>
          <span className={cx('rounded-full px-3 py-1 text-[13px] font-semibold', complete ? 'bg-good-soft text-good' : st.learning || st.memorized ? 'bg-blue-soft text-blue' : 'bg-surface2 text-muted')}>{complete ? 'Apprise' : st.learning || st.memorized ? 'En cours' : 'Non commencée'}</span>
        </div>
        <div className="mt-3"><ProgressBar value={st.total ? st.memorized / st.total : 0} /></div>
        <dl className="mt-4 grid grid-cols-4 gap-1 text-center">
          <Stat n={st.memorized + st.learning} l="suivis" />
          <Stat n={st.memorized} l="appris" />
          <Stat n={st.learning} l="en apprentissage" />
          <Stat n={st.fragile} l="à renforcer" />
        </dl>
      </section>
      {complete && <div className="card mt-3 p-4"><b>Sourate apprise ✓</b><p className="text-sm text-muted">Tous les versets sont appris. Continue à la réviser régulièrement.</p></div>}

      <Link to={`/coran?m=list&s=${surah}`} className="btn-soft mt-3 w-full"><BookOpen size={18} /> Ouvrir le Coran numérique</Link>

      <div className="card mt-3 p-4">
        <b>Que souhaites-tu faire ?</b>
        <div className="mt-3 grid gap-2">
          <button className="btn-primary" onClick={() => setPicking(true)}>Sélectionner des versets</button>
          <div className="grid grid-cols-2 gap-2">
            {!activeGoal && !complete ? <button className="btn-soft !min-h-[40px] text-sm" onClick={() => { addGoal(surah, 1, meta.n); toast('Apprentissage ajouté'); nav('/revisions'); }}>Apprendre cette sourate</button> : <span />}
            {!complete ? <button className="btn-soft !min-h-[40px] text-sm" onClick={() => { applyKnownSurahs([...new Set([...SURAHS.filter((x) => surahStats(verses, x.id, today).state === 'complete').map((x) => x.id), surah])]); toast('Sourate marquée comme déjà apprise'); }}>Je la connais déjà</button> : null}
          </div>
        </div>
      </div>

      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="label">Versets</h2>
        <button className="chip chip-sm" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); if (selecting) setSel(new Set()); haptic('select'); }}>{selecting ? 'Terminer la sélection' : 'Sélectionner'}</button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: meta.n }, (_, i) => {
          const v = verses[ayahId(surah, i + 1)];
          const k = verseKind(v);
          const on = sel.has(i + 1);
          return (
            <button
              key={i}
              onClick={() => {
                haptic('tap');
                if (selecting) setSel((p) => { const n = new Set(p); n.has(i + 1) ? n.delete(i + 1) : n.add(i + 1); return n; });
                else setVerse(i + 1);
              }}
              className={cx('relative flex aspect-square items-center justify-center rounded-lg text-[14px] font-semibold tabular-nums transition active:scale-95', KIND_BG[k], selecting && on && 'ring-[3px] ring-ink')}
              aria-label={`Verset ${i + 1} : ${KIND_NAME[k]}`}
              aria-pressed={selecting ? on : undefined}
            >
              {i + 1}
              {k === 'r' && <i className="absolute right-1 top-1 h-2 w-2 rounded-full bg-good ring-1 ring-white" title="Déjà appris" />}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Gris : non suivi · bleu : en apprentissage · vert : appris · ambre (point vert) : appris, à renforcer.</p>
      {selecting && (
        <div className="pb-safe fixed inset-x-0 bottom-[68px] z-20 mx-auto flex max-w-[520px] items-center justify-between gap-3 rounded-t-2xl border border-line bg-surface px-4 py-3 shadow-card">
          <span className="text-sm"><b>{sel.size}</b> verset{sel.size > 1 ? 's' : ''} sélectionné{sel.size > 1 ? 's' : ''}</span>
          <button className="btn-primary !min-h-[40px] text-sm" disabled={!sel.size} onClick={() => setPicking(true)}>Choisir une action</button>
        </div>
      )}

      {fragileRuns.length > 0 && <Block title="Versets à renforcer" runs={fragileRuns} surah={surah} />}
      {dueRuns.length > 0 && <Block title="Versets à revoir" runs={dueRuns} surah={surah} />}

      <h2 className="label mb-2 mt-6">Historique de travail</h2>
      {entries.length === 0 ? (
        <p className="card p-5 text-center text-sm text-muted">Aucun travail enregistré sur cette sourate.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {entries.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{rangeLabel(h.surah, h.from, h.to)}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">{formatDateShort(h.date)} <KindBadge kind={h.kind} /></p>
              </div>
              <GradeChip grade={h.grade} />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={picking} onClose={close} title={`${meta.tr} · sélectionner des versets`}>
        <VersePicker surah={surah} selected={sel} onChange={setSel} verses={verses} />
        <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-bg px-4 pb-1 pt-2.5">
          <p className="mb-2 text-[13px]"><b>{sel.size}</b> verset{sel.size > 1 ? 's' : ''} sélectionné{sel.size > 1 ? 's' : ''}{runs.length ? ` · ${runs.map(([f, t]) => (f === t ? f : `${f}–${t}`)).join(', ')}` : ''}</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary !min-h-[44px] text-sm" disabled={!sel.size} onClick={() => { runs.forEach(([f, t]) => addMemorized(surah, f, t)); haptic('success'); toast('Marqué comme déjà appris'); close(); }}><Check size={16} /> Déjà appris</button>
            <button className="btn-soft !min-h-[44px] text-sm" disabled={!sel.size} onClick={() => { runs.forEach(([f, t]) => addGoal(surah, f, t)); haptic('success'); toast('Apprentissage ajouté'); close(); nav('/revisions'); }}><Plus size={16} /> À apprendre</button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <button className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-muted disabled:opacity-35" disabled={!hasMemorizedSel} onClick={() => {
              const ids = runs.flatMap(([f, t]) => {
                let a = f;
                const out: string[] = [];
                while (a <= t) {
                  while (a <= t && verses[ayahId(surah, a)]?.status !== 'memorized') a++;
                  let b = a;
                  while (b < t && verses[ayahId(surah, b + 1)]?.status === 'memorized') b++;
                  if (a <= t) { const id = addAdhoc(surah, a, b); if (id) out.push(id); }
                  a = b + 1;
                }
                return out;
              });
              close();
              if (ids.length && startSession(ids)) nav('/session');
            }}><RotateCcw size={16} /> Réviser maintenant</button>
            <button className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-alert disabled:opacity-35" disabled={!sel.size} onClick={() => {
              const before = useWird.getState().trash.length;
              runs.forEach(([f, t]) => removeVerses(surah, f, t));
              const created = useWird.getState().trash.slice(before).map((t) => t.id);
              haptic('warning');
              toast('Retiré du suivi', { label: 'Annuler', onClick: () => created.forEach((id) => restoreTrash(id)) });
              close();
            }}><Trash2 size={16} /> Retirer</button>
          </div>
        </div>
      </Sheet>
      <div className="mt-8"><SurahNav surah={surah} /></div>
      {verse && <VerseSheet surah={surah} ayah={verse} onClose={() => setVerse(null)} />}
    </SubPage>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <dd className="text-[22px] font-extrabold leading-tight tabular-nums">{n}</dd>
      <dt className="text-[12px] leading-snug text-muted">{l}</dt>
    </div>
  );
}

function Block({ title, runs, surah }: { title: string; runs: { from: number; to: number }[]; surah: number }) {
  return (
    <section className="mt-6">
      <h2 className="label mb-2">{title}</h2>
      <ul className="card divide-y divide-line">
        {runs.map((r) => (
          <li key={r.from}>
            <Link to={`/coran?m=list&s=${surah}&h=${surah}:${r.from}-${r.to}`} className="block px-4 py-3 text-[14px] font-semibold">{rangeLabel(surah, r.from, r.to)}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}


/** Passer à la sourate précédente ou suivante sans repasser par la liste (le retour ramène toujours à la liste). */
function SurahNav({ surah }: { surah: number }) {
  const nav = useNavigate();
  const prev = surah > 1 ? surahMeta(surah - 1) : null;
  const next = surah < SURAHS.length ? surahMeta(surah + 1) : null;
  const go = (n: number) => { haptic('tap'); nav(`/wird/${n}`, { replace: true }); };
  const btn = 'flex min-h-[48px] items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-left transition active:scale-[.98] disabled:opacity-35';
  return (
    <nav aria-label="Changer de sourate" className="grid grid-cols-2 gap-2">
      <button className={btn} disabled={!prev} onClick={() => prev && go(prev.id)} aria-label={prev ? `Sourate précédente : ${prev.tr}` : 'Pas de sourate précédente'}>
        <ChevronLeft size={18} className="shrink-0 text-accent" />
        <span className="min-w-0"><small className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Précédente</small><b className="block truncate text-[14px]">{prev ? `${prev.id}. ${prev.tr}` : '—'}</b></span>
      </button>
      <button className={cx(btn, 'justify-end text-right')} disabled={!next} onClick={() => next && go(next.id)} aria-label={next ? `Sourate suivante : ${next.tr}` : 'Pas de sourate suivante'}>
        <span className="min-w-0"><small className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Suivante</small><b className="block truncate text-[14px]">{next ? `${next.id}. ${next.tr}` : '—'}</b></span>
        <ChevronRight size={18} className="shrink-0 text-accent" />
      </button>
    </nav>
  );
}
