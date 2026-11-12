// Génère les données statiques du Coran à partir de sources publiques :
//  - data/tanzil/quran-uthmani.txt (Tanzil.net, CC BY 3.0, v1.0.2) : TEXTE ARABE (source unique du texte)
//  - quran-json (CC-BY-4.0) : noms des sourates (translittération, titre français)
//  - quran-meta (MIT)       : hizb (rub' al-hizb) et pages du Mushaf de Médine (Hafs)
// Usage : node scripts/build-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PageList, getRubAlHizbMeta } from 'quran-meta/hafs';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const dist = require.resolve('quran-json/package.json').replace('package.json', 'dist/');
const quran = JSON.parse(readFileSync(dist + 'quran.json', 'utf8')); // uniquement pour les noms
const fr = JSON.parse(readFileSync(dist + 'chapters/fr/index.json', 'utf8'));

if (quran.length !== 114) throw new Error('114 sourates attendues');
const surahs = quran.map((s, i) => {
  return {
    id: s.id,
    ar: s.name,
    tr: s.transliteration,
    fr: fr[i].translation,
    n: s.total_verses,
    t: s.type === 'meccan' ? 'M' : 'D',
  };
});
const total = surahs.reduce((a, s) => a + s.n, 0);
if (total !== 6236) throw new Error('6236 versets attendus, trouvé ' + total);

// Début de chaque hizb = premier verset du 1er quart (rub' 1, 5, 9, ...)
const hizbStarts = [];
for (let h = 1; h <= 60; h++) {
  const [s, a] = getRubAlHizbMeta((h - 1) * 4 + 1).first;
  hizbStarts.push([s, a]);
}

const ts = `// FICHIER GÉNÉRÉ par scripts/build-data.mjs — ne pas modifier à la main.
// Sources : quran-json (CC-BY-4.0), quran-meta (MIT).
export interface SurahMeta {
  id: number;
  ar: string;
  tr: string;
  fr: string;
  n: number;
  t: 'M' | 'D';
}
export const SURAHS: SurahMeta[] = ${JSON.stringify(surahs)};
/** Premier verset [sourate, verset] de chacun des 60 hizb. */
export const HIZB_STARTS: [number, number][] = ${JSON.stringify(hizbStarts)};
`;
writeFileSync(new URL('src/data/surahs.generated.ts', root), ts);

// ---- Texte : Tanzil (format « sourate|verset|texte »). Le texte n'est jamais modifié. ----
// Particularité du format Tanzil : la Basmala est écrite en tête du verset 1 de chaque sourate (sauf Al-Fatiha, où elle EST
// le verset 1, et At-Tawba, qui n'en a pas). Elle n'est pas un verset de ces sourates : on la sépare (4 premiers mots),
// sans toucher à un seul caractère, afin que la numérotation des versets reste exacte (6 236 versets).
const raw = readFileSync(new URL('data/tanzil/quran-uthmani.txt', root), 'utf8').split(/\r?\n/);
const header = raw.filter((l) => l.startsWith('#')).join('\n');
const rows = raw.filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
  const i = l.indexOf('|');
  const j = l.indexOf('|', i + 1);
  return [Number(l.slice(0, i)), Number(l.slice(i + 1, j)), l.slice(j + 1)];
});
if (rows.length !== 6236) throw new Error('6236 versets attendus, trouvé ' + rows.length);
const verses = Array.from({ length: 114 }, () => []);
for (const [s, a, t] of rows) {
  if (verses[s - 1].length + 1 !== a) throw new Error(`numérotation rompue ${s}:${a}`);
  verses[s - 1].push(t);
}
verses.forEach((v, i) => { if (v.length !== surahs[i].n) throw new Error('nombre de versets différent, sourate ' + (i + 1)); });

const basmala = verses[0][0]; // 1:1
const baseWords = basmala.split(' ');
const bismillahVariants = {}; // sourates dont la Basmala diffère de 1:1 par ses diacritiques (95, 97 dans ce fichier)
for (let i = 1; i < 114; i++) {
  const sNum = i + 1;
  if (sNum === 9) continue;
  const words = verses[i][0].split(' ');
  const prefix = words.slice(0, 4);
  // contrôle : mêmes 3 derniers mots que la Basmala de référence (le 1er peut porter une variante de diacritiques)
  if (prefix.slice(1).join(' ') !== baseWords.slice(1).join(' ')) throw new Error('Basmala inattendue, sourate ' + sNum);
  const p = prefix.join(' ');
  if (p !== basmala) bismillahVariants[sNum] = p;
  verses[i][0] = words.slice(4).join(' ');
  if (!verses[i][0]) throw new Error('verset 1 vide après séparation, sourate ' + sNum);
}
const text = {
  v: 2,
  source: 'Tanzil Quran Text (Uthmani, version 1.0.2) — tanzil.net — CC BY 3.0',
  license: header,
  bismillah: basmala,
  bismillahVariants,
  s: verses,
};
writeFileSync(new URL('public/data/quran-uthmani.json', root), JSON.stringify(text));

// Pages du Mushaf de Médine (604) : id global du 1er verset de chaque page
const pageStarts = PageList.slice(1, 605);
if (pageStarts.length !== 604 || pageStarts[0] !== 1) throw new Error('pages inattendues');
const ts2 = readFileSync(new URL('src/data/surahs.generated.ts', root), 'utf8') +
  `/** Id global du premier verset de chacune des 604 pages du Mushaf de Médine (quran-meta, MIT). */\nexport const PAGE_STARTS: number[] = ${JSON.stringify(pageStarts)};\n`;
writeFileSync(new URL('src/data/surahs.generated.ts', root), ts2);
console.log('OK', surahs.length, 'sourates,', total, 'versets,', hizbStarts.length, 'hizb,', pageStarts.length, 'pages ; variantes Basmala :', Object.keys(bismillahVariants).join(','));
