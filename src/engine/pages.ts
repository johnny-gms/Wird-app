import { PAGE_STARTS } from '@/data/surahs.generated';
import { TOTAL_VERSES, ayahId } from './quran';

/**
 * Pages du Mushaf de Médine (604). Une « page » d'objectif = une page de ce Mushaf.
 * Les pages n'ont pas la même longueur : le poids d'un verset est 1 / (nombre de versets de la page où il commence).
 * C'est une approximation (par nombre de versets, faute de données de lignes) mais elle est stable et cohérente :
 * la somme des poids des versets d'une page vaut exactement 1.
 */
export const TOTAL_PAGES = PAGE_STARTS.length;

const WEIGHTS: Float64Array = (() => {
  const w = new Float64Array(TOTAL_VERSES + 1);
  for (let p = 0; p < PAGE_STARTS.length; p++) {
    const start = PAGE_STARTS[p];
    const end = p + 1 < PAGE_STARTS.length ? PAGE_STARTS[p + 1] - 1 : TOTAL_VERSES;
    const n = end - start + 1;
    for (let id = start; id <= end; id++) w[id] = 1 / n;
  }
  return w;
})();

export const verseWeight = (id: number): number => WEIGHTS[id] ?? 0;

/** Numéro de page (1..604) où commence un verset. */
export function pageOf(id: number): number {
  let lo = 0;
  let hi = PAGE_STARTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (PAGE_STARTS[mid] <= id) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function idsPages(ids: Iterable<number>): number {
  let s = 0;
  for (const id of ids) s += WEIGHTS[id] ?? 0;
  return s;
}

export function rangePages(surah: number, from: number, to: number): number {
  let s = 0;
  for (let a = from; a <= to; a++) s += WEIGHTS[ayahId(surah, a)] ?? 0;
  return s;
}

/** « 0,4 page », « 1,5 page », « 12 pages » (une décimale sous 10 pages, pour rester fidèle aux quantités réelles). */
export function formatPages(p: number): string {
  if (p <= 0) return '0 page';
  if (p < 0.05) return 'moins de 0,1 page';
  const r = p < 10 ? Math.round(p * 10) / 10 : Math.round(p);
  const s = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(r);
  return `${s} ${r > 1 ? 'pages' : 'page'}`;
}
