import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { ConfirmSheet, SubPage, toast } from '@/components/ui';
import { trashDaysLeft } from '@/engine/trash';
import { haptic } from '@/lib/haptics';
import { formatDateShort, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';

/** Corbeille : retraits du suivi, apprentissages et objectifs supprimés, restaurables pendant 30 jours. */
export default function Trash() {
  const today = useToday();
  const { trash, restoreTrash, deleteTrashItem } = useWird();
  const [del, setDel] = useState<string | null>(null);
  const items = [...trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return (
    <SubPage title="Corbeille" back="/profil">
      <p className="-mt-1 mb-3 text-sm leading-relaxed text-muted">Ce que tu retires du suivi reste ici <b>30 jours</b>, puis disparaît définitivement. Tu peux le restaurer à tout moment pendant ce délai.</p>
      {items.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">La corbeille est vide.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((t) => (
            <li key={t.id} className="card p-4">
              <b className="block">{t.label}</b>
              <p className="text-sm text-muted">Retiré le {formatDateShort(t.deletedAt.slice(0, 10))} · {trashDaysLeft(t, today)} jour{trashDaysLeft(t, today) > 1 ? 's' : ''} restant{trashDaysLeft(t, today) > 1 ? 's' : ''}{t.kind === 'verses' || t.kind === 'goal' ? ` · ${t.verses.length} verset${t.verses.length > 1 ? 's' : ''}` : ''}</p>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary !min-h-[40px] flex-1 text-sm" onClick={() => { restoreTrash(t.id); haptic('success'); toast('Restauré'); }}><RotateCcw size={16} /> Restaurer</button>
                <button className="btn-ghost !min-h-[40px] text-sm text-alert" onClick={() => setDel(t.id)}>Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmSheet open={!!del} onClose={() => setDel(null)} title="Supprimer définitivement ?" message="Cet élément ne pourra plus être restauré." confirmLabel="Supprimer" danger onConfirm={() => del && deleteTrashItem(del)} />
    </SubPage>
  );
}
