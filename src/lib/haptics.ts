import { useWird } from '@/store/useWird';

/**
 * Retours haptiques discrets, uniquement si l'appareil le permet et si le réglage est activé.
 *  - Android / Chrome : API Vibration.
 *  - iPhone (iOS 17.4+) : un interrupteur natif (<input switch>) déclenche le retour haptique du système.
 *  - Sinon : aucun effet (jamais d'erreur).
 */
export type HapticKind = 'tap' | 'select' | 'success' | 'warning';
const PATTERN: Record<HapticKind, number | number[]> = { tap: 8, select: 12, success: [12, 40, 18], warning: [20, 50, 20] };

let sw: HTMLInputElement | null = null;
function iosTick() {
  try {
    if (!sw) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none';
      sw = document.createElement('input');
      sw.type = 'checkbox';
      sw.setAttribute('switch', '');
      label.appendChild(sw);
      document.body.appendChild(label);
    }
    sw.parentElement?.click();
  } catch {
    /* indisponible */
  }
}

export function haptic(kind: HapticKind = 'tap'): void {
  try {
    if (!useWird.getState().settings.haptics) return;
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERN[kind]);
      return;
    }
    iosTick();
  } catch {
    /* ignore */
  }
}
