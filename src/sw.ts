/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// ---- Hors-ligne : toute l'application (code, polices, texte de référence) est précachée ----
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
  if (event.data?.type === 'PUSH_CONFIG') event.waitUntil(saveCfg({ api: String(event.data.api), key: String(event.data.key) }));
});

// Configuration Push conservée pour se réabonner sans l'application ouverte (pushsubscriptionchange)
const cfgDb = (): Promise<IDBDatabase> =>
  new Promise((res, rej) => {
    const r = indexedDB.open('wird-sw', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('cfg');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
async function saveCfg(v: { api: string; key: string }): Promise<void> {
  const db = await cfgDb();
  await new Promise<void>((res, rej) => {
    const t = db.transaction('cfg', 'readwrite');
    t.objectStore('cfg').put(v, 'push');
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
async function loadCfg(): Promise<{ api: string; key: string } | undefined> {
  const db = await cfgDb();
  return new Promise((res) => {
    const q = db.transaction('cfg').objectStore('cfg').get('push');
    q.onsuccess = () => res(q.result);
    q.onerror = () => res(undefined);
  });
}
const b64uToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
clientsClaim();

// ---- Web Push (reçu uniquement si un serveur d'envoi est configuré, voir docs/NOTIFICATIONS.md) ----
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'WIRD', {
      body: data.body ?? 'Ton Wird t’attend, à ton rythme.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag ?? 'wird',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          void c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// Le navigateur peut renouveler l'abonnement Push : on se réabonne et on prévient le serveur (l'ancien jeton reste valable).
self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as ExtendableEvent & { oldSubscription?: PushSubscription | null };
  e.waitUntil(
    (async () => {
      const cfg = await loadCfg();
      if (!cfg) return;
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(cfg.key) });
      // l'identité (endpoint + jeton) est dans l'IndexedDB de l'application ; on la lit pour authentifier la mise à jour
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('wird');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const id = await new Promise<{ endpoint: string; token: string } | undefined>((res) => {
        const q = db.transaction('kv').objectStore('kv').get('pushIdentity');
        q.onsuccess = () => res(q.result);
        q.onerror = () => res(undefined);
      });
      if (!id) return;
      await fetch(`${cfg.api}/api/resubscribe`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-wird-token': id.token }, body: JSON.stringify({ endpoint: id.endpoint, subscription: sub.toJSON() }) });
      // nouvelle identité locale
      await new Promise<void>((res) => {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').put({ endpoint: sub.endpoint, token: id.token }, 'pushIdentity');
        t.oncomplete = () => res();
        t.onerror = () => res();
      });
    })().catch(() => undefined),
  );
});
