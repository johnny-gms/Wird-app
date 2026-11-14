import { describe, expect, it } from 'vitest';
import { MemoryAuthStore } from './auth';
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
});
