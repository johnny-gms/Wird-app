import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { b64uDecode, b64uEncode, encryptPayload, importVapidKey, sendWebPush, vapidAuthorization } from './webpush';

// Implémentation de référence indépendante (http_ece, utilisée par la bibliothèque web-push) pour valider l'interopérabilité.
const ece = createRequire(import.meta.url)('http_ece') as { encrypt: (d: Buffer, p: object) => Buffer; decrypt: (d: Buffer, p: object) => Buffer };
const nodeCrypto = createRequire(import.meta.url)('node:crypto') as typeof import('node:crypto');

/** Déchiffrement (côté navigateur) — implémentation indépendante, pour valider l'aller-retour. */
async function decrypt(uaPrivate: JsonWebKey, uaPublic: string, auth: string, body: Uint8Array): Promise<string> {
  const B = (u: Uint8Array) => u as unknown as ArrayBuffer;
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPub = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const enc = new TextEncoder();
  const ua = b64uDecode(uaPublic);
  const priv = await crypto.subtle.importKey('jwk', uaPrivate, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const asKey = await crypto.subtle.importKey('raw', B(asPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, priv, 256));
  const hm = async (k: Uint8Array, d: Uint8Array) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', B(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), B(d)));
  const cat = (...a: Uint8Array[]) => Uint8Array.from(a.flatMap((x) => [...x]));
  const prkKey = await hm(b64uDecode(auth), secret);
  const ikm = (await hm(prkKey, cat(enc.encode('WebPush: info\0'), ua, asPub, new Uint8Array([1])))).slice(0, 32);
  const prk = await hm(salt, ikm);
  const cek = (await hm(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hm(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: B(nonce) }, await crypto.subtle.importKey('raw', B(cek), 'AES-GCM', false, ['decrypt']), B(ct)));
  const end = pt.lastIndexOf(2);
  return new TextDecoder().decode(pt.slice(0, end));
}

describe('Web Push — chiffrement RFC 8291 (interopérabilité)', () => {
  it('notre chiffrement est lu par l’implémentation de référence (http_ece)', async () => {
    const ua = nodeCrypto.createECDH('prime256v1');
    ua.generateKeys();
    const auth = nodeCrypto.randomBytes(16);
    const msg = JSON.stringify({ title: 'Ton Wird du jour', body: 'Ton programme est prêt, à ton rythme.' });
    const body = await encryptPayload({ p256dh: b64uEncode(ua.getPublicKey()), auth: b64uEncode(auth) }, new TextEncoder().encode(msg));
    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret: b64uEncode(auth) });
    expect(plain.toString('utf8')).toBe(msg);
  });
  it('le chiffrement de référence (http_ece) est lu par notre déchiffrement de test', async () => {
    const ua = nodeCrypto.createECDH('prime256v1');
    ua.generateKeys();
    const auth = nodeCrypto.randomBytes(16);
    const local = nodeCrypto.createECDH('prime256v1');
    local.generateKeys();
    const msg = 'Rien à rattraper : ton Wird reprend simplement là où tu l’avais laissé.';
    const body = ece.encrypt(Buffer.from(msg), { version: 'aes128gcm', dh: b64uEncode(ua.getPublicKey()), privateKey: local, authSecret: b64uEncode(auth) });
    const jwk = { kty: 'EC', crv: 'P-256', x: b64uEncode(ua.getPublicKey().subarray(1, 33)), y: b64uEncode(ua.getPublicKey().subarray(33)), d: b64uEncode(ua.getPrivateKey()), ext: true } as JsonWebKey;
    expect(await decrypt(jwk, b64uEncode(ua.getPublicKey()), b64uEncode(auth), new Uint8Array(body))).toBe(msg);
  });
  it('aller-retour avec des clés WebCrypto aléatoires (accents compris)', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const pub = b64uEncode(await crypto.subtle.exportKey('raw', pair.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const auth = b64uEncode(crypto.getRandomValues(new Uint8Array(16)));
    const msg = JSON.stringify({ title: 'Ton Wird du jour', body: 'Ton programme est prêt, à ton rythme.' });
    const body = await encryptPayload({ p256dh: pub, auth }, new TextEncoder().encode(msg));
    expect(await decrypt(jwk, pub, auth, body)).toBe(msg);
  });
});

describe('Web Push — VAPID et envoi', () => {
  it('signe un JWT ES256 vérifiable avec la clé publique', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64uEncode(await crypto.subtle.exportKey('raw', pair.publicKey));
    const d = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!;
    const key = await importVapidKey(pub, d);
    const h = await vapidAuthorization('https://push.example.net/wpush/v2/abc', 'mailto:test@example.org', pub, key, 1_700_000_000);
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=(.+)$/.exec(h)!;
    expect(m[4]).toBe(pub);
    expect(JSON.parse(new TextDecoder().decode(b64uDecode(m[2])))).toEqual({ aud: 'https://push.example.net', exp: 1_700_000_000 + 12 * 3600, sub: 'mailto:test@example.org' });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64uDecode(m[3]) as unknown as ArrayBuffer, new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });
  it('sendWebPush : en-têtes corrects, 410 = abonnement expiré, 5xx = réessayer', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64uEncode(await crypto.subtle.exportKey('raw', pair.publicKey));
    const key = await importVapidKey(pub, (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!);
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const sub = { endpoint: 'https://push.example.net/x', p256dh: b64uEncode(await crypto.subtle.exportKey('raw', ua.publicKey)), auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))) };
    let seen: { headers: Record<string, string> } | null = null;
    const mk = (status: number): typeof fetch => (async (_u: unknown, init: RequestInit) => { seen = { headers: init.headers as Record<string, string> }; return new Response(null, { status }); }) as unknown as typeof fetch;
    expect(await sendWebPush(sub, { title: 'x' }, { subject: 'mailto:a@b.c', publicKey: pub, privateKey: key }, { fetchImpl: mk(201) })).toBe('sent');
    expect(seen!.headers['Content-Encoding']).toBe('aes128gcm');
    expect(seen!.headers.Authorization).toMatch(/^vapid t=/);
    expect(await sendWebPush(sub, { title: 'x' }, { subject: 'mailto:a@b.c', publicKey: pub, privateKey: key }, { fetchImpl: mk(410) })).toBe('gone');
    expect(await sendWebPush(sub, { title: 'x' }, { subject: 'mailto:a@b.c', publicKey: pub, privateKey: key }, { fetchImpl: mk(503) })).toBe('retry');
  });
});
