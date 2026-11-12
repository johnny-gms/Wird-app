/**
 * Client Web Push. Rien n'est « activé » sans permission du navigateur ET abonnement réel.
 * Côté serveur (Cloudflare Workers + D1 + Cron) : voir docs/NOTIFICATIONS.md et worker/.
 */
import { API_URL, VAPID_PUBLIC_KEY, enqueue, getPushIdentity, serverConfigured } from '@/sync/outbox';
import { useWird } from '@/store/useWird';
import { isIOS, isStandalone } from '@/lib/pwa';

export type PushStatus =
  | 'unsupported' // navigateur sans Notifications / Push / Service Worker
  | 'needs-install' // iOS : Web Push uniquement depuis l'écran d'accueil
  | 'denied' // refusé dans les réglages du navigateur
  | 'off' // permission pas encore demandée
  | 'granted-local' // autorisé, mais pas d'abonnement serveur (serveur non configuré)
  | 'granted-unsubscribed' // autorisé, serveur configuré, pas encore abonné
  | 'subscribed'; // abonnement Push enregistré

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!pushSupported() && !('Notification' in window)) return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  if (!serverConfigured || !pushSupported()) return 'granted-local';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'subscribed' : 'granted-unsubscribed';
}

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** À appeler uniquement depuis un geste volontaire de l'utilisateur (clic). */
export async function enableNotifications(): Promise<PushStatus> {
  if (!('Notification' in window)) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return getPushStatus();
  if (serverConfigured && pushSupported()) {
    const reg = await navigator.serviceWorker.ready;
    // le Service Worker garde la configuration pour se réabonner seul si le navigateur renouvelle l'abonnement
    reg.active?.postMessage({ type: 'PUSH_CONFIG', api: API_URL, key: VAPID_PUBLIC_KEY });
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
    const { settings } = useWird.getState();
    await enqueue('subscribe', { subscription: sub.toJSON(), prefs: settings.notifications, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }
  return getPushStatus();
}

export async function disableNotifications(): Promise<PushStatus> {
  const reg = await registration();
  const sub = await reg?.pushManager?.getSubscription();
  if (sub) {
    await enqueue('unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return getPushStatus();
}

/** Notification locale de test (n'exige aucun serveur) : vérifie que l'appareil sait afficher les notifications. */
export async function sendLocalTest(): Promise<boolean> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const reg = await registration();
  if (!reg) return false;
  await reg.showNotification('WIRD — notification de test', {
    body: 'Si tu lis ceci, ton appareil affiche bien les notifications de WIRD.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: 'wird-test',
    data: { url: '/profil/notifications' },
  });
  return true;
}

export { API_URL, serverConfigured };

// ---------- Contrôles pour le tableau de bord de configuration ----------
export interface ServerHealth {
  reachable: boolean;
  /** La clé publique VAPID du serveur est celle de l'application. */
  keyMatches: boolean | null;
  lastCron: string | null;
}

/** Vérifie le serveur de rappels (GET /api/health). Ne dit « ok » que si le serveur répond réellement. */
export async function checkServer(): Promise<ServerHealth> {
  if (!serverConfigured) return { reachable: false, keyMatches: null, lastCron: null };
  try {
    const r = await fetch(`${API_URL}/api/health`, { cache: 'no-store' });
    if (!r.ok) return { reachable: false, keyMatches: null, lastCron: null };
    const j = (await r.json()) as { publicKey?: string; lastCron?: string | null };
    return { reachable: true, keyMatches: j.publicKey === VAPID_PUBLIC_KEY, lastCron: j.lastCron ?? null };
  } catch {
    return { reachable: false, keyMatches: null, lastCron: null };
  }
}

/** Demande au serveur d'envoyer une vraie notification de test à cet appareil (chemin complet : serveur → service Push → appareil). */
export async function sendServerTest(): Promise<'sent' | 'no-identity' | 'failed'> {
  const id = await getPushIdentity();
  if (!id) return 'no-identity';
  try {
    const r = await fetch(`${API_URL}/api/test`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-wird-token': id.token }, body: JSON.stringify({ endpoint: id.endpoint }) });
    return r.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
