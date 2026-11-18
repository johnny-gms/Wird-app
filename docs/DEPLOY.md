# Déploiement Cloudflare Pages

**Option A — Git** : Cloudflare › Workers & Pages › Create › Pages › connecter le dépôt. Build : `npm run build`, sortie : `dist`, Node ≥ 20.
**Option B — CLI** : `npm run build && npx wrangler pages deploy dist --project-name wird`.

`public/_headers` règle le cache (sw.js et manifest sans cache, assets immuables) et la sécurité (politique CSP, pas d'affichage dans un cadre, pas de caméra / micro / position). Le repli SPA est automatique (pas de 404.html).

**Si l'adresse du Worker de rappels change** : mettre à jour `connect-src` dans la ligne `Content-Security-Policy` de `public/_headers`, sinon le navigateur bloque les appels au serveur. Le fichier `public/theme-init.js` doit rester un fichier externe (la CSP interdit les scripts écrits dans la page).

**Données personnelles** : n'écris jamais ton e-mail personnel dans le dépôt. `VAPID_SUBJECT` (Worker) peut être l'adresse https de l'app.
HTTPS fourni par Cloudflare (requis pour l'installation et le Push).

Variables optionnelles (build) : `VITE_PUSH_API_URL`, `VITE_VAPID_PUBLIC_KEY` — voir `docs/NOTIFICATIONS.md`. Aucune n'est requise pour tester la V1.
