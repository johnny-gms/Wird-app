# Notifications Web Push — mise en service

## Ce qui est fait (dans le dépôt)
- **App** : permission demandée après un geste, abonnement Push (VAPID), quatre rappels indépendants (quotidien, second si non validé, lendemain si inachevé, retour après absence) avec horaires, notification locale de test, **tableau de bord de configuration** (Profil › Rappels) qui vérifie réellement ce qui peut l'être.
- **Service Worker** : affichage, clic (ouvre l'app), réabonnement automatique (`pushsubscriptionchange`).
- **Worker** (`worker/`) : abonnement / désabonnement / préférences / activité / test, jeton secret par appareil (stocké haché), CORS limité à l'origine de l'app, Cron toutes les 15 min appliquant `src/notifications/rules.ts`. Chiffrement RFC 8291 et signature VAPID (RFC 8292) en WebCrypto, **testés** : interopérabilité avec l'implémentation de référence (`http_ece`), cycle complet du Cron (heures locales, absence de doublon, arrêt à la reprise d'activité, abonnements expirés 410, pannes 5xx).

## Ce que seul toi peux faire (compte Cloudflare) — étapes exactes
Rien de ceci n'a été fait ni ne peut l'être depuis le dépôt : il faut ton compte.
1. **Installer Wrangler et te connecter** : `npm i -g wrangler` puis `wrangler login`.
2. **Créer la base D1** : `cd worker && npx wrangler d1 create wird-push` → copie le `database_id` affiché.
3. **Configurer** : `cp wrangler.toml.example wrangler.toml` et renseigne `database_id`, `ALLOWED_ORIGIN` (adresse exacte de l'app, sans `/` final) et `VAPID_SUBJECT`.
4. **Appliquer le schéma** : `npx wrangler d1 execute wird-push --remote --file=schema.sql`.
5. **Générer les clés VAPID** (chez toi) : `node scripts/gen-vapid.mjs`.
6. **Enregistrer les secrets** : `npx wrangler secret put VAPID_PUBLIC_KEY` puis `npx wrangler secret put VAPID_PRIVATE_KEY` (colle les valeurs).
7. **Déployer** : `npx wrangler deploy` → note l'URL du Worker (`https://wird-push.<ton-compte>.workers.dev`).
8. **Vérifier le Cron** : Cloudflare › Workers & Pages › `wird-push` › Settings › Trigger Events › Cron Triggers → `*/15 * * * *`.
9. **Brancher l'app** : Cloudflare Pages › ton projet › Settings › Variables and secrets → `VITE_PUSH_API_URL` (URL du Worker) et `VITE_VAPID_PUBLIC_KEY` (clé publique), puis relance un déploiement.
10. **Tester sur iPhone** (iOS 16.4+) : installe l'app sur l'écran d'accueil, ouvre-la depuis l'icône, Profil › Rappels › *Activer les rappels*, puis *Envoyer un test depuis le serveur*. Le tableau de bord doit afficher toutes les lignes en vert.

## Contrat d'API (JSON)
`POST /api/subscribe {subscription, prefs, tz}` → `{token}` · `POST /api/prefs|activity|unsubscribe|test|resubscribe` avec en-tête `x-wird-token` et `endpoint` · `GET /api/health` → `{ok, publicKey, lastCron}`.
Données stockées : abonnement Push, préférences, fuseau, date de dernière activité. Jamais de versets ni d'évaluations.

## Limites connues
- La réception réelle d'une notification (service Push d'Apple/Google) ne peut être validée que sur un appareil : le tableau de bord et le test serveur servent à cela.
- Pas de limitation de débit dans le Worker : à ajouter avec les règles Cloudflare (WAF / Rate limiting) si l'URL est exposée publiquement.
