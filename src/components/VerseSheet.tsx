import { useEffect, useState } from 'react';
import { GRADE_LABEL } from '@/engine/config';
import { KIND_NAME, verseKind, type VerseKind } from '@/engine/progress';
import { ayahId, surahMeta } from '@/engine/quran';
import { formatDateShort } from '@/lib/hooks';
import { haptic } from '@/lib/haptics';
import { loadQuranText, type QuranData } from '@/lib/quranText';
import { useWird } from '@/store/useWird';
import { Sheet, cx, toast } from './ui';

export const KIND_BG: Record<VerseKind, string> = { n: 'bg-neutral text-neutral-ink', l: 'bg-blue text-white', m: 'bg-good text-white', r: 'bg-hard text-white' };

/** Fiche d'un verset : texte, état, dernière évaluation, prochain renforcement, et changement de statut à la main. */
export function VerseSheet({ surah, ayah, onClose }: { surah: number; ayah: number; onClose: () => void }) {
  const { verses, removeVerses, addMemorized, addGoal, flagReinforce } = useWird();
  const [data, setData] = useState<QuranData | null>(null);
  useEffect(() => {
    void loadQuranText().then(setData);
  }, []);
  const v = verses[ayahId(surah, ayah)];
  const kind = verseKind(v);
  const set = (k: VerseKind) => {
    haptic('select');
    if (k === 'n') removeVerses(surah, ayah, ayah);
    else if (k === 'm') addMemorized(surah, ayah, ayah);
    else if (k === 'l') addGoal(surah, ayah, ayah);
    else {
      addMemorized(surah, ayah, ayah);
      flagReinforce(surah, ayah, ayah);
    }
    toast(k === 'n' ? 'Retiré du suivi (corbeille 30 jours)' : 'Statut mis à jour');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={`${surahMeta(surah).tr} · verset ${ayah}`}>
      <div className="ar rounded-[14px] border border-line bg-surface p-3 text-[26px] leading-[2.2]" lang="ar">{data ? data.s[surah - 1][ayah - 1] : '…'}</div>
      <p className="mt-3"><span className={cx('rounded-full px-3 py-1 text-xs font-semibold', KIND_BG[kind])}>{KIND_NAME[kind]}</span></p>
      <p className="mt-3 text-sm">Dernière évaluation : <b>{v?.lastGrade ? GRADE_LABEL[v.lastGrade] : '—'}</b></p>
      <p className="mt-1 text-sm text-muted">
        Dernière révision : {v?.lastReviewedAt ? formatDateShort(v.lastReviewedAt) : '—'}
        {v?.fragile && v.reinforceDue ? ` · prochain renforcement : ${formatDateShort(v.reinforceDue)}` : ''} · {v?.reviews ?? 0} évaluation{(v?.reviews ?? 0) > 1 ? 's' : ''}
      </p>
      <p className="mb-2 mt-4 text-sm text-muted">Modifier le statut manuellement :</p>
      <div className="grid grid-cols-2 gap-2">
        {(['m', 'l', 'r', 'n'] as VerseKind[]).map((k) => (
          <button key={k} onClick={() => set(k)} disabled={k === kind || (k === 'r' && kind !== 'm' && kind !== 'r' && false)} className={cx('btn-soft min-h-[44px] text-sm', k === kind && 'opacity-40')}>
            {KIND_NAME[k]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Un verset difficile reste toujours dans la rotation. « Non suivi » le place dans la corbeille pendant 30 jours.</p>
    </Sheet>
  );
}
