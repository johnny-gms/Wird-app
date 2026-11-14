// Aligne les annotations de tajwid (data/tajweed, texte Quran.com) sur le texte Tanzil affiché par WIRD,
// et écrit public/data/tajweed.json : par verset, des plages [début, fin, règle] en positions de points de code du texte Tanzil.
// Le texte Tanzil n'est jamais modifié. Usage : node scripts/build-tajweed.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const quran = JSON.parse(readFileSync(new URL('public/data/quran-uthmani.json', root), 'utf8'));
const legend = JSON.parse(readFileSync(new URL('data/tajweed/index.json', root), 'utf8')).legend;
const fail = (m) => { throw new Error('TAJWID : ' + m); };

// Règles affichées, par ordre de priorité (la première présente sur une lettre gagne), regroupées en 6 familles de couleurs.
const PRIORITY = ['madda_necessary', 'madda_obligatory', 'madda_permissible', 'madda_normal', 'qalaqah', 'tafkhim', 'iqlab', 'idgham_ghunnah', 'idgham_shafawi', 'idgham_wo_ghunnah', 'idgham_mutajanisayn', 'idgham_mutaqaribayn', 'ikhafa', 'ikhafa_shafawi', 'ghunnah', 'ham_wasl', 'laam_shamsiyah', 'slnt'];
const FAMILY = {
  madda_necessary: 'madd-6', madda_obligatory: 'madd-6', madda_permissible: 'madd-jaiz', madda_normal: 'madd-2',
  qalaqah: 'qalqala', tafkhim: 'tafkhim',
  iqlab: 'ghunna', idgham_ghunnah: 'ghunna', idgham_shafawi: 'ghunna', ikhafa: 'ghunna', ikhafa_shafawi: 'ghunna', ghunnah: 'ghunna',
  idgham_wo_ghunnah: 'silent', idgham_mutajanisayn: 'silent', idgham_mutaqaribayn: 'silent', ham_wasl: 'silent', laam_shamsiyah: 'silent', slnt: 'silent',
};
const FAMILIES = ['madd-6', 'madd-jaiz', 'madd-2', 'ghunna', 'silent', 'qalqala', 'tafkhim'];

// Squelette consonantique pour l'alignement : on ignore diacritiques, tatweel et variantes d'alef.
const MARK = /[\s​-‏ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/;
const norm = (ch) => {
  if (MARK.test(ch)) return '';
  if ('ٱآأإا'.includes(ch)) return 'ا';
  if (ch === 'ى' || ch === 'ی') return 'ي';
  if (ch === 'ة') return 'ه';
  return ch;
};

function align(a, b) {
  // plus longue sous-séquence commune sur les lettres de base ; renvoie pour chaque index de b l'index de a apparié (ou -1)
  const A = a.map((c, i) => [norm(c), i]).filter((x) => x[0]);
  const B = b.map((c, i) => [norm(c), i]).filter((x) => x[0]);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i][0] === B[j][0] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const map = new Array(b.length).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i][0] === B[j][0]) { map[B[j][1]] = A[i][1]; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { map, ratio: m ? dp[0][0] / m : 1, n: m };
}

const out = {};
const weak = [];
let worst = 1, total = 0, matched = 0;
for (let s = 1; s <= 114; s++) {
  const file = JSON.parse(readFileSync(new URL(`data/tajweed/surah_${String(s).padStart(3, '0')}.json`, root), 'utf8'));
  if (file.ayahs.length !== quran.s[s - 1].length) fail(`sourate ${s} : nombre de versets différent`);
  file.ayahs.forEach((ay, k) => {
    const src = [];
    const rules = [];
    for (const [text, codes] of ay.s) for (const ch of text) { src.push(ch); rules.push(codes.map((c) => legend[c])); }
    const dst = [...quran.s[s - 1][k]];
    const { map, ratio, n } = align(src, dst);
    total += n; matched += Math.round(ratio * n);
    worst = Math.min(worst, ratio);
    if (ratio < 0.85) fail(`alignement insuffisant ${s}:${k + 1} (${(ratio * 100).toFixed(1)} %)`);
    if (ratio < 0.97) weak.push(`${s}:${k + 1}`);
    // règle retenue par grappe (lettre + marques qui la suivent) : union des règles de la grappe source appariée
    const srcSet = new Map();
    let cur = -1;
    src.forEach((ch, i) => {
      if (norm(ch)) { cur = i; srcSet.set(i, new Set(rules[i])); }
      else if (cur >= 0 && MARK.test(ch) && !/[\s\u200B-\u200F]/.test(ch)) rules[i].forEach((r) => srcSet.get(cur).add(r));
    });
    const fam = new Array(dst.length).fill(-1);
    let famNow = -1;
    for (let p = 0; p < dst.length; p++) {
      if (norm(dst[p])) {
        famNow = -1;
        if (map[p] >= 0) {
          const set = srcSet.get(map[p]);
          const top = PRIORITY.find((x) => set.has(x));
          if (top) famNow = FAMILIES.indexOf(FAMILY[top]);
        }
        fam[p] = famNow;
      } else if (MARK.test(dst[p]) && !/[\s\u200B-\u200F]/.test(dst[p])) fam[p] = famNow;
      else famNow = -1;
    }
    const spans = [];
    for (let p = 0; p < dst.length; ) {
      if (fam[p] < 0) { p++; continue; }
      let e = p + 1;
      while (e < dst.length && fam[e] === fam[p]) e++;
      spans.push(p, e, fam[p]);
      p = e;
    }
    if (spans.length) out[`${s}:${k + 1}`] = spans;
  });
}
writeFileSync(new URL('public/data/tajweed.json', root), JSON.stringify({ v: 1, families: FAMILIES, spans: out }));
console.log(`versets à alignement partiel (< 97 %) : ${weak.length}`);
console.log(`OK tajwid : ${Object.keys(out).length} versets annotés, alignement ${(matched / total * 100).toFixed(2)} % (pire verset ${(worst * 100).toFixed(1)} %)`);
