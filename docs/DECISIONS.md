
## V1.2 — alignement visuel sur la référence (johnny-gms.github.io/Wird)
- **Appliqué** : palette exacte (crème `#f9f5ec`, cartes `#fffdf8`, vert `#1f4d3a`, états vert/bleu/ambre/neutre), carte « héros » en dégradé vert avec bouton blanc, titres serif (Iowan Old Style/Palatino), libellés de section en capitales grises, pastilles crème (onglets, filtres), cartes à fine bordure et ombre douce, navigation à icônes fines, écran de démarrage et icônes de la référence (livre ouvert + arche), thème sombre de la référence, police du Coran Amiri Quran. Polices système pour l'interface (plus de polices web : plus léger).
- **Non repris (conflit avec la spécification)** : la référence a 5 onglets (Mémorisation, Révisions séparés) ; WIRD garde **4 onglets** (Accueil, Mon Wird, Progression, Profil), décision initiale. Le tutoiement de la référence n'est pas repris (WIRD vouvoie).

## V1.3 — tableau de progression aligné sur la référence
- L'onglet Progression devient **une seule page** comme « Ma progression » de la référence : vue d'ensemble (2×2 + 3 tuiles), évolution avec pastilles 7 jours / 30 jours / 90 jours / Tout (courbe, séances par semaine, temps consacré, évaluations, régularité en pastilles), versets à renforcer, objectif de la semaine, bilan semaine/mois, historique.
- **Conservé en plus** (exigé par la spécification, absent de la référence) : suivi des hizb, objectifs personnels, lien vers le tableau des 114 sourates.
- **Adaptations** : « versets » au lieu de « passages » ; tuile « pages mémorisées » à la place de « versets mémorisés » (le nombre de versets n'est pas une statistique principale) ; « temps actif mesuré » au lieu de « estimé » ; l'objectif de jours par semaine n'est affiché que s'il a été défini (aucun objectif imposé).
- Les anciennes URL `/progression/<onglet>` redirigent vers `/progression`.

## Synchronisation multi-appareils (état : moteur et serveur prêts, non activés)
- Fusion **par enregistrement** (verset, objectif, corbeille, réglage, profil, rotation, évaluation) avec une horloge hybride (HLC) : la modification la plus récente gagne, les suppressions sont propagées, l'historique est fusionné (aucune évaluation perdue), rien n'est renvoyé en écho. Code : `src/sync/{hlc,records,merge,engine}.ts`, testé avec deux appareils simulés.
- Serveur : `/api/sync/push|pull` (`worker/src/sync.ts`, table `sync_records`), isolés par compte. Sans authentificateur branché, ils répondent 501 `auth_not_configured`.
- **Non activée dans l'application** tant que la connexion Google / Apple n'existe pas (reportée à ta demande). Programme du jour et séance en cours restent propres à chaque appareil.
- Reste à faire à l'activation : brancher `SyncEngine.track` sur la persistance, persister `meta`/`cursor`, déclencher `sync` au retour réseau, ajouter l'authentificateur Google/Apple.
