/**
 * SQUELETTE du Worker de rappels WIRD — NON DÉPLOYÉ, NON TESTÉ contre Cloudflare.
 * Il documente le contrat d'API attendu par l'application (src/sync/outbox.ts) et branche les règles testées
 * (src/notifications/rules.ts). L'envoi Web Push réel (chiffrement RFC 8291 + signature VAPID) reste à brancher
 * dans `sendPush` — voir docs/NOTIFICATIONS.md, étape 4.
 *
 * Contrat (JSON, CORS limité à ALLOWED_ORIGIN) :
 *   POST /api/subscribe    { subscription, prefs, tz }
 *   POST /api/unsubscribe  { endpoint }
 *   POST /api/prefs        { prefs, tz, endpoint }
 *   POST /api/activity     { date, at, unfinished, tz, endpoint }
 */
import { decideReminders, type ReminderKind, type SubscriberState } from '../../src/notifications/rules';

interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}
// Types minimaux (remplacés par @cloudflare/workers-types une fois le Worker initialisé)
type D1Database = { prepare(q: string): { bind(...v: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> } } };
type ScheduledEvent = { scheduledTime: number };

const json = (data: unknown, env: Env, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': env.ALLOWED_ORIGIN } });

function localParts(now: Date, tz: string): { date: string; time: string } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS')
      return new Response(null, { headers: { 'access-control-allow-origin': env.ALLOWED_ORIGIN, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } });
    if (req.method !== 'POST') return json({ error: 'method' }, env, 405);
    const url = new URL(req.url);
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    if (!body) return json({ error: 'json' }, env, 400);

    switch (url.pathname) {
      case '/api/subscribe': {
        const { subscription, prefs, tz } = body;
        if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) return json({ error: 'subscription' }, env, 400);
        await env.DB.prepare(
          `INSERT INTO subscribers (endpoint, p256dh, auth, tz, prefs) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(endpoint) DO UPDATE SET p256dh=?2, auth=?3, tz=?4, prefs=?5, updated_at=datetime('now')`,
        ).bind(subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, tz ?? 'UTC', JSON.stringify(prefs)).run();
        return json({ ok: true }, env);
      }
      case '/api/unsubscribe':
        await env.DB.prepare('DELETE FROM subscribers WHERE endpoint = ?1').bind(body.endpoint).run();
        return json({ ok: true }, env);
      case '/api/prefs':
        await env.DB.prepare(`UPDATE subscribers SET prefs=?2, tz=?3, updated_at=datetime('now') WHERE endpoint=?1`).bind(body.endpoint, JSON.stringify(body.prefs), body.tz ?? 'UTC').run();
        return json({ ok: true }, env);
      case '/api/activity':
        // Toute activité arrête les relances du jour ; `unfinished` mémorise un travail laissé en cours.
        await env.DB.prepare(`UPDATE subscribers SET last_activity_date=?2, unfinished_date=?3, updated_at=datetime('now') WHERE endpoint=?1`).bind(body.endpoint, body.date, body.unfinished ? body.date : null).run();
        return json({ ok: true }, env);
      default:
        return json({ error: 'not_found' }, env, 404);
    }
  },

  /** Cron Trigger : évalue chaque abonné et envoie au plus un rappel utile. */
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const rows = await env.DB.prepare('SELECT endpoint, p256dh, auth, tz, prefs, last_activity_date, unfinished_date, sent FROM subscribers').bind().all<{
      endpoint: string; p256dh: string; auth: string; tz: string; prefs: string; last_activity_date: string | null; unfinished_date: string | null; sent: string;
    }>();
    for (const r of rows.results) {
      const state: SubscriberState = { prefs: JSON.parse(r.prefs), lastActivityDate: r.last_activity_date, unfinishedDate: r.unfinished_date, sent: JSON.parse(r.sent) as Partial<Record<ReminderKind, string>> };
      const { date, time } = localParts(new Date(event.scheduledTime), r.tz);
      for (const reminder of decideReminders(state, date, time)) {
        const ok = await sendPush({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }, { title: reminder.title, body: reminder.body, url: '/', tag: `wird-${reminder.kind}` }, env);
        if (ok === 'gone') await env.DB.prepare('DELETE FROM subscribers WHERE endpoint=?1').bind(r.endpoint).run();
        else if (ok === true) {
          state.sent[reminder.kind] = reminder.stamp;
          await env.DB.prepare('UPDATE subscribers SET sent=?2 WHERE endpoint=?1').bind(r.endpoint, JSON.stringify(state.sent)).run();
        }
      }
    }
  },
};

/**
 * À IMPLÉMENTER (étape 4 de docs/NOTIFICATIONS.md) : chiffrer la charge (RFC 8291), signer l'en-tête VAPID (ES256)
 * et POSTer vers `sub.endpoint`. Une bibliothèque compatible Workers comme `@block65/webcrypto-web-push`
 * fait ce travail. Retourne true (envoyé), 'gone' (404/410 : abonnement expiré) ou false (erreur temporaire).
 */
async function sendPush(_sub: { endpoint: string; p256dh: string; auth: string }, _payload: { title: string; body: string; url: string; tag: string }, _env: Env): Promise<boolean | 'gone'> {
  throw new Error('sendPush non implémenté : voir docs/NOTIFICATIONS.md');
}
