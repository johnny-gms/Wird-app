// Vérifie la traduction française (data/translations) contre le texte Tanzil et écrit public/data/translation-fr.json.
// Usage : node scripts/build-translation.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const quran = JSON.parse(readFileSync(new URL('public/data/quran-uthmani.json', root), 'utf8'));
const fr = JSON.parse(readFileSync(new URL('data/translations/fr.hamidullah.json', root), 'utf8'));
const fail = (m) => { throw new Error('TRADUCTION : ' + m); };
if (fr.length !== 114) fail('114 sourates attendues');
fr.forEach((s, i) => {
  if (s.length !== quran.s[i].length) fail(`sourate ${i + 1} : ${s.length} traductions pour ${quran.s[i].length} versets`);
  s.forEach((t, k) => { if (typeof t !== 'string' || !t.trim()) fail(`traduction vide ${i + 1}:${k + 1}`); });
});
writeFileSync(new URL('public/data/translation-fr.json', root), JSON.stringify({ v: 1, source: 'Muhammad Hamidullah (fr.hamidullah, Tanzil.net)', s: fr }));
console.log(`OK traduction : ${fr.reduce((a, s) => a + s.length, 0)} versets alignés sur Tanzil`);
