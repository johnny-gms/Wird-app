# WIRD — mémorisation et révision du Coran (PWA)

Application web mobile (React + TypeScript + Vite + Tailwind) : rotation générale continue, renforcement adaptatif,
nouvel apprentissage, sessions interruptibles, progression par sourate / hizb. **Fonctionne sans compte et hors connexion** ;
toutes les données restent sur l'appareil (IndexedDB).

## Lancer

```bash
npm install
npm run dev          # développement : http://localhost:5173
npm run build        # vérification des types + build de production (dist/)
npm run preview      # sert dist/ (service worker actif) : http://localhost:4173
node tests/e2e/serve.mjs   # sert dist/ AVEC les en-têtes de public/_headers (dont la politique de sécurité CSP), comme Cloudflare Pages
npm test             # tests unitaires du moteur (rotation, renforcement, progression, rappels)
npm run test:e2e     # parcours Playwright : lancer d'abord `node tests/e2e/serve.mjs` (voir tests/e2e/smoke.mjs)
```

## Tester sur iPhone
1. Déployez (voir `docs/DEPLOY.md`) ou exposez `npm run preview` sur le réseau local (HTTPS requis pour installer/notifier hors localhost).
2. Safari › Partager › **Sur l'écran d'accueil**. Ouvrez WIRD depuis l'icône.
3. Écran de bienvenue : « Découvrir avec des données de démonstration » (sourates 93–114 mémorisées + apprentissage de la sourate 78, clairement signalés) ou « Commencer » : prénom, sourates déjà apprises, niveau d'apprentissage (Je débute / Intermédiaire / Avancé), rythme de révision (pages, Hizb ou Juz par semaine).
4. Parcours conseillé : Accueil › **Mémorisation › Commencer** › travailler (avec ton Mushaf ou avec le téléphone) › évaluer chaque passage (4 choix) › bilan › « Terminé pour aujourd'hui ». Interrompez (✕) puis **Reprendre**. Un verset n'est « à renforcer » que si sa révision est notée « Quelques hésitations » ou moins ; il reste de toute façon dans la rotation.
5. **Mon Wird** : les 114 sourates et le Coran numérique (lecteur de pages plein écran : glisser pour tourner, double tap pour zoomer). **Révisions** : le programme du jour, ce qui arrive, les apprentissages.
6. Mode avion : l'app reste utilisable. *Profil › Paramètres › Données* : export/import JSON, remise à zéro.

Documentation : `docs/ARCHITECTURE.md`, `docs/NOTIFICATIONS.md`, `docs/DEPLOY.md`, `docs/FEATURES.md`.

## Sources de données
Texte uthmani, noms et nombres de versets : paquet *quran-json* (CC BY 4.0). Hizb : *quran-meta* (MIT). Régénération : `npm run build:data`.
