import { API_URL, getPushIdentity, setPushIdentity } from './outbox';

const KEY = 'wird-account';
export interface Account { email: string; token: string }

export function getAccount(): Account | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Account | null;
    return v?.token && v.email ? v : null;
  } catch {
    return null;
  }
}

export const accountAvailable = Boolean(API_URL);

/** Crée un compte ou se connecte (e-mail + mot de passe). Renvoie un message d'erreur lisible, ou null si réussi. */
export async function authenticate(mode: 'register' | 'login', email: string, password: string): Promise<string | null> {
  if (!API_URL) return 'La connexion n’est pas disponible pour le moment.';
  if (!navigator.onLine) return 'Aucune connexion internet. Tu peux continuer sans compte et le créer plus tard.';
  try {
    const res = await fetch(`${API_URL}/api/auth/${mode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const j = (await res.json().catch(() => ({}))) as { token?: string; email?: string; message?: string };
    if (!res.ok || !j.token) return j.message ?? 'Une erreur est survenue. Réessaie.';
    localStorage.setItem(KEY, JSON.stringify({ email: j.email ?? email, token: j.token } satisfies Account));
    return null;
  } catch {
    return 'Le serveur est injoignable. Réessaie, ou continue sans compte.';
  }
}

const post = (path: string, headers: Record<string, string>, body: object = {}) =>
  fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Se déconnecte : le serveur révoque la session, puis le jeton est retiré de cet appareil (les données locales restent). */
export async function logout(): Promise<void> {
  const a = getAccount();
  try {
    if (a && API_URL && navigator.onLine) await post('/api/auth/logout', { authorization: `Bearer ${a.token}` });
  } catch { /* hors-ligne : la session expirera d'elle-même */ }
  try { localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
}

/**
 * Droit à l'effacement : supprime côté serveur le compte (et les données synchronisées) et l'abonnement aux rappels de cet appareil.
 * Renvoie false si le serveur n'a pas pu être joint (rien n'est alors supprimé côté serveur ; réessaie en ligne).
 */
export async function eraseRemote(opts: { deleteAccount: boolean }): Promise<boolean> {
  if (!API_URL) {
    try { localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
    return true;
  }
  if (!navigator.onLine) return false;
  try {
    const a = getAccount();
    if (a && opts.deleteAccount) {
      const r = await post('/api/auth/delete', { authorization: `Bearer ${a.token}` });
      if (!r.ok && r.status !== 401) return false;
    }
    const id = await getPushIdentity();
    if (id) {
      const r = await post('/api/unsubscribe', { 'x-wird-token': id.token }, { endpoint: id.endpoint });
      if (!r.ok && r.status !== 401) return false;
      await setPushIdentity(null);
    }
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
    } catch { /* pas d'abonnement local */ }
    try { localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
    return true;
  } catch {
    return false;
  }
}
