import { describe, expect, it } from 'vitest';
import { MemoryAuthStore, SESSION_DAYS } from './auth';
import { MemoryRateStore } from './ratelimit';
import { handleRequest, type Env } from './index';
import { MemoryStore } from './store';
import { MemorySyncStore } from './sync';

const env = { DB: null as never, ALLOWED_ORIGIN: 'https://w.example', VAPID_SUBJECT: 'mailto:a@b.c', VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y' } as Env;
const store = new MemoryStore();
const sync = new MemorySyncStore();
const auth = new MemoryAuthStore();
const call = (path: string, body: object, headers: Record<string, string> = {}) =>
  handleRequest(new Request('https://api.example' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), env, store, new Date(), undefined, undefined, sync, auth);

describe('comptes e-mail + mot de passe', () => {
  it('inscription, doublon, connexion, mauvais mot de passe', async () => {
    const r = await call('/api/auth/register', { email: 'Test@Example.org', password: 'motdepasse1' });
    expect(r.status).toBe(200);
    const { token } = (await r.json()) as { token: string };
    expect(token.length).toBeGreaterThan(30);
    expect((await call('/api/auth/register', { email: 'test@example.org', password: 'motdepasse1' })).status).toBe(409);
    expect((await call('/api/auth/login', { email: 'test@example.org', password: 'motdepasse1' })).status).toBe(200);
    expect((await call('/api/auth/login', { email: 'test@example.org', password: 'faux-mot-de-passe' })).status).toBe(401);
    expect((await call('/api/auth/login', { email: 'inconnu@example.org', password: 'motdepasse1' })).status).toBe(401);
    // le mot de passe n'est jamais stocké en clair
    expect(JSON.stringify([...auth.users.values()])).not.toContain('motdepasse1');
  });
  it('validation des entrées', async () => {
    expect((await call('/api/auth/register', { email: 'pas-un-mail', password: 'motdepasse1' })).status).toBe(400);
    expect((await call('/api/auth/register', { email: 'a@b.org', password: 'court' })).status).toBe(400);
  });
  it('le jeton de session ouvre la synchronisation', async () => {
    const reg = (await (await call('/api/auth/register', { email: 'sync@example.org', password: 'motdepasse1' })).json()) as { token: string };
    expect((await call('/api/sync/pull', { since: '' })).status).toBe(401);
    expect((await call('/api/sync/pull', { since: '' }, { authorization: 'Bearer ' + reg.token })).status).toBe(200);
  });
  it('déconnexion : le jeton ne marche plus ; suppression du compte : compte, sessions et données effacés', async () => {
    const reg = (await (await call('/api/auth/register', { email: 'bye@example.org', password: 'motdepasse1' })).json()) as { token: string };
    const h = { authorization: 'Bearer ' + reg.token };
    expect((await call('/api/sync/pull', { since: '' }, h)).status).toBe(200);
    expect((await call('/api/auth/logout', {}, h)).status).toBe(200);
    expect((await call('/api/sync/pull', { since: '' }, h)).status).toBe(401);
    const again = (await (await call('/api/auth/login', { email: 'bye@example.org', password: 'motdepasse1' })).json()) as { token: string };
    const h2 = { authorization: 'Bearer ' + again.token };
    expect((await call('/api/auth/delete', {}, { authorization: 'Bearer faux-jeton-faux-jeton-faux' })).status).toBe(401);
    expect((await call('/api/auth/delete', {}, h2)).status).toBe(200);
    expect(auth.users.has('bye@example.org')).toBe(false);
    expect((await call('/api/auth/login', { email: 'bye@example.org', password: 'motdepasse1' })).status).toBe(401);
  });
  it('une session expire après ' + SESSION_DAYS + ' jours', async () => {
    const a = new MemoryAuthStore();
    await a.putSession('h', 'u');
    expect(await a.userBySession('h', new Date(Date.now() + (SESSION_DAYS - 1) * 864e5))).toBe('u');
    expect(await a.userBySession('h', new Date(Date.now() + (SESSION_DAYS + 1) * 864e5))).toBeNull();
  });
  it('limitation de débit : trop de tentatives de connexion → 429, par adresse e-mail et par IP', async () => {
    const rates = new MemoryRateStore();
    const a = new MemoryAuthStore();
    const go = (path: string, body: object, ip = '1.1.1.1') =>
      handleRequest(new Request('https://api.example' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }), env, store, new Date(), undefined, undefined, sync, a, rates);
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) codes.push((await go('/api/auth/login', { email: 'x@example.org', password: 'mauvais-mdp-1' }, `9.9.9.${i}`)).status);
    expect(codes.slice(0, 8).every((c) => c === 401)).toBe(true);
    expect(codes.slice(8)).toEqual([429, 429]); // même adresse e-mail attaquée depuis des IP différentes
    const ipCodes: number[] = [];
    for (let i = 0; i < 22; i++) ipCodes.push((await go('/api/auth/login', { email: `u${i}@example.org`, password: 'mauvais-mdp-1' }, '2.2.2.2')).status);
    expect(ipCodes.slice(0, 20).every((c) => c === 401)).toBe(true);
    expect(ipCodes.slice(20)).toEqual([429, 429]);
    expect((await go('/api/auth/login', { email: 'u1@example.org', password: 'mauvais-mdp-1' }, '3.3.3.3')).status).toBe(401); // une autre IP n'est pas bloquée
  });
});
