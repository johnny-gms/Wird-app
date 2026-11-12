import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';

interface PwaState {
  needRefresh: boolean;
  offlineReady: boolean;
  update: () => void;
  dismiss: () => void;
}

export const usePwa = create<PwaState>((set) => ({ needRefresh: false, offlineReady: false, update: () => undefined, dismiss: () => set({ needRefresh: false, offlineReady: false }) }));

export function registerPwa(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const updateSW = registerSW({
    onNeedRefresh: () => usePwa.setState({ needRefresh: true }),
    onOfflineReady: () => usePwa.setState({ offlineReady: true }),
  });
  usePwa.setState({ update: () => void updateSW(true) });
}

/** Application installée sur l'écran d'accueil ? */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Évènement Chrome/Android pour proposer l'installation. */
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export const useInstall = create<{ event: BIPEvent | null }>(() => ({ event: null }));
export function listenInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstall.setState({ event: e as BIPEvent });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ event: null }));
}
