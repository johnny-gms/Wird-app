import { useLocation, useNavigate } from 'react-router-dom';
import { haptic } from '@/lib/haptics';

/** Sélecteur de l'onglet « Mémoriser » : Révisions du jour / les 114 sourates (Mon Wird). */
export function MemoSwitch() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const onList = pathname.startsWith('/wird') || pathname === '/coran';
  const go = (to: string) => {
    haptic('tap');
    nav(to, { replace: true });
  };
  return (
    <div className="seg" role="tablist" aria-label="Mémoriser">
      <button role="tab" aria-selected={!onList} onClick={() => go('/revisions')}>Révisions</button>
      <button role="tab" aria-selected={onList} onClick={() => go('/wird')}>Sourates</button>
    </div>
  );
}
