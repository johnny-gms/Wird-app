# État des fonctionnalités V1

| Opérationnel (testé) | Nécessite une configuration / reporté |
|---|---|
| 5 onglets : Accueil, Mon Wird (114 sourates, Coran numérique), Révisions (aujourd'hui / à venir / apprentissage), Progression, Profil ; lecteur de pages du Coran plein écran | Envoi réel des notifications (Worker + D1 + Cron + clés VAPID) |
| 114 sourates, 60 hizb, recherche/filtres, sélection de plages de versets | Synchronisation multi-appareils et authentification (architecture prévue : outbox, ids stables) |
| Rotation continue (2 sens, curseur persistant), renforcement adaptatif (config centralisée), aucune dette | Test sur appareil iOS réel (Push, installation) : à faire par vous |
| Session : récitation → évaluation directe, retour, passer, interrompre/reprendre, bilan | |
| Texte de référence masquable (hors ligne, CC BY 4.0) | |
| Historique, bilans semaine/mois, difficultés récurrentes, objectifs | |
| Hors ligne (service worker), installation PWA, thème clair/sombre/auto | |
| Export/import JSON, remise à zéro, données de démo identifiées | |

Exclusions respectées : pas d'audio, de reconnaissance, d'IA, de social, de classements.
Choix assumé : la solidité est évaluée par plage de versets (un élément = une plage), pas verset par verset.
