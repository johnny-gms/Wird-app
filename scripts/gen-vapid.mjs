// Génère un couple de clés VAPID (Web Push). À exécuter CHEZ TOI, jamais dans un dépôt public :
//   node scripts/gen-vapid.mjs
// - la clé PUBLIQUE va dans l'app (VITE_VAPID_PUBLIC_KEY) et dans le Worker (secret VAPID_PUBLIC_KEY) ;
// - la clé PRIVÉE ne va QUE dans le secret Cloudflare VAPID_PRIVATE_KEY : `npx wrangler secret put VAPID_PRIVATE_KEY`.
import { webcrypto as crypto } from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await crypto.subtle.exportKey('raw', pair.publicKey));
const priv = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
console.log('Clé PUBLIQUE  (VITE_VAPID_PUBLIC_KEY et secret VAPID_PUBLIC_KEY) :\n' + pub + '\n');
console.log('Clé PRIVÉE   (secret VAPID_PRIVATE_KEY uniquement — ne la partage jamais, ne la committe pas) :\n' + priv + '\n');
