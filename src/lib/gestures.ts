import { useEffect } from 'react';
import { haptic } from './haptics';

/**
 * Retour par glissement depuis le bord gauche : on pose le doigt à moins de 24 px du bord, on glisse vers la droite
 * (> 70 px, plutôt horizontal) puis on relâche. Désactivé pendant que des feuilles/saisies sont ouvertes.
 */
export function useEdgeSwipeBack(onBack: (() => void) | null, enabled = true): void {
  useEffect(() => {
    if (!enabled || !onBack) return;
    // Évènements « touch » (et non « pointer ») : le navigateur annule les évènements pointer dès qu'il prend le geste
    // pour un défilement, alors que touchstart / touchmove / touchend restent livrés (iOS compris).
    let start: { x: number; y: number; t: number } | null = null;
    let last = { x: 0, y: 0 };
    let bar: HTMLDivElement | null = null;
    const ensureBar = () => {
      if (bar) return bar;
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:0;top:50%;width:6px;height:90px;margin-top:-45px;border-radius:0 6px 6px 0;background:rgb(var(--primary));opacity:0;z-index:70;transition:opacity .15s,width .15s;pointer-events:none';
      document.body.appendChild(bar);
      return bar;
    };
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t || t.clientX > 24) return;
      if (document.querySelector('[role="dialog"]')) return;
      start = { x: t.clientX, y: t.clientY, t: performance.now() };
      last = { x: t.clientX, y: t.clientY };
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      last = { x: t.clientX, y: t.clientY };
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      const b = ensureBar();
      b.style.opacity = dx > 12 && dx > dy ? String(Math.min(0.9, dx / 90)) : '0';
      b.style.width = `${6 + Math.min(14, dx / 6)}px`;
    };
    const up = () => {
      if (!start) return;
      const dx = last.x - start.x;
      const dy = Math.abs(last.y - start.y);
      const fast = performance.now() - start.t < 700;
      start = null;
      if (bar) bar.style.opacity = '0';
      if (dx > 70 && dx > dy * 1.5 && fast) {
        haptic('tap');
        onBack();
      }
    };
    const cancel = () => {
      start = null;
      if (bar) bar.style.opacity = '0';
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', up, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', cancel);
      bar?.remove();
      bar = null;
    };
  }, [onBack, enabled]);
}
