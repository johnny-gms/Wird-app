/**
 * Worker de rappels WIRD (Cloudflare Workers + D1 + Cron Trigger). Contrat d'API : docs/NOTIFICATIONS.md.
 * Données stockées : abonnement Push, préférences, fuseau, date de dernière activité. Jamais de versets ni d'évaluations.
 */
import { decideReminders, type SubscriberState } from '../../src/notifications/rules';
import type { NotificationPrefs } from '../../src/engine/types';
import { D1Store, type D1Like, type Store, type Subscriber } from './store';
import { b64uEncode, importVapidKey, sendWebPush } from './webpush';

export interface Env {
  DB: D1Like;
  ALLOWED_ORIGIN: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cors(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return { 'access-control-allow-origin': env.ALLOWED_ORIGIN, 'access-control-allow-headers': 'content-type, x-wird-token', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin', ...extra };
}
const json = (env: Env, data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors(env, { 'content-type': 'application/json' }) });

async function sha256Hex(s: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

function cleanPrefs(p: unknown): NotificationPrefs | null {
  const o = p as Record<string, { enabled?: unknown; time?: unknown; afterDays?: unknown }> | null;
  if (!o || typeof o !== 'object') return null;
  const one = (k: string) => {
    const v = o[k];
    return v && typeof v.enabled === 'boolean' && typeof v.time === 'string' && TIME.test(v.time) ? { enabled: v.enabled, time: v.time } : null;
  };
  const daily = one('daily'), second = one('second'), unfinished = one('unfinished'), comeback = one('comeback');
  const after = Number(o.comeback?.afterDays);
  if (!daily || !second || !unfinished || !comeback || !(after >= 1 && after <= 30)) return null;
  return { daily, second, unfinished, comeback: { ...comeback, afterDays: Math.round(after) } };
}
const cleanTz = (tz: unknown): string => {
  try {
    if (typeof tz === 'string') {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return tz;
    }
  } catch { /* fuseau inconnu */ }
  return 'UTC';
};

export function localParts(now: Date, tz: string): { date: string; time: string } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

async function vapid(env: Env) {
  return { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: await importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY) };
}

export async function handleRequest(req: Request, env: Env, store: Store = new D1Store(env.DB), now: Date = new Date(), fetchImpl?: typeof fetch): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
  if (req.method === 'GET' && url.pathname === '/api/health') return json(env, { ok: true, publicKey: env.VAPID_PUBLIC_KEY, lastCron: await store.getMeta('lastCron'), time: now.toISOString() });
  if (req.method === 'GET' && url.pathname === '/api/vapid') return json(env, { key: env.VAPID_PUBLIC_KEY });
  if (req.method !== 'POST') return json(env, { error: 'method' }, 405);

  const body = (await req.json().catch(() => null)) as Record<string, any> | null;
  if (!body || typeof body !== 'object') return json(env, { error: 'json' }, 400);

  // ---- abonnement : crée l'appareil et remet un jeton secret (jamais stocké en clair)
  if (url.pathname === '/api/subscribe') {
    const s = body.subscription;
    const prefs = cleanPrefs(body.prefs);
    if (typeof s?.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000 || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string' || !prefs) return json(env, { error: 'invalid' }, 400);
    const existing = await store.get(s.endpoint);
    const token = b64uEncode(crypto.getRandomValues(new Uint8Array(32)));
    const sub: Subscriber = { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, tokenHash: await sha256Hex(token), tz: cleanTz(body.tz), prefs, lastActivityDate: existing?.lastActivityDate ?? null, unfinishedDate: existing?.unfinishedDate ?? null, sent: existing?.sent ?? {} };
    await store.put(sub);
    return json(env, { ok: true, token });
  }

  // ---- routes authentifiées par jeton
  const endpoint = body.endpoint;
  const token = req.headers.get('x-wird-token') ?? body.token;
  if (typeof endpoint !== 'string' || typeof token !== 'string') return json(env, { error: 'auth' }, 401);
  const sub = await store.get(endpoint);
  if (!sub || !safeEqual(sub.tokenHash, await sha256Hex(token))) return json(env, { error: 'auth' }, 401);

  switch (url.pathname) {
    case '/api/unsubscribe':
      await store.delete(endpoint);
      return json(env, { ok: true });
    case '/api/prefs': {
      const prefs = cleanPrefs(body.prefs);
      if (!prefs) return json(env, { error: 'invalid' }, 400);
      await store.put({ ...sub, prefs, tz: cleanTz(body.tz) });
      return json(env, { ok: true });
    }
    case '/api/activity': {
      if (typeof body.date !== 'string' || !DATE.test(body.date)) return json(env, { error: 'invalid' }, 400);
      // toute activité arrête les relances du jour ; « unfinished » mémorise un travail laissé en cours
      await store.put({ ...sub, tz: cleanTz(body.tz ?? sub.tz), lastActivityDate: body.date, unfinishedDate: body.unfinished === true ? body.date : null });
      return json(env, { ok: true });
    }
    case '/api/resubscribe': {
      const s = body.subscription;
      if (typeof s?.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return json(env, { error: 'invalid' }, 400);
      await store.delete(endpoint);
      await store.put({ ...sub, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth });
      return json(env, { ok: true });
    }
    case '/api/test': {
      const r = await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { title: 'WIRD — notification de test', body: 'Le serveur de rappels fonctionne : tu recevras tes rappels comme prévu.', url: '/profil/notifications', tag: 'wird-test' }, await vapid(env), { fetchImpl });
      if (r === 'gone') await store.delete(endpoint);
      return json(env, { ok: r === 'sent', result: r }, r === 'sent' ? 200 : 502);
    }
    default:
      return json(env, { error: 'not_found' }, 404);
  }
}

/** Cron Trigger : évalue chaque abonné, envoie au plus un rappel utile, nettoie les abonnements expirés. */
export async function runCron(env: Env, store: Store, now: Date = new Date(), fetchImpl?: typeof fetch): Promise<{ sent: number; gone: number; retry: number }> {
  const out = { sent: 0, gone: 0, retry: 0 };
  const v = await vapid(env);
  for (const sub of await store.all()) {
    const state: SubscriberState = { prefs: sub.prefs, lastActivityDate: sub.lastActivityDate, unfinishedDate: sub.unfinishedDate, sent: sub.sent };
    const { date, time } = localParts(now, sub.tz);
    for (const r of decideReminders(state, date, time)) {
      const res = await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { title: r.title, body: r.body, url: '/', tag: `wird-${r.kind}` }, v, { fetchImpl });
      if (res === 'gone') {
        await store.delete(sub.endpoint);
        out.gone++;
      } else if (res === 'sent') {
        await store.put({ ...sub, sent: { ...sub.sent, [r.kind]: r.stamp } });
        out.sent++;
      } else out.retry++;
    }
  }
  await store.setMeta('lastCron', now.toISOString());
  return out;
}

export default {
  fetch: (req: Request, env: Env) => handleRequest(req, env),
  scheduled: async (_event: unknown, env: Env) => {
    await runCron(env, new D1Store(env.DB));
  },
};
