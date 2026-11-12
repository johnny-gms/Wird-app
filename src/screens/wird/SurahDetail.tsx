import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { RangePicker } from '@/components/RangePicker';
import { ConfirmSheet, GradeChip, KindBadge, ProgressBar, SubPage, cx, toast } from '@/components/ui';
import { ENGINE } from '@/engine/config';
import { diffDays } from '@/engine/dates';
import { dueReinforcement } from '@/engine/plan';
import { surahStats } from '@/engine/progress';
import { ayahId, fromAyahId, rangeLabel, surahMeta, SURAHS } from '@/engine/quran';
import { groupRuns } from '@/engine/rotation';
import { formatDateShort, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';
import { stateLabel } from './WirdTab';

export default function SurahDetail() {
  const { id } = useParams();
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > SURAHS.length) return <Navigate to="/wird/sourates" replace />;
  return <Detail surah={n} />;
}

function Detail({ surah }: { surah: number }) {
  const nav = useNavigate();
  const today = useToday();
  const { verses, history, addMemorized, removeVerses, addGoal, addAdhoc, startSession } = useWird();
  const meta = surahMeta(surah);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.min(meta.n, 1));
  const [confirmRemove, setConfirmRemove] = useState(false);
  const st = useMemo(() => surahStats(verses, surah, today), [verses, surah, today]);
  const lab = stateLabel(st);

  const { fragileRuns, dueRuns, worked } = useMemo(() => {
    const fragile: number[] = [];
    const due = new Set<number>(dueReinforcement(verses, today).filter((v) => fromAyahId(v.id).surah === surah).map((v) => v.id));
    let workedCount = 0;
    for (let a = 1; a <= meta.n; a++) {
      const v = verses[ayahId(surah, a)];
      if (!v) continue;
      if (v.status === 'memorized') {
        if (v.fragile) fragile.push(v.id);
        if (diffDays(v.lastReviewedAt ?? v.addedAt, today) > ENGINE.maintainAfterDays) due.add(v.id);
      }
      if (v.reviews > 0) workedCount++;
    }
    return { fragileRuns: groupRuns(fragile, 50), dueRuns: groupRuns([...due], 50), worked: workedCount };
  }, [verses, surah, today, meta.n]);

  const entries = useMemo(() => history.filter((h) => h.surah === surah).slice(-30).reverse(), [history, surah]);
  const selMemorizedAll = useMemo(() => {
    for (let a = from; a <= to; a++) if (verses[ayahId(surah, a)]?.status !== 'memorized') return false;
    return true;
  }, [verses, surah, from, to]);
  const selHasMemorized = useMemo(() => {
    for (let a = from; a <= to; a++) if (verses[ayahId(surah, a)]?.status === 'memorized') return true;
    return false;
  }, [verses, surah, from, to]);
  const selTracked = useMemo(() => {
    for (let a = from; a <= to; a++) if (verses[ayahId(surah, a)]) return true;
    return false;
  }, [verses, surah, from, to]);

  return (
    <SubPage
      title={meta.tr}
      back="/wird/sourates"
      sub={
        <span className="flex items-baseline justify-between gap-3">
          <span>Sourate {meta.id} · {meta.fr} · {meta.n} versets · {meta.t === 'M' ? 'mecquoise' : 'médinoise'}</span>
          <span className="ar text-3xl leading-none text-gold" lang="ar">{meta.ar}</span>
        </span>
      }
    >
      <section className="card p-5" aria-label="Progression de la sourate">
        <div className="flex items-center justify-between">
          <h2 className="label">Progression</h2>
          {lab.label && <span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', lab.cls)}>{lab.label}</span>}
        </div>
        {st.memorized + st.learning === 0 ? (
          <p className="mt-2 text-sm text-muted">Aucun verset suivi pour l’instant. Sélectionnez une plage ci-dessous.</p>
        ) : (
          <>
            <ProgressBar value={st.memorized / st.total} tone="good" className="mt-3" />
            <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
              <Mini n={st.memorized} l="mémorisés" />
              <Mini n={st.learning} l="en apprentissage" />
              <Mini n={st.fragile} l="fragiles" />
              <Mini n={worked} l="déjà travaillés" />
            </dl>
          </>
        )}
      </section>

      <section className="card mt-3 p-5" aria-label="Choisir des versets">
        <h2 className="label mb-3">Choisir des versets</h2>
        <RangePicker n={meta.n} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} verses={verses} surah={surah} />
        <p className="mt-4 text-[15px] font-semibold">{rangeLabel(surah, from, to)}</p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {!selMemorizedAll && (
            <button className="btn-primary" onClick={() => { addMemorized(surah, from, to); toast('Ajouté à votre rotation de révision'); }}>
              <Check size={18} /> Déjà mémorisé — ajouter à la rotation
            </button>
          )}
          {!selMemorizedAll && (
            <button className="btn-soft" onClick={() => { addGoal(surah, from, to); toast('Apprentissage ajouté'); nav('/wird/apprentissage'); }}>
              <Plus size={18} /> Apprendre ces versets
            </button>
          )}
          {selHasMemorized && (
            <button
              className="btn-outline"
              onClick={() => {
                // Réviser maintenant : uniquement les versets mémorisés contigus de la sélection
                let a = from;
                while (a <= to && verses[ayahId(surah, a)]?.status !== 'memorized') a++;
                let b = a;
                while (b < to && verses[ayahId(surah, b + 1)]?.status === 'memorized') b++;
                const itemId = addAdhoc(surah, a, b);
                if (itemId && startSession(itemId)) nav('/session');
              }}
            >
              <RotateCcw size={18} /> Réviser maintenant
            </button>
          )}
          {selTracked && (
            <button className="btn-ghost text-alert" onClick={() => setConfirmRemove(true)}>
              <Trash2 size={16} /> Retirer ces versets du suivi
            </button>
          )}
        </div>
      </section>

      {fragileRuns.length > 0 && (
        <Block title="Versets fragiles" hint="Proposés en renforcement jusqu’à stabilisation.">
          {fragileRuns.map((r) => <RunRow key={r.ids[0]} r={r} tone="text-warn" />)}
        </Block>
      )}
      {dueRuns.length > 0 && (
        <Block title="Versets à réviser" hint="Renforcement dû, ou non revus depuis plus d’un mois.">
          {dueRuns.map((r) => <RunRow key={r.ids[0]} r={r} tone="text-hard" />)}
        </Block>
      )}

      <section className="mt-6">
        <h2 className="label mb-2">Historique de travail</h2>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Aucun travail enregistré sur cette sourate.</p>
        ) : (
          <ul className="card divide-y divide-line/60">
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
      </section>

      <ConfirmSheet
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Retirer du suivi ?"
        message={`${rangeLabel(surah, from, to)} ne sera plus dans votre rotation ni dans vos statistiques. L’historique déjà enregistré est conservé.`}
        confirmLabel="Retirer"
        danger
        onConfirm={() => { removeVerses(surah, from, to); toast('Versets retirés'); }}
      />
    </SubPage>
  );
}

function Mini({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <dd className="font-display text-xl font-semibold tabular-nums">{n}</dd>
      <dt className="text-[11px] leading-tight text-muted">{l}</dt>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="label">{title}</h2>
      <p className="mb-2 mt-0.5 text-xs text-muted">{hint}</p>
      <ul className="card divide-y divide-line/60">{children}</ul>
    </section>
  );
}

function RunRow({ r, tone }: { r: { surah: number; from: number; to: number }; tone: string }) {
  return <li className={cx('px-4 py-3 text-[14px] font-semibold', tone)}>{rangeLabel(r.surah, r.from, r.to)}</li>;
}
