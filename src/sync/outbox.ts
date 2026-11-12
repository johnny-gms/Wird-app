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

/** Identifiant du destinataire côté serveur : l'URL d'abonnement Push de cet appareil. */
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
      if (ev.type === 'prefs' || ev.type === 'activity') {
        const endpoint = await currentEndpoint();
        if (!endpoint) {
          // Pas d'abonnement sur cet appareil : personne à qui envoyer des rappels, on abandonne l'évènement.
          q = q.slice(1);
          await kvSet(KEY, q);
          continue;
        }
        payload = { ...payload, endpoint };
      }
      const res = await fetch(API_URL + ENDPOINT[ev.type], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
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
