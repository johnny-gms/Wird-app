import { BookOpen, Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { VersePicker } from '@/components/VersePicker';
import { VerseSheet, KIND_BG } from '@/components/VerseSheet';
import { GradeChip, KindBadge, Sheet, SubPage, cx, toast } from '@/components/ui';
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
  return <Detail surah={n} />;
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
  };

  return (
    <SubPage title={`${meta.id}. ${meta.tr}`} back={-1} sub={<span className="flex items-baseline justify-between gap-3"><span>{meta.n} versets · {Math.round((st.memorized / st.total) * 100)} % appris</span><span className="ar text-[26px] leading-none text-ink" lang="ar">{meta.ar}</span></span>}>
      <div className="grid grid-cols-3 gap-2.5">
        <Tile n={st.memorized + st.learning} l="suivis" />
        <Tile n={st.memorized} l="appris" />
        <Tile n={st.learning} l="en apprentissage" />
      </div>
      <p className="mt-2 text-sm text-muted">{st.fragile} à renforcer.</p>
      {complete && <div className="card mt-3 p-4"><b>Sourate apprise ✓</b><p className="text-sm text-muted">Tous les versets sont appris. Continue à la réviser régulièrement.</p></div>}

      <Link to={`/coran?m=list&s=${surah}`} className="btn-soft mt-3 w-full"><BookOpen size={18} /> Ouvrir le Coran numérique</Link>

      <div className="card mt-3 p-4">
        <b>Que veux-tu faire ?</b>
        <p className="mb-2 text-sm text-muted">Sélectionne des versets (par groupes de 5, par plage ou un par un), puis choisis : <b>déjà appris</b>, <b>à apprendre</b>, <b>réviser maintenant</b> ou <b>retirer</b>.</p>
        <div className="grid gap-2">
          <button className="btn-primary" onClick={() => setPicking(true)}>Sélectionner des versets</button>
          {!activeGoal && !complete && <button className="btn-soft" onClick={() => { addGoal(surah, 1, meta.n); toast('Apprentissage ajouté'); nav('/revisions'); }}>Apprendre cette sourate en ce moment</button>}
          {!complete ? <button className="btn-soft" onClick={() => { applyKnownSurahs([...new Set([...SURAHS.filter((x) => surahStats(verses, x.id, today).state === 'complete').map((x) => x.id), surah])]); toast('Sourate ajoutée à tes révisions'); }}>Je connais déjà cette sourate</button> : null}
        </div>
      </div>

      <h2 className="label mb-2 mt-6">Versets</h2>
      <div className="grid grid-cols-5 gap-2.5">
        {Array.from({ length: meta.n }, (_, i) => {
          const k = verseKind(verses[ayahId(surah, i + 1)]);
          return (
            <button key={i} onClick={() => { haptic('tap'); setVerse(i + 1); }} className={cx('flex aspect-square min-h-[44px] flex-col items-center justify-center rounded-xl text-[15px] font-semibold tabular-nums transition active:scale-95', KIND_BG[k])} aria-label={`Verset ${i + 1} : ${KIND_NAME[k]}`}>
              {i + 1}
              <small className="text-[9px] font-medium opacity-90">{k === 'n' ? '—' : KIND_NAME[k].split(' ')[0].slice(0, 5)}</small>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Gris : non suivi · bleu : en apprentissage · vert : appris · ambre : à renforcer.</p>

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
        <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-bg px-4 pb-1 pt-3">
          <p className="mb-2 text-sm"><b>{sel.size}</b> verset{sel.size > 1 ? 's' : ''} sélectionné{sel.size > 1 ? 's' : ''}{runs.length ? ` · ${runs.map(([f, t]) => (f === t ? f : `${f}–${t}`)).join(', ')}` : ''}</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary !min-h-[44px] text-sm" disabled={!sel.size} onClick={() => { runs.forEach(([f, t]) => addMemorized(surah, f, t)); haptic('success'); toast('Ajouté à ta rotation de révision'); close(); }}><Check size={16} /> Déjà appris</button>
            <button className="btn-soft !min-h-[44px] text-sm" disabled={!sel.size} onClick={() => { runs.forEach(([f, t]) => addGoal(surah, f, t)); haptic('success'); toast('Apprentissage ajouté'); close(); nav('/revisions'); }}><Plus size={16} /> À apprendre</button>
            <button className="btn-soft !min-h-[44px] text-sm" disabled={!hasMemorizedSel} onClick={() => {
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
            <button className="btn-danger !min-h-[44px] text-sm" disabled={!sel.size} onClick={() => {
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
      {verse && <VerseSheet surah={surah} ayah={verse} onClose={() => setVerse(null)} />}
    </SubPage>
  );
}

function Tile({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-[14px] bg-surface2 px-2 py-2.5 text-center">
      <p className="font-display text-[22px] font-semibold leading-tight">{n}</p>
      <p className="text-xs leading-snug text-muted">{l}</p>
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
