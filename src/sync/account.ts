import { API_URL } from './outbox';

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
