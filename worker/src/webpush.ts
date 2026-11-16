/**
 * Web Push côté Worker, sans dépendance : signature VAPID (RFC 8292, ES256) et chiffrement du message
 * (RFC 8291, aes128gcm). Uniquement WebCrypto, donc exécutable dans Cloudflare Workers comme dans Node (tests).
 */
const enc = new TextEncoder();

export const b64uEncode = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const b64uDecode = (s: string): Uint8Array => {
  const p = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const concat = (...a: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, buf(data)));
}
/** HKDF-Extract + Expand (RFC 5869) sur SHA-256. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const t = await hmac(prk, concat(info, new Uint8Array([1]))); // length ≤ 32 : un seul bloc
  return t.slice(0, length);
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string; // clé publique P-256 du navigateur (base64url, 65 octets)
  auth: string; // secret d'authentification (base64url, 16 octets)
}

/** Chiffre `plaintext` pour un abonné (RFC 8291). `asKeys`/`salt` ne servent qu'aux tests (vecteur de la RFC). */
export async function encryptPayload(sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>, plaintext: Uint8Array, opts?: { asPrivateJwk?: JsonWebKey; asPublic?: Uint8Array; salt?: Uint8Array }): Promise<Uint8Array> {
  const ua = b64uDecode(sub.p256dh);
  const authSecret = b64uDecode(sub.auth);
  let asPrivate: CryptoKey;
  let asPublic: Uint8Array;
  if (opts?.asPrivateJwk && opts.asPublic) {
    asPrivate = await crypto.subtle.importKey('jwk', opts.asPrivateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    asPublic = opts.asPublic;
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  }
  const uaKey = await crypto.subtle.importKey('raw', buf(ua), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256));
  const salt = opts?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const keyInfo = concat(enc.encode('WebPush: info\0'), ua, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const padded = concat(plaintext, new Uint8Array([2])); // délimiteur du dernier enregistrement
  if (padded.length > 4096 - 16) throw new Error('message trop long pour un enregistrement unique');
  const aes = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aes, buf(padded)));
  const header = concat(salt, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([asPublic.length]), asPublic); // rs = 4096
  return concat(header, ct);
}

/** Importe une clé VAPID : privée = « d » (base64url, 32 octets), publique = point non compressé (base64url, 65 octets). */
export async function importVapidKey(publicB64u: string, privateB64u: string): Promise<CryptoKey> {
  const pub = b64uDecode(publicB64u);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('clé publique VAPID invalide');
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33)), d: privateB64u, ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** En-tête Authorization VAPID (RFC 8292) pour le service Push de `endpoint`. */
export async function vapidAuthorization(endpoint: string, subject: string, publicB64u: string, privateKey: CryptoKey, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64uEncode(sig)}, k=${publicB64u}`;
}

export type PushResult = 'sent' | 'gone' | 'retry';

/** Envoie une notification. 404/410 = abonnement expiré (à supprimer) ; 429/5xx = à réessayer plus tard. */
export async function sendWebPush(sub: PushSubscriptionKeys, payload: unknown, vapid: { subject: string; publicKey: string; privateKey: CryptoKey }, opts?: { ttl?: number; fetchImpl?: typeof fetch }): Promise<PushResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)));
  const res = await (opts?.fetchImpl ?? fetch)(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid.subject, vapid.publicKey, vapid.privateKey),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts?.ttl ?? 6 * 3600),
      Urgency: 'normal',
    },
    body: buf(body),
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  if (res.ok) return 'sent';
  return 'retry';
}
