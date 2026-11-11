# Notifications (Web Push)

## État
- **Opérationnel côté app** : réglages par catégorie (rappel quotidien, deuxième rappel, travail inachevé, reprise après absence) et horaires,
  demande d'autorisation sur action volontaire, abonnement Push, notification locale de test, états honnêtes
  (non supporté / installation requise sur iPhone / refusé / désactivé / autorisé sans serveur / abonné).
- **Testé** : règles de rappel (`src/notifications/rules.ts`, tests unitaires).
- **Non déployé** : Worker, D1, Cron, envoi Push réel (`worker/`). Tant que `VITE_PUSH_API_URL` et `VITE_VAPID_PUBLIC_KEY` sont absentes,
  l'interface l'indique et **aucune notification automatique n'est envoyée**.

## Mise en service (étape ultérieure)
1. Clés VAPID : `npx web-push generate-vapid-keys`.
2. `npx wrangler d1 create wird-push`, copier `worker/wrangler.toml.example` → `worker/wrangler.toml`, puis `npx wrangler d1 execute wird-push --file=worker/schema.sql`.
3. Secrets : `wrangler secret put VAPID_PRIVATE_KEY` et `VAPID_PUBLIC_KEY` ; variables `ALLOWED_ORIGIN`, `VAPID_SUBJECT`.
4. Implémenter `sendPush` dans `worker/src/index.ts` (chiffrement RFC 8291 + signature VAPID ; ex. `@block65/webcrypto-web-push`), `wrangler deploy`.
5. Variables de build de l'app : `VITE_PUSH_API_URL=https://<worker>` et `VITE_VAPID_PUBLIC_KEY=<clé publique>`, puis redéployer Pages.
6. Tester sur un iPhone avec l'app installée (iOS 16.4+) : Profil › Notifications › Activer › message de test réel via le Cron.

## Contrat d'API
`POST /api/subscribe {subscription, prefs, tz}` · `/api/unsubscribe {endpoint}` · `/api/prefs {endpoint, prefs, tz}` ·
`/api/activity {endpoint, date, at, unfinished, tz}` (stoppe les relances). Seuls abonnement, horaires, fuseau et date de dernière activité sont transmis.
