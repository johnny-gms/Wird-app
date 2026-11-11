# Déploiement Cloudflare Pages

**Option A — Git** : Cloudflare › Workers & Pages › Create › Pages › connecter le dépôt. Build : `npm run build`, sortie : `dist`, Node ≥ 20.
**Option B — CLI** : `npm run build && npx wrangler pages deploy dist --project-name wird`.

`public/_headers` règle le cache (sw.js et manifest sans cache, assets immuables). Le repli SPA est automatique (pas de 404.html).
HTTPS fourni par Cloudflare (requis pour l'installation et le Push).

Variables optionnelles (build) : `VITE_PUSH_API_URL`, `VITE_VAPID_PUBLIC_KEY` — voir `docs/NOTIFICATIONS.md`. Aucune n'est requise pour tester la V1.
