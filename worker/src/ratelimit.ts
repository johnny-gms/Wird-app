import type { D1Like } from './store';

/** Limitation de débit : compte les requêtes par clé et par fenêtre de temps (protège la connexion, l'inscription, l'abonnement). */
export interface RateStore {
  /** Enregistre une requête et renvoie le nombre de requêtes de la fenêtre en cours (celle-ci comprise). */
  hit(key: string, windowSec: number, now: Date): Promise<number>;
  purge(now: Date): Promise<void>;
}

const windowOf = (now: Date, windowSec: number) => Math.floor(now.getTime() / 1000 / windowSec);

export class MemoryRateStore implements RateStore {
  counts = new Map<string, number>();
  async hit(key: string, windowSec: number, now: Date) {
    const k = `${key}|${windowOf(now, windowSec)}`;
    const n = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, n);
    return n;
  }
  async purge() { this.counts.clear(); }
}

export class D1RateStore implements RateStore {
  constructor(private db: D1Like) {}
  async hit(key: string, windowSec: number, now: Date) {
    const w = windowOf(now, windowSec);
    const r = await this.db
      .prepare('INSERT INTO rate_limits (key, window, n, expires) VALUES (?1, ?2, 1, ?3) ON CONFLICT(key, window) DO UPDATE SET n = n + 1 RETURNING n')
      .bind(key, w, Math.floor(now.getTime() / 1000) + windowSec * 2)
      .first<{ n: number }>();
    return r?.n ?? 1;
  }
  async purge(now: Date) {
    await this.db.prepare('DELETE FROM rate_limits WHERE expires < ?1').bind(Math.floor(now.getTime() / 1000)).run();
  }
}

/** Règles : [préfixe de route, requêtes max, fenêtre en secondes]. */
export const LIMITS = {
  authIp: { max: 20, windowSec: 600 },
  loginEmail: { max: 8, windowSec: 900 },
  subscribeIp: { max: 30, windowSec: 3600 },
} as const;

/** Renvoie true si la limite est dépassée. En cas d'erreur du stockage, on laisse passer (le service reste disponible). */
export async function limited(store: RateStore, key: string, rule: { max: number; windowSec: number }, now: Date): Promise<boolean> {
  try {
    return (await store.hit(key, rule.windowSec, now)) > rule.max;
  } catch {
    return false;
  }
}
