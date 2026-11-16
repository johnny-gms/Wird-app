import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATIONS } from '../../src/engine/config';
import { handleRequest, runCron, type Env } from './index';
import { MemoryStore } from './store';
import { b64uEncode } from './webpush';

const nodeCrypto = createRequire(import.meta.url)('node:crypto') as typeof import('node:crypto');
const ece = createRequire(import.meta.url)('http_ece') as { decrypt: (d: Buffer, p: object) => Buffer };

async function setup() {
  const vp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const env: Env = { DB: null as never, ALLOWED_ORIGIN: 'https://wird.example.org', VAPID_SUBJECT: 'mailto:contact@example.org', VAPID_PUBLIC_KEY: b64uEncode(await crypto.subtle.exportKey('raw', vp.publicKey)), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', vp.privateKey)).d! };
  const ua = nodeCrypto.createECDH('prime256v1');
  ua.generateKeys();
  const auth = nodeCrypto.randomBytes(16);
  const sentPushes: { endpoint: string; headers: Record<string, string>; message: { title: string; body: string; tag: string } }[] = [];
  let status = 201;
  const fetchImpl = (async (endpoint: string, init: RequestInit) => {
    const body = Buffer.from(init.body as ArrayBuffer);
    const message = JSON.parse(ece.decrypt(body, { version: 'aes128gcm', privateKey: ua, authSecret: b64uEncode(auth) }).toString('utf8'));
    sentPushes.push({ endpoint, headers: init.headers as Record<string, string>, message });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  const store = new MemoryStore();
  const call = (path: string, body?: object, headers: Record<string, string> = {}, method = 'POST', now = new Date('2026-04-10T05:00:00Z')) =>
    handleRequest(new Request('https://api.example.org' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }), env, store, now, fetchImpl);
  const subscription = { endpoint: 'https://push.example.net/abc', keys: { p256dh: b64uEncode(ua.getPublicKey()), auth: b64uEncode(auth) } };
  return { env, store, call, subscription, sentPushes, setStatus: (s: number) => (status = s), fetchImpl };
}
const prefs = DEFAULT_NOTIFICATIONS;

describe('Worker de rappels — API', () => {
  it('abonnement : remet un jeton, ne le stocke jamais en clair ; CORS limité à l’origine de l’app', async () => {
    const t = await setup();
    const r = await t.call('/api/subscribe', { subscription: t.subscription, prefs, tz: 'Europe/Paris' });
    const { token } = (await r.json()) as { token: string };
    expect(r.status).toBe(200);
    expect(token.length).toBeGreaterThan(30);
    expect(JSON.stringify([...t.store.subs.values()])).not.toContain(token);
    expect(r.headers.get('access-control-allow-origin')).toBe('https://wird.example.org');
    expect(t.store.subs.get(t.subscription.endpoint)!.tz).toBe('Europe/Paris');
  });
  it('refuse sans jeton ou avec un mauvais jeton ; valide les données', async () => {
    const t = await setup();
    const { token } = (await (await t.call('/api/subscribe', { subscription: t.subscription, prefs })).json()) as { token: string };
    expect((await t.call('/api/prefs', { endpoint: t.subscription.endpoint, prefs })).status).toBe(401);
    expect((await t.call('/api/prefs', { endpoint: t.subscription.endpoint, prefs }, { 'x-wird-token': 'x'.repeat(43) })).status).toBe(401);
    expect((await t.call('/api/prefs', { endpoint: t.subscription.endpoint, prefs: { daily: 1 } }, { 'x-wird-token': token })).status).toBe(400);
    expect((await t.call('/api/subscribe', { subscription: { endpoint: 'http://insecure', keys: { p256dh: 'a', auth: 'b' } }, prefs })).status).toBe(400);
    expect((await t.call('/api/prefs', { endpoint: t.subscription.endpoint, prefs: { ...prefs, daily: { enabled: false, time: '06:15' } } }, { 'x-wird-token': token })).status).toBe(200);
    expect(t.store.subs.get(t.subscription.endpoint)!.prefs.daily).toEqual({ enabled: false, time: '06:15' });
  });
  it('/api/health expose la clé publique et le dernier passage du Cron', async () => {
    const t = await setup();
    expect(((await (await t.call('/api/health', undefined, {}, 'GET')).json()) as { lastCron: string | null }).lastCron).toBeNull();
    await runCron(t.env, t.store, new Date('2026-04-10T12:00:00Z'), t.fetchImpl);
    const h = (await (await t.call('/api/health', undefined, {}, 'GET')).json()) as { ok: boolean; publicKey: string; lastCron: string };
    expect(h.ok).toBe(true);
    expect(h.publicKey).toBe(t.env.VAPID_PUBLIC_KEY);
    expect(h.lastCron).toBe('2026-04-10T12:00:00.000Z');
  });
  it('/api/test envoie une notification chiffrée, lisible par l’appareil', async () => {
    const t = await setup();
    const { token } = (await (await t.call('/api/subscribe', { subscription: t.subscription, prefs })).json()) as { token: string };
    const r = await t.call('/api/test', { endpoint: t.subscription.endpoint }, { 'x-wird-token': token });
    expect(r.status).toBe(200);
    expect(t.sentPushes[0].message.title).toMatch(/test/);
    expect(t.sentPushes[0].headers.Authorization).toMatch(/^vapid t=.+, k=/);
  });
});

describe('Worker de rappels — Cron (quatre catégories indépendantes)', () => {
  const sub = async (t: Awaited<ReturnType<typeof setup>>, over: object = {}) => {
    const { token } = (await (await t.call('/api/subscribe', { subscription: t.subscription, prefs, tz: 'Europe/Paris', ...over })).json()) as { token: string };
    return token;
  };
  it('rappel quotidien à l’heure locale, une seule fois ; message tutoyé', async () => {
    const t = await setup();
    await sub(t);
    expect(await runCron(t.env, t.store, new Date('2026-04-10T05:00:00Z'), t.fetchImpl)).toMatchObject({ sent: 0 }); // 07:00 à Paris : trop tôt
    expect(await runCron(t.env, t.store, new Date('2026-04-10T05:45:00Z'), t.fetchImpl)).toMatchObject({ sent: 1 }); // 07:45
    expect(t.sentPushes[0].message.tag).toBe('wird-daily');
    expect(t.sentPushes[0].message.title).toMatch(/Ton/);
    expect(await runCron(t.env, t.store, new Date('2026-04-10T06:30:00Z'), t.fetchImpl)).toMatchObject({ sent: 0 }); // pas de doublon
  });
  it('l’activité du jour arrête toutes les relances', async () => {
    const t = await setup();
    const token = await sub(t);
    await t.call('/api/activity', { endpoint: t.subscription.endpoint, date: '2026-04-10', unfinished: false }, { 'x-wird-token': token });
    expect(await runCron(t.env, t.store, new Date('2026-04-10T17:45:00Z'), t.fetchImpl)).toMatchObject({ sent: 0 }); // 19:45 : second rappel supprimé
  });
  it('travail inachevé : rappel le lendemain ; retour après absence : un seul message', async () => {
    const t = await setup();
    const token = await sub(t, { prefs: { ...prefs, daily: { ...prefs.daily, enabled: false }, second: { ...prefs.second, enabled: false } } });
    await t.call('/api/activity', { endpoint: t.subscription.endpoint, date: '2026-04-09', unfinished: true }, { 'x-wird-token': token });
    await runCron(t.env, t.store, new Date('2026-04-10T07:15:00Z'), t.fetchImpl); // 09:15 locale : inachevé
    expect(t.sentPushes.map((p) => p.message.tag)).toEqual(['wird-unfinished']);
    await runCron(t.env, t.store, new Date('2026-04-13T09:00:00Z'), t.fetchImpl); // 4 jours après : retour
    expect(t.sentPushes.map((p) => p.message.tag)).toContain('wird-comeback');
    const n = t.sentPushes.length;
    await runCron(t.env, t.store, new Date('2026-04-14T09:00:00Z'), t.fetchImpl);
    expect(t.sentPushes.length).toBe(n); // un seul message par absence
  });
  it('abonnement expiré (410) : supprimé automatiquement', async () => {
    const t = await setup();
    await sub(t);
    t.setStatus(410);
    expect(await runCron(t.env, t.store, new Date('2026-04-10T05:45:00Z'), t.fetchImpl)).toMatchObject({ gone: 1, sent: 0 });
    expect(t.store.subs.size).toBe(0);
  });
  it('panne temporaire (5xx) : rien n’est marqué comme envoyé, nouvel essai au passage suivant', async () => {
    const t = await setup();
    await sub(t);
    t.setStatus(503);
    expect(await runCron(t.env, t.store, new Date('2026-04-10T05:45:00Z'), t.fetchImpl)).toMatchObject({ retry: 1 });
    t.setStatus(201);
    expect(await runCron(t.env, t.store, new Date('2026-04-10T06:00:00Z'), t.fetchImpl)).toMatchObject({ sent: 1 });
  });
});
