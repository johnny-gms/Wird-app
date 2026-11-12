import { HIZB_STARTS, SURAHS, type SurahMeta } from '@/data/surahs.generated';

export { SURAHS, HIZB_STARTS };
export type { SurahMeta };

export const TOTAL_VERSES = 6236;

/** Premier id global de chaque sourate (index = numéro de sourate). */
const OFFSETS: number[] = (() => {
  const o = [0, 0];
  let acc = 0;
  for (let i = 0; i < SURAHS.length; i++) {
    o[i + 1] = acc; // id global du verset 0 de la sourate i+1
    acc += SURAHS[i].n;
  }
  return o;
})();

export function surahMeta(n: number): SurahMeta {
  return SURAHS[n - 1];
}

/** (sourate, verset) -> id global stable. */
export function ayahId(surah: number, ayah: number): number {
  return OFFSETS[surah] + ayah;
}

/** id global -> (sourate, verset). */
export function fromAyahId(id: number): { surah: number; ayah: number } {
  let lo = 1;
  let hi = 114;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (OFFSETS[mid] < id) lo = mid;
    else hi = mid - 1;
  }
  return { surah: lo, ayah: id - OFFSETS[lo] };
}

export function surahRange(surah: number): [number, number] {
  return [ayahId(surah, 1), ayahId(surah, surahMeta(surah).n)];
}

/** « Sourate 2 — versets 5 à 9 » / « Sourate 2 — verset 5 ». */
export function rangeLabel(surah: number, from: number, to: number): string {
  return from === to ? `Sourate ${surah} — verset ${from}` : `Sourate ${surah} — versets ${from} à ${to}`;
}

const HIZB_START_IDS: number[] = HIZB_STARTS.map(([s, a]) => ayahId(s, a));

/** Numéro de Hizb (1..60) d'un verset. */
export function hizbOf(id: number): number {
  let lo = 0;
  let hi = HIZB_START_IDS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (HIZB_START_IDS[mid] <= id) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Plage d'ids globaux d'un hizb. */
export function hizbRange(h: number): [number, number] {
  const [s, a] = HIZB_STARTS[h - 1];
  const start = ayahId(s, a);
  if (h === 60) return [start, TOTAL_VERSES];
  const [s2, a2] = HIZB_STARTS[h];
  return [start, ayahId(s2, a2) - 1];
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'moins d’une minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')}`;
}
