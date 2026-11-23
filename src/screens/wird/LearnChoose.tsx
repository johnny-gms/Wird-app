import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SurahPickerList } from '@/components/SurahPickerList';
import { SubPage, ProgressBar, cx, toast } from '@/components/ui';
import { VerseRangePicker } from '@/components/VerseRangePicker';
import { goalProgress, learningSegment } from '@/engine/plan';
import { ayahId, surahMeta, versesText } from '@/engine/quran';
import { haptic } from '@/lib/haptics';
import { lastMode } from '@/screens/session/Phone';
import { useWird } from '@/store/useWird';

/**
 * « Que veux-tu apprendre ? » : un écran dédié, en deux temps.
 *  1. choisir la sourate (ou reprendre la suite de l'apprentissage en cours) ;
 *  2. choisir les versets d'une plage, puis lancer directement la séance.
 */
export default function LearnChoose() {
  const nav = useNavigate();
  const store = useWird();
  const { verses, goals } = store;
  const [surah, setSurah] = useState<number | null>(null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(5);

  const goal = useMemo(() => goals.find((g) => !g.completedAt && !g.paused && learningSegment({ verses }, g)), [goals, verses]);
  const seg = goal ? learningSegment({ verses }, goal) : null;
  const gp = goal ? goalProgress(goal) : null;

  const pick = (id: number) => {
    const n = surahMeta(id).n;
    // première étape : le premier verset pas encore appris
    let f = 1;
    while (f < n && verses[ayahId(id, f)]?.status === 'memorized') f++;
    setSurah(id);
    setFrom(f);
    setTo(Math.min(n, f + 4));
  };

  const start = () => {
    if (!surah) return;
    haptic('success');
    const open = goals.find((g) => !g.completedAt && g.surah === surah && g.from <= from && g.to >= to);
    const goalId = open?.id ?? store.addGoal(surah, from, to);
    const id = store.addAdhoc(surah, from, to, { kind: 'learn', goalId });
    if (id && store.startSession([id], { mode: lastMode() ?? undefined })) nav('/session', { replace: true });
    else toast('Impossible de lancer cet apprentissage pour le moment');
  };

  const meta = surah ? surahMeta(surah) : null;
  return (
    <SubPage title={meta ? meta.tr : 'Que veux-tu apprendre ?'} back={surah ? -1 : -1} sub={meta ? <span className="flex items-baseline justify-between gap-3"><span>{meta.n} versets</span><span className="ar text-[26px] leading-none text-ink" lang="ar">{meta.ar}</span></span> : 'Choisis la sourate, puis les versets. La séance démarre ensuite.'}>
      {!meta ? (
        <>
          {goal && gp && seg && (
            <button className="card mb-4 w-full p-4 text-left transition active:scale-[.99]" onClick={() => { haptic('tap'); if (store.startLearnAhead(goal.id)) nav('/session', { replace: true }); }}>
              <p className="label">Ton apprentissage en cours</p>
              <p className="mt-1.5 text-[18px] font-bold">{surahMeta(goal.surah).tr} · {seg.from === seg.to ? `verset ${seg.from}` : `versets ${seg.from} à ${Math.min(seg.to, seg.from + 4)}`}</p>
              <div className="mt-2.5"><ProgressBar value={gp.total ? gp.done / gp.total : 0} /></div>
              <p className="mt-1.5 text-[13px] text-muted">{gp.done} / {gp.total} versets appris · <b className="text-accent">Continuer</b></p>
            </button>
          )}
          <p className="label mb-2">Ou choisir une autre sourate</p>
          <SurahPickerList onPick={pick} height="max-h-[60dvh]" />
        </>
      ) : (
        <>
          <VerseRangePicker surah={meta.id} n={meta.n} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} verses={verses} />
          <button className={cx('btn-primary mt-6 w-full')} onClick={start}>Commencer l’apprentissage · {from === 1 && to === meta.n ? 'sourate entière' : versesText(to - from + 1)}</button>
          <button className="mt-2 w-full py-3 text-sm font-semibold text-muted" onClick={() => setSurah(null)}>Changer de sourate</button>
        </>
      )}
    </SubPage>
  );
}
