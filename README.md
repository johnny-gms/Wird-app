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
npm test             # tests unitaires du moteur (rotation, renforcement, progression, rappels)
npm run test:e2e     # parcours Playwright (nécessite build + preview, voir tests/e2e/)
```

## Tester sur iPhone
1. Déployez (voir `docs/DEPLOY.md`) ou exposez `npm run preview` sur le réseau local (HTTPS requis pour installer/notifier hors localhost).
2. Safari › Partager › **Sur l'écran d'accueil**. Ouvrez WIRD depuis l'icône.
3. Écran de bienvenue : « Essayer avec des données de démonstration » (sourates 93–114 mémorisées + apprentissage de la sourate 78, clairement signalés) ou « Commencer » à vide, puis *Mon Wird › Mes sourates* pour indiquer ce que vous avez déjà mémorisé.
4. Parcours conseillé : Accueil › **Commencer mon Wird** › réciter › *J'ai terminé* › évaluer (4 choix). Interrompez (✕) puis **Reprendre**. Évaluez « Non maîtrisé » : le verset revient en *Renforcement* dès le lendemain tout en restant dans la rotation.
5. Mode avion : l'app reste utilisable. *Profil › Données* : export/import JSON, remise à zéro.

Documentation : `docs/ARCHITECTURE.md`, `docs/NOTIFICATIONS.md`, `docs/DEPLOY.md`, `docs/FEATURES.md`.

## Sources de données
Texte uthmani, noms et nombres de versets : paquet *quran-json* (CC BY 4.0). Hizb : *quran-meta* (MIT). Régénération : `npm run build:data`.
