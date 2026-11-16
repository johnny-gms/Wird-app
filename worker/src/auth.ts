import { b64uEncode } from './webpush';
import type { D1Like } from './store';

/** Comptes : e-mail + mot de passe. Le mot de passe n'est jamais stocké (PBKDF2-SHA256 salé) ; le jeton de session non plus (haché). */
export interface User { id: string; email: string; salt: string; hash: string }

export interface AuthStore {
  getUser(email: string): Promise<User | null>;
  createUser(u: User): Promise<boolean>;
  putSession(tokenHash: string, userId: string): Promise<void>;
  userBySession(tokenHash: string): Promise<string | null>;
}

export class MemoryAuthStore implements AuthStore {
  users = new Map<string, User>();
  sessions = new Map<string, string>();
  async getUser(e: string) { return this.users.get(e) ?? null; }
  async createUser(u: User) { if (this.users.has(u.email)) return false; this.users.set(u.email, u); return true; }
  async putSession(h: string, id: string) { this.sessions.set(h, id); }
  async userBySession(h: string) { return this.sessions.get(h) ?? null; }
}

export class D1AuthStore implements AuthStore {
  constructor(private db: D1Like) {}
  async getUser(email: string) {
    return this.db.prepare('SELECT id, email, salt, hash FROM users WHERE email = ?1').bind(email).first<User>();
  }
  async createUser(u: User) {
    try {
      await this.db.prepare('INSERT INTO users (id, email, salt, hash) VALUES (?1, ?2, ?3, ?4)').bind(u.id, u.email, u.salt, u.hash).run();
      return true;
    } catch {
      return false;
    }
  }
  async putSession(tokenHash: string, userId: string) {
    await this.db.prepare('INSERT INTO sessions (token_hash, user_id) VALUES (?1, ?2)').bind(tokenHash, userId).run();
  }
  async userBySession(tokenHash: string) {
    const r = await this.db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?1').bind(tokenHash).first<{ user_id: string }>();
    return r?.user_id ?? null;
  }
}

const ITER = 100_000;
const enc = new TextEncoder();
async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64uEncode(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITER }, key, 256));
}
export async function sha256Hex(s: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const b64uDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const cleanEmail = (v: unknown): string | null => (typeof v === 'string' && EMAIL.test(v.trim()) && v.length <= 254 ? v.trim().toLowerCase() : null);

async function newSession(store: AuthStore, userId: string) {
  const token = b64uEncode(crypto.getRandomValues(new Uint8Array(32)));
  await store.putSession(await sha256Hex(token), userId);
  return token;
}

export async function handleAuth(path: string, body: Record<string, any>, store: AuthStore): Promise<{ status: number; data: unknown }> {
  const email = cleanEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email) return { status: 400, data: { error: 'email', message: 'Adresse e-mail invalide.' } };
  if (path === '/api/auth/register') {
    if (password.length < 8 || password.length > 200) return { status: 400, data: { error: 'password', message: 'Le mot de passe doit contenir au moins 8 caractères.' } };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const user: User = { id: crypto.randomUUID(), email, salt: b64uEncode(salt), hash: await derive(password, salt) };
    if (!(await store.createUser(user))) return { status: 409, data: { error: 'exists', message: 'Un compte existe déjà avec cette adresse. Connecte-toi.' } };
    return { status: 200, data: { ok: true, token: await newSession(store, user.id), email } };
  }
  if (path === '/api/auth/login') {
    const u = await store.getUser(email);
    // même coût de calcul que le compte existe ou non, et même message : on ne révèle pas quelles adresses ont un compte
    const ok = u ? equal(await derive(password, b64uDecode(u.salt)), u.hash) : (await derive(password, new Uint8Array(16)), false);
    if (!u || !ok) return { status: 401, data: { error: 'credentials', message: 'E-mail ou mot de passe incorrect.' } };
    return { status: 200, data: { ok: true, token: await newSession(store, u.id), email } };
  }
  return { status: 404, data: { error: 'not_found' } };
}

export async function authenticateBearer(req: Request, store: AuthStore): Promise<string | null> {
  const m = /^Bearer (\S{20,200})$/.exec(req.headers.get('authorization') ?? '');
  return m ? store.userBySession(await sha256Hex(m[1])) : null;
}
