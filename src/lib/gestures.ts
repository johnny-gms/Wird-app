import { useEffect } from 'react';
import { haptic } from './haptics';

/**
 * Retour par glissement depuis le bord gauche : on pose le doigt à moins de 24 px du bord, on glisse vers la droite
 * (> 70 px, plutôt horizontal) puis on relâche. Désactivé pendant que des feuilles/saisies sont ouvertes.
 */
export function useEdgeSwipeBack(onBack: (() => void) | null, enabled = true): void {
  useEffect(() => {
    if (!enabled || !onBack) return;
    let start: { x: number; y: number; t: number } | null = null;
    let bar: HTMLDivElement | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.clientX > 24) return;
      if (document.querySelector('[role="dialog"]')) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const ensureBar = () => {
      if (bar) return bar;
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:0;top:50%;width:6px;height:90px;margin-top:-45px;border-radius:0 6px 6px 0;background:rgb(var(--primary));opacity:0;z-index:70;transition:opacity .15s,width .15s;pointer-events:none';
      document.body.appendChild(bar);
      return bar;
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = Math.abs(e.clientY - start.y);
      const b = ensureBar();
      b.style.opacity = dx > 12 && dx > dy ? String(Math.min(0.9, dx / 90)) : '0';
      b.style.width = `${6 + Math.min(14, dx / 6)}px`;
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = Math.abs(e.clientY - start.y);
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
    document.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerup', up, { passive: true });
    document.addEventListener('pointercancel', cancel, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      bar?.remove();
      bar = null;
    };
  }, [onBack, enabled]);
}
