// Génère les données statiques du Coran à partir de sources publiques :
//  - quran-json (CC-BY-4.0) : texte uthmani, noms des sourates, traduction française des titres
//  - quran-meta (MIT)       : découpage en hizb (rub' al-hizb, mushaf de Médine / Hafs)
// Usage : node scripts/build-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getRubAlHizbMeta } from 'quran-meta/hafs';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const dist = require.resolve('quran-json/package.json').replace('package.json', 'dist/');
const quran = JSON.parse(readFileSync(dist + 'quran.json', 'utf8'));
const fr = JSON.parse(readFileSync(dist + 'chapters/fr/index.json', 'utf8'));

if (quran.length !== 114) throw new Error('114 sourates attendues');
const surahs = quran.map((s, i) => {
  if (s.total_verses !== s.verses.length) throw new Error('verset manquant ' + s.id);
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

const text = { v: 1, s: quran.map((s) => s.verses.map((v) => v.text)) };
writeFileSync(new URL('public/data/quran-uthmani.json', root), JSON.stringify(text));
console.log('OK', surahs.length, 'sourates,', total, 'versets,', hizbStarts.length, 'hizb');
