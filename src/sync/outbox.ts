/**
 * File d'attente de synchronisation (« outbox »).
 * Les évènements destinés au serveur (abonnement Push, préférences de rappel, activité) sont mis en file d'attente
 * localement, puis envoyés dès que le réseau et le serveur sont disponibles. Sans serveur configuré, rien n'est envoyé :
 * l'application reste 100 % locale.
 *
 * C'est aussi le point d'extension prévu pour la future synchronisation multi-appareils (voir docs/ARCHITECTURE.md).
 */
import { kvGet, kvSet } from '@/storage/db';

export interface OutboxEvent {
  id: string;
  type: 'subscribe' | 'unsubscribe' | 'prefs' | 'activity';
  payload: unknown;
  ts: string;
}

const KEY = 'outbox';

export const API_URL: string = (import.meta.env.VITE_PUSH_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const VAPID_PUBLIC_KEY: string = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';
export const serverConfigured = Boolean(API_URL && VAPID_PUBLIC_KEY);

const ENDPOINT: Record<OutboxEvent['type'], string> = {
  subscribe: '/api/subscribe',
  unsubscribe: '/api/unsubscribe',
  prefs: '/api/prefs',
  activity: '/api/activity',
};

/** Identité de cet appareil côté serveur de rappels : URL d'abonnement Push + jeton secret remis à l'abonnement. */
export interface PushIdentity {
  endpoint: string;
  token: string;
}
const ID_KEY = 'pushIdentity';
export const getPushIdentity = () => kvGet<PushIdentity>(ID_KEY);
export const setPushIdentity = (v: PushIdentity | null) => kvSet(ID_KEY, v);

async function currentEndpoint(): Promise<string | null> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

async function read(): Promise<OutboxEvent[]> {
  return ((await kvGet<OutboxEvent[]>(KEY)) ?? []) as OutboxEvent[];
}

export async function enqueue(type: OutboxEvent['type'], payload: unknown): Promise<void> {
  if (!serverConfigured) return;
  let q = await read();
  // Les évènements « prefs » et « activity » se remplacent : seul le dernier compte.
  if (type === 'prefs' || type === 'activity') q = q.filter((e) => e.type !== type);
  q.push({ id: crypto.randomUUID(), type, payload, ts: new Date().toISOString() });
  await kvSet(KEY, q);
  void flush();
}

let flushing = false;
export async function flush(): Promise<void> {
  if (!serverConfigured || flushing || !navigator.onLine) return;
  flushing = true;
  try {
    let q = await read();
    while (q.length) {
      const ev = q[0];
      let payload = ev.payload as Record<string, unknown>;
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (ev.type !== 'subscribe') {
        const id = await getPushIdentity();
        const stale = ev.type !== 'unsubscribe' && id?.endpoint !== (await currentEndpoint());
        if (!id || stale) {
          // Pas d'abonnement (ou identité obsolète) sur cet appareil : personne à qui envoyer des rappels, on abandonne l'évènement.
          q = q.slice(1);
          await kvSet(KEY, q);
          continue;
        }
        payload = { ...payload, endpoint: id.endpoint };
        headers['x-wird-token'] = id.token;
        if (ev.type === 'unsubscribe') await setPushIdentity(null);
      }
      const res = await fetch(API_URL + ENDPOINT[ev.type], { method: 'POST', headers, body: JSON.stringify(payload) });
      if (ev.type === 'subscribe' && res.ok) {
        const j = (await res.json().catch(() => null)) as { token?: string } | null;
        const sub = (payload as { subscription?: { endpoint?: string } }).subscription;
        if (j?.token && sub?.endpoint) await setPushIdentity({ endpoint: sub.endpoint, token: j.token });
      }
      if (!res.ok && res.status >= 500) break; // on réessaiera plus tard
      q = q.slice(1); // 2xx accepté, 4xx = évènement invalide : on l'abandonne
      await kvSet(KEY, q);
    }
  } catch {
    /* hors-ligne ou serveur indisponible : on réessaiera */
  } finally {
    flushing = false;
  }
}

export function startOutboxSync(): void {
  window.addEventListener('online', () => void flush());
  void flush();
}
