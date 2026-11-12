import type { D1Like } from './store';

export interface SyncRow { key: string; hlc: string; del: boolean; value: unknown }

export interface SyncStore {
  /** Enregistre la ligne seulement si son HLC est plus récent que celui déjà stocké (dernier modifié gagne). */
  upsert(user: string, rows: SyncRow[]): Promise<void>;
  since(user: string, hlc: string, limit: number): Promise<SyncRow[]>;
}

export class MemorySyncStore implements SyncStore {
  rows = new Map<string, SyncRow>();
  async upsert(user: string, rows: SyncRow[]) {
    for (const r of rows) {
      const k = user + '\u0000' + r.key;
      const c = this.rows.get(k);
      if (!c || r.hlc > c.hlc) this.rows.set(k, structuredClone(r));
    }
  }
  async since(user: string, hlc: string, limit: number) {
    return [...this.rows.entries()].filter(([k, r]) => k.startsWith(user + '\u0000') && r.hlc > hlc).map(([, r]) => r).sort((a, b) => a.hlc.localeCompare(b.hlc)).slice(0, limit);
  }
}

export class D1SyncStore implements SyncStore {
  constructor(private db: D1Like) {}
  async upsert(user: string, rows: SyncRow[]) {
    for (const r of rows) {
      await this.db
        .prepare(`INSERT INTO sync_records (user_id, key, hlc, del, value) VALUES (?1, ?2, ?3, ?4, ?5)
                  ON CONFLICT(user_id, key) DO UPDATE SET hlc=?3, del=?4, value=?5 WHERE excluded.hlc > sync_records.hlc`)
        .bind(user, r.key, r.hlc, r.del ? 1 : 0, JSON.stringify(r.value ?? null))
        .run();
    }
  }
  async since(user: string, hlc: string, limit: number) {
    const q = await this.db.prepare('SELECT key, hlc, del, value FROM sync_records WHERE user_id = ?1 AND hlc > ?2 ORDER BY hlc LIMIT ?3').bind(user, hlc, limit).all<{ key: string; hlc: string; del: number; value: string }>();
    return q.results.map((r) => ({ key: r.key, hlc: r.hlc, del: !!r.del, value: JSON.parse(r.value) }));
  }
}

/** Renvoie l'identifiant du compte, ou null. Branché plus tard sur Google / Apple. */
export type Authenticator = (req: Request) => Promise<string | null>;
export const noAuth: Authenticator = async () => null;

const KEY = /^[a-z]+(:[\w.-]+)*$/i;
const HLC = /^[\w.:-]{1,64}$/;
export const MAX_BATCH = 500;

export function cleanRows(v: unknown): SyncRow[] | null {
  if (!Array.isArray(v) || v.length > MAX_BATCH) return null;
  const out: SyncRow[] = [];
  for (const r of v) {
    if (!r || typeof r.key !== 'string' || r.key.length > 80 || !KEY.test(r.key) || typeof r.hlc !== 'string' || !HLC.test(r.hlc)) return null;
    if (JSON.stringify(r.value ?? null).length > 20_000) return null;
    out.push({ key: r.key, hlc: r.hlc, del: !!r.del, value: r.del ? null : (r.value ?? null) });
  }
  return out;
}

export async function handleSync(path: string, user: string, body: Record<string, any>, store: SyncStore): Promise<{ status: number; data: unknown }> {
  if (path === '/api/sync/push') {
    const rows = cleanRows(body.records);
    if (!rows) return { status: 400, data: { error: 'invalid' } };
    await store.upsert(user, rows);
    return { status: 200, data: { ok: true, accepted: rows.length } };
  }
  if (path === '/api/sync/pull') {
    const since = typeof body.since === 'string' && (body.since === '' || HLC.test(body.since)) ? body.since : null;
    if (since === null) return { status: 400, data: { error: 'invalid' } };
    const records = await store.since(user, since, MAX_BATCH);
    return { status: 200, data: { records, cursor: records.at(-1)?.hlc ?? since, more: records.length === MAX_BATCH } };
  }
  return { status: 404, data: { error: 'not_found' } };
}
