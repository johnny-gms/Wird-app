import type { ReminderKind } from '../../src/notifications/rules';
import type { NotificationPrefs } from '../../src/engine/types';

export interface Subscriber {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** SHA-256 (hex) du jeton secret remis à l'appareil à l'abonnement. Le jeton lui-même n'est jamais stocké. */
  tokenHash: string;
  tz: string;
  prefs: NotificationPrefs;
  lastActivityDate: string | null;
  unfinishedDate: string | null;
  sent: Partial<Record<ReminderKind, string>>;
}

/** Accès aux données : implémenté pour D1 (production) et en mémoire (tests). */
export interface Store {
  get(endpoint: string): Promise<Subscriber | null>;
  put(sub: Subscriber): Promise<void>;
  delete(endpoint: string): Promise<void>;
  all(): Promise<Subscriber[]>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

export class MemoryStore implements Store {
  subs = new Map<string, Subscriber>();
  meta = new Map<string, string>();
  async get(e: string) { return this.subs.get(e) ?? null; }
  async put(s: Subscriber) { this.subs.set(s.endpoint, structuredClone(s)); }
  async delete(e: string) { this.subs.delete(e); }
  async all() { return [...this.subs.values()].map((s) => structuredClone(s)); }
  async getMeta(k: string) { return this.meta.get(k) ?? null; }
  async setMeta(k: string, v: string) { this.meta.set(k, v); }
}

// Types minimaux de D1 (remplacés par @cloudflare/workers-types dans un projet Worker complet)
export interface D1Like {
  prepare(q: string): { bind(...v: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> } };
}

interface Row {
  endpoint: string; p256dh: string; auth: string; token_hash: string; tz: string; prefs: string;
  last_activity_date: string | null; unfinished_date: string | null; sent: string;
}
const fromRow = (r: Row): Subscriber => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth, tokenHash: r.token_hash, tz: r.tz, prefs: JSON.parse(r.prefs), lastActivityDate: r.last_activity_date, unfinishedDate: r.unfinished_date, sent: JSON.parse(r.sent) });

export class D1Store implements Store {
  constructor(private db: D1Like) {}
  async get(endpoint: string) {
    const r = await this.db.prepare('SELECT * FROM subscribers WHERE endpoint = ?1').bind(endpoint).first<Row>();
    return r ? fromRow(r) : null;
  }
  async put(s: Subscriber) {
    await this.db
      .prepare(
        `INSERT INTO subscribers (endpoint, p256dh, auth, token_hash, tz, prefs, last_activity_date, unfinished_date, sent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh=?2, auth=?3, token_hash=?4, tz=?5, prefs=?6, last_activity_date=?7, unfinished_date=?8, sent=?9, updated_at=datetime('now')`,
      )
      .bind(s.endpoint, s.p256dh, s.auth, s.tokenHash, s.tz, JSON.stringify(s.prefs), s.lastActivityDate, s.unfinishedDate, JSON.stringify(s.sent))
      .run();
  }
  async delete(endpoint: string) {
    await this.db.prepare('DELETE FROM subscribers WHERE endpoint = ?1').bind(endpoint).run();
  }
  async all() {
    const r = await this.db.prepare('SELECT * FROM subscribers').bind().all<Row>();
    return r.results.map(fromRow);
  }
  async getMeta(key: string) {
    const r = await this.db.prepare('SELECT value FROM meta WHERE key = ?1').bind(key).first<{ value: string }>();
    return r?.value ?? null;
  }
  async setMeta(key: string, value: string) {
    await this.db.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=?2').bind(key, value).run();
  }
}
