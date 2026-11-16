// Génère les données statiques du Coran. Sources (toutes vérifiées à chaque exécution) :
//  - data/tanzil/quran-uthmani-min.xml (Tanzil, Uthmani Minimal v1.1, CC BY 3.0) : TEXTE ARABE (source unique du texte, non modifié)
//  - data/tanzil/quran-data.xml (Tanzil métadonnées v1.0, CC BY)                  : sourates, Hizb (quarts), pages du Mushaf de Médine
//  - quran-json (CC BY 4.0)  : translittération et titres français des sourates (affichage uniquement)
//  - quran-meta (MIT)        : recoupement indépendant des Hizb et des pages (le build échoue en cas d'écart)
// Usage : node scripts/build-data.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PageList, getRubAlHizbMeta } from 'quran-meta/hafs';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const fail = (m) => {
  throw new Error('INTÉGRITÉ : ' + m);
};

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], unesc(m[2])]));

// ---------- 1. Texte : Tanzil Uthmani Minimal ----------
const xml = read('data/tanzil/quran-uthmani-min.xml');
const header = xml.match(/<!--([\s\S]*?)-->/)?.[1].trim() ?? fail('bloc de copyright absent');
if (!/Uthmani Minimal, Version 1\.1/.test(header)) fail('version Tanzil inattendue');
if (!/Creative Commons Attribution 3\.0/.test(header)) fail('licence absente');
if (!/CHANGING IT IS NOT ALLOWED/.test(header)) fail("conditions d'utilisation absentes");

const verses = [];
let bismillah = '';
const bismillahVariants = {};
for (const m of xml.matchAll(/<sura\b([^>]*)>([\s\S]*?)<\/sura>/g)) {
  const sIdx = Number(attrs(m[1]).index);
  if (sIdx !== verses.length + 1) fail('sourates non contiguës : ' + sIdx);
  const list = [];
  for (const a of m[2].matchAll(/<aya\b([^>]*?)\/>/g)) {
    const at = attrs(a[1]);
    if (Number(at.index) !== list.length + 1) fail(`numérotation rompue ${sIdx}:${at.index}`);
    if (!at.text) fail(`verset vide ${sIdx}:${at.index}`);
    list.push(at.text);
    if (at.bismillah !== undefined) {
      if (Number(at.index) !== 1 || sIdx === 1 || sIdx === 9) fail('Basmala inattendue ' + sIdx);
      if (!bismillah) bismillah = at.bismillah;
      else if (at.bismillah !== bismillah) bismillahVariants[sIdx] = at.bismillah;
    }
  }
  verses.push(list);
}
if (verses.length !== 114) fail('114 sourates attendues');
const total = verses.reduce((a, v) => a + v.length, 0);
if (total !== 6236) fail('6236 versets attendus, trouvé ' + total);
if (verses[0][0] !== bismillah) fail('1:1 doit être la Basmala');

// ---------- 2. Métadonnées Tanzil (sourates, Hizb, pages) ----------
const meta = read('data/tanzil/quran-data.xml');
const tsuras = [...meta.matchAll(/<sura\b([^>]*)\/>/g)].map((m) => attrs(m[1]));
if (tsuras.length !== 114) fail('métadonnées : 114 sourates attendues');
const section = (name) => [...(meta.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '').matchAll(/<\w+\b([^>]*)\/>/g)].map((m) => attrs(m[1]));
const quarters = section('hizbs');
const pages = section('pages');
if (quarters.length !== 240) fail('240 quarts de Hizb attendus');
if (pages.length !== 604) fail('604 pages attendues');
tsuras.forEach((s, i) => {
  if (Number(s.ayas) !== verses[i].length) fail('nombre de versets incohérent (sourate ' + (i + 1) + ')');
});

// ---------- 3. Noms (affichage) ----------
const dist = require.resolve('quran-json/package.json').replace('package.json', 'dist/');
const names = JSON.parse(readFileSync(dist + 'quran.json', 'utf8'));
const fr = JSON.parse(readFileSync(dist + 'chapters/fr/index.json', 'utf8'));
const surahs = tsuras.map((s, i) => {
  if (names[i].name !== s.name) fail('nom arabe différent, sourate ' + (i + 1));
  return { id: i + 1, ar: s.name, tr: names[i].transliteration, fr: fr[i].translation, n: Number(s.ayas), t: s.type === 'Meccan' ? 'M' : 'D' };
});

const before = [0];
surahs.forEach((s, i) => before.push(before[i] + s.n));
const gid = (sura, aya) => before[sura - 1] + aya;
const hizbStarts = Array.from({ length: 60 }, (_, h) => [Number(quarters[h * 4].sura), Number(quarters[h * 4].aya)]);
const pageStarts = pages.map((p) => gid(Number(p.sura), Number(p.aya)));
if (pageStarts[0] !== 1) fail('la page 1 doit commencer à 1:1');

// ---------- 4. Recoupement indépendant (quran-meta) ----------
hizbStarts.forEach(([s, a], h) => {
  const [ms, ma] = getRubAlHizbMeta(h * 4 + 1).first;
  if (ms !== s || ma !== a) fail(`Hizb ${h + 1} : Tanzil ${s}:${a} ≠ quran-meta ${ms}:${ma}`);
});
pageStarts.forEach((id, i) => {
  if (PageList[i + 1] !== id) fail('page ' + (i + 1) + ' différente de quran-meta');
});

// ---------- 5. Sorties ----------
const sha = createHash('sha256').update(readFileSync(new URL('data/tanzil/quran-uthmani-min.xml', root))).digest('hex');
writeFileSync(
  new URL('src/data/surahs.generated.ts', root),
  `// FICHIER GÉNÉRÉ par scripts/build-data.mjs — ne pas modifier à la main.
// Sources : Tanzil (métadonnées v1.0, CC BY), quran-json (CC BY 4.0, noms), recoupé avec quran-meta (MIT).
export interface SurahMeta {
  id: number;
  ar: string;
  tr: string;
  fr: string;
  n: number;
  t: 'M' | 'D';
}
export const SURAHS: SurahMeta[] = ${JSON.stringify(surahs)};
/** Premier verset [sourate, verset] de chacun des 60 Hizb. */
export const HIZB_STARTS: [number, number][] = ${JSON.stringify(hizbStarts)};
/** Id global du premier verset de chacune des 604 pages du Mushaf de Médine. */
export const PAGE_STARTS: number[] = ${JSON.stringify(pageStarts)};
`,
);
writeFileSync(
  new URL('public/data/quran-uthmani.json', root),
  JSON.stringify({
    v: 3,
    source: 'Tanzil Quran Text (Uthmani Minimal, Version 1.1) — tanzil.net — CC BY 3.0',
    sha256: sha,
    license: header,
    bismillah,
    bismillahVariants,
    s: verses,
  }),
);
console.log(`OK ${surahs.length} sourates, ${total} versets, ${hizbStarts.length} Hizb, ${pageStarts.length} pages ; sha256 ${sha.slice(0, 12)}… ; variantes Basmala : ${Object.keys(bismillahVariants).join(',') || 'aucune'}`);
