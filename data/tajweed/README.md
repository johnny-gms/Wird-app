# Données de tajwid

Fichiers `surah_*.json` et `index.json` : copie non modifiée du paquet npm `react-native-quran-tajweed` v0.1.3 (licence MIT, voir `LICENSE`).
Origine déclarée par ce paquet : champ `text_uthmani_tajweed` de l'API Quran.com, prétraité, avec tafkhim/tarqiq calculés par le projet.

WIRD n'affiche JAMAIS ce texte : le texte affiché reste celui de Tanzil (`data/tanzil/`). `scripts/build-tajweed.mjs` aligne lettre par lettre
ces annotations sur le texte Tanzil et n'en garde que les positions + la règle (`public/data/tajweed.json`).
