# Architecture

```
src/
  engine/        Logique pure, sans UI, testée (vitest)
    config.ts      intervalles de renforcement, tailles, seuils — UN seul endroit à modifier
    scheduling.ts  évaluation d'un verset (solidité, renforcement)
    rotation.ts    rotation générale continue (sens, curseur, découpage en parts égales)
    plan.ts        programme du jour, évaluation d'un élément, objectifs d'apprentissage
    progress.ts    sourates, hizb, régularité ; reports.ts : bilans semaine/mois
  data/          surahs.generated.ts (114 sourates, 60 hizb) — généré par scripts/build-data.mjs
  storage/db.ts  wrapper IndexedDB (clé/valeur) ; store/useWird.ts : état (Zustand) + persistance par tranche
  sync/outbox.ts file d'attente d'évènements vers le serveur (réseau absent = reporté) ; point d'extension de la sync multi-appareils
  notifications/ client Push (état honnête), rules.ts (règles de rappel pures, partagées avec le Worker)
  screens/ components/  interface ; sw.ts service worker (précache + Push)
worker/          squelette Cloudflare Worker + schéma D1 (non déployé)
```

**Modèle** : identifiant de verset stable = numéro global 1..6236. `VerseState` (statut learning/memorized, solidité 0–100,
`fragile`, `reinforceDue`, dernière note), `LearningGoal`, `DailyPlan` (éléments pending / in_progress / done / skipped),
`HistoryEntry`, `RotationState` (curseur + tours), `PersonalGoal`, `Settings` (dont préférences de notification).

**Deux mécanismes distincts** : la *rotation* (curseur, ne retire jamais un verset) et le *renforcement* (`fragile` + `reinforceDue`,
piloté par la note). Aucune dette : un nouveau jour reconstruit le programme ; l'ancien est archivé (`dayLog`) sans report.

**Authentification / sync futures** : ajouter un `userId` au profil et un `SyncAdapter` consommant l'état persistant
(`PersistedState`) et l'outbox ; les identifiants de versets sont déjà stables entre appareils.
