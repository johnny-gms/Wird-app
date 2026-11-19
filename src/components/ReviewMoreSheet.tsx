import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, toast } from '@/components/ui';
import { VerseRangePicker } from '@/components/VerseRangePicker';
import { SURAHS, fromAyahId } from '@/engine/quran';
import { haptic } from '@/lib/haptics';
import { useWird } from '@/store/useWird';

/**
 * Réviser en plus, quand on veut : on choisit exactement la sourate, puis la sourate entière ou des versets précis.
 * Seuls les versets déjà appris sont retenus (un passage seulement « déclaré » est accepté : il entre dans le suivi dès qu'il est évalué).
 */
export function ReviewMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const verses = useWird((s) => s.verses);
  const start = useWird((s) => s.startReviewRange);
  const [surah, setSurah] = useState<number | null>(null);
  const [partial, setPartial] = useState(false);
  const [range, setRange] = useState<[number, number]>([1, 1]);
  const [q, setQ] = useState('');

  const known = useMemo(() => {
    const count: Record<number, number> = {};
    for (const k in verses) {
      if (verses[k].status !== 'memorized') continue;
      const sid = fromAyahId(Number(k)).surah;
      count[sid] = (count[sid] ?? 0) + 1;
    }
    return SURAHS.filter((s) => count[s.id]).map((s) => ({ ...s, learned: count[s.id] }));
  }, [verses]);
  const list = known.filter((s) => !q.trim() || `${s.id} ${s.tr}`.toLowerCase().includes(q.trim().toLowerCase()));
  const meta = surah ? SURAHS[surah - 1] : null;

  const close = () => { setSurah(null); setPartial(false); setQ(''); onClose(); };
  const go = (from: number, to: number) => {
    if (!surah) return;
    haptic('tap');
    if (start(surah, from, to)) { close(); nav('/session'); }
    else toast('Aucun verset appris dans cette plage.');
  };
  const pick = (id: number) => { haptic('tap'); setSurah(id); setPartial(false); setRange([1, Math.min(SURAHS[id - 1].n, 10)]); };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={meta ? `${meta.id}. ${meta.tr}` : 'Réviser en plus'}
      footer={meta && partial ? <button className="btn-primary w-full" onClick={() => go(range[0], range[1])}>Réviser {range[0] === range[1] ? `le verset ${range[0]}` : `les versets ${range[0]} à ${range[1]}`}</button> : undefined}
    >
      {!meta ? (
        <>
          <p className="mb-3 text-[15px] leading-relaxed text-muted">Choisis la sourate que tu veux réviser, puis la sourate entière ou seulement certains versets.</p>
          {known.length === 0 ? (
            <p className="rounded-2xl bg-surface2 p-4 text-sm text-muted">Tu n’as pas encore de sourate apprise. Ajoute-en depuis Mon Wird.</p>
          ) : (
            <>
              <input className="input mb-2" placeholder="Rechercher une sourate" aria-label="Rechercher une sourate" value={q} onChange={(e) => setQ(e.target.value)} />
              <ul className="space-y-1.5">
                {list.map((s) => (
                  <li key={s.id}>
                    <button className="card flex w-full items-center gap-3 p-3 text-left" onClick={() => pick(s.id)}>
                      <span className="num-tile" aria-hidden>{String(s.id).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1"><b className="block truncate">{s.tr}</b><span className="text-[13px] text-muted">{s.learned} / {s.n} versets appris</span></span>
                      <ChevronRight size={18} className="text-muted" />
                    </button>
                  </li>
                ))}
                {list.length === 0 && <li className="p-3 text-sm text-muted">Aucune sourate apprise ne correspond.</li>}
              </ul>
            </>
          )}
        </>
      ) : !partial ? (
        <div className="grid gap-2.5">
          <button className="btn-primary" onClick={() => go(1, meta.n)}>Sourate entière ({meta.n} versets)</button>
          <button className="btn-soft" onClick={() => setPartial(true)}>Choisir des versets</button>
          <button className="mt-1 text-sm font-semibold text-muted underline underline-offset-2" onClick={() => setSurah(null)}>Choisir une autre sourate</button>
        </div>
      ) : (
        <>
          <VerseRangePicker surah={meta.id} n={meta.n} from={range[0]} to={range[1]} onChange={(f, t) => setRange([f, t])} verses={verses} />
          <button className="mt-3 text-sm font-semibold text-muted underline underline-offset-2" onClick={() => setPartial(false)}>Retour</button>
        </>
      )}
    </Sheet>
  );
}
