import { describe, expect, it } from 'vitest';
import { handleRequest, type Env } from './index';
import { MemoryStore } from './store';
import { MemorySyncStore } from './sync';

const env = { DB: null as never, ALLOWED_ORIGIN: 'https://w.example', VAPID_SUBJECT: 'mailto:a@b.c', VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y' } as Env;
const store = new MemoryStore();
const sync = new MemorySyncStore();
const call = (path: string, body: object, user: string | null) =>
  handleRequest(new Request('https://api.example' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, store, new Date(), undefined, async () => user, sync);

describe('endpoints de synchronisation', () => {
  it('sans compte : 501 explicite', async () => {
    const r = await handleRequest(new Request('https://api.example/api/sync/pull', { method: 'POST', body: '{"since":""}' }), env, store);
    expect(r.status).toBe(501);
    expect((await r.json() as { error: string }).error).toBe('auth_not_configured');
  });
  it('push / pull, dernier modifié gagne, isolation entre comptes', async () => {
    const rec = (hlc: string, strength: number) => ({ key: 'verse:5', hlc, del: false, value: { id: 5, strength } });
    expect((await call('/api/sync/push', { records: [rec('0000000000002-0000-A', 50)] }, 'u1')).status).toBe(200);
    await call('/api/sync/push', { records: [rec('0000000000001-0000-B', 10)] }, 'u1'); // plus ancien : ignoré
    const p = (await (await call('/api/sync/pull', { since: '' }, 'u1')).json()) as { records: { value: { strength: number } }[]; cursor: string };
    expect(p.records).toHaveLength(1);
    expect(p.records[0].value.strength).toBe(50);
    expect(((await (await call('/api/sync/pull', { since: p.cursor }, 'u1')).json()) as { records: unknown[] }).records).toHaveLength(0);
    expect(((await (await call('/api/sync/pull', { since: '' }, 'u2')).json()) as { records: unknown[] }).records).toHaveLength(0);
  });
  it('rejette les entrées invalides', async () => {
    expect((await call('/api/sync/push', { records: [{ key: '../x', hlc: 'a', value: 1 }] }, 'u1')).status).toBe(400);
    expect((await call('/api/sync/push', { records: 'x' }, 'u1')).status).toBe(400);
    expect((await call('/api/sync/pull', { since: 5 }, 'u1')).status).toBe(400);
  });
});
