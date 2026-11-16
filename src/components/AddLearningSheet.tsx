import { useState } from 'react';
import { rangeLabel, surahMeta } from '@/engine/quran';
import { useWird } from '@/store/useWird';
import { RangePicker } from './RangePicker';
import { SurahPickerList } from './SurahPickerList';
import { Sheet, toast } from './ui';

export function AddLearningSheet({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: number }) {
  const [surah, setSurah] = useState<number | null>(preset ?? null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const { verses, addGoal } = useWird();
  const close = () => {
    setSurah(preset ?? null);
    setFrom(1);
    setTo(1);
    onClose();
  };
  const s = surah ? surahMeta(surah) : null;
  return (
    <Sheet open={open} onClose={close} title={s ? 'Choisir les versets' : 'Ajouter une sourate'}>
      {!s ? (
        <SurahPickerList onPick={(id) => { setSurah(id); setFrom(1); setTo(Math.min(surahMeta(id).n, 5)); }} />
      ) : (
        <div>
          <p className="mb-3 text-sm text-muted">
            <b className="text-ink">{s.tr}</b> — {s.n} versets
            {!preset && (
              <button className="ml-2 font-semibold text-primary" onClick={() => setSurah(null)}>
                Changer
              </button>
            )}
          </p>
          <RangePicker n={s.n} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} verses={verses} surah={s.id} />
          <p className="mt-4 text-sm font-semibold">{rangeLabel(s.id, from, to)}</p>
          <p className="mt-1 text-xs text-muted">Aucune quantité quotidienne n’est imposée : tu avances à ton rythme.</p>
          <button
            className="btn-primary mt-4 w-full"
            onClick={() => {
              addGoal(s.id, from, to);
              toast('Apprentissage ajouté');
              close();
            }}
          >
            Commencer cet apprentissage
          </button>
        </div>
      )}
    </Sheet>
  );
}
