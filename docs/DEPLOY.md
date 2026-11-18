# Déploiement Cloudflare Pages

**Option A — Git** : Cloudflare › Workers & Pages › Create › Pages › connecter le dépôt. Build : `npm run build`, sortie : `dist`, Node ≥ 20.
**Option B — CLI** : `npm run build && npx wrangler pages deploy dist --project-name wird`.

`public/_headers` règle le cache (sw.js et manifest sans cache, assets immuables) et la sécurité (politique CSP, pas d'affichage dans un cadre, pas de caméra / micro / position). Le repli SPA est automatique (pas de 404.html).

**Si l'adresse du Worker de rappels change** : mettre à jour `connect-src` dans la ligne `Content-Security-Policy` de `public/_headers`, sinon le navigateur bloque les appels au serveur. Le fichier `public/theme-init.js` doit rester un fichier externe (la CSP interdit les scripts écrits dans la page).

**Données personnelles** : n'écris jamais ton e-mail personnel dans le dépôt. `VAPID_SUBJECT` (Worker) peut être l'adresse https de l'app.
HTTPS fourni par Cloudflare (requis pour l'installation et le Push).

Variables optionnelles (build) : `VITE_PUSH_API_URL`, `VITE_VAPID_PUBLIC_KEY` — voir `docs/NOTIFICATIONS.md`. Aucune n'est requise pour tester la V1.

## Sécurité du Worker et données personnelles

- **Mise à jour du schéma** : le Worker utilise maintenant une table `rate_limits` (limitation de débit). Après chaque mise à jour, relancer `npx wrangler d1 execute wird-push --remote --file=worker/schema.sql` (les commandes sont idempotentes).
- **Limitation de débit** : connexion et inscription (20 requêtes / 10 min par adresse IP, 8 tentatives / 15 min par adresse e-mail), abonnement aux rappels (30 / heure / IP). Au-delà : réponse 429.
- **Sessions** : valables 90 jours, purgées chaque jour par le Cron. `POST /api/auth/logout` révoque la session ; `POST /api/auth/delete` supprime le compte, ses sessions et ses données synchronisées.
- **Avant la diffusion** : renseigner `PRIVACY_CONTACT` dans `src/lib/legal.ts` (adresse de contact pour les demandes RGPD, affichée dans À propos › Confidentialité).
