import { useNavigate } from 'react-router-dom';
import { Sheet, toast } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useWird } from '@/store/useWird';

const CHOICES: { pages: number; label: string; hint: string }[] = [
  { pages: 1, label: '1 page', hint: 'Un petit passage' },
  { pages: 2, label: '2 pages', hint: 'Environ 10 minutes' },
  { pages: 5, label: '5 pages', hint: 'Une vraie séance' },
  { pages: 10, label: '1 Hizb', hint: '≈ 10 pages' },
];

/** Réviser en plus, quand on veut : on choisit la quantité, WIRD propose les prochaines pages de la rotation (même si le programme du jour est terminé). */
export function ReviewMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const start = useWird((s) => s.startReviewAhead);
  const go = (pages: number) => {
    haptic('tap');
    if (start(pages)) {
      onClose();
      nav('/session');
    } else {
      onClose();
      toast('Tu as déjà révisé tout ce que tu connais aujourd’hui.');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Réviser en plus">
      <p className="mb-4 text-[15px] leading-relaxed text-muted">Combien veux-tu réviser ? WIRD reprend la suite de ta rotation : ce que tu révises ici compte pour ta semaine, et demain on continue après.</p>
      <div className="grid grid-cols-2 gap-2.5">
        {CHOICES.map((c) => (
          <button key={c.pages} className="card p-4 text-left transition active:scale-[.98]" onClick={() => go(c.pages)}>
            <b className="block text-[17px]">{c.label}</b>
            <span className="text-[13px] text-muted">{c.hint}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
