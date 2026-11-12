import { ENGINE } from './config';
import { fromAyahId, hizbOf } from './quran';

export interface Chunk {
  surah: number;
  from: number;
  to: number;
  /** Dernier verset (id global) dans le sens de parcours : la rotation reprendra après lui. */
  endCursor: number;
  /** Ce morceau ouvre un nouveau tour de rotation. */
  wraps: boolean;
  ids: number[];
}

/**
 * Prochain morceau de la rotation générale : versets mémorisés contigus d'une même sourate ET d'un même Hizb.
 * La rotation avance toujours du début vers la fin : Hizb 1, puis 2, … puis 60, puis recommence.
 * - `memorized` : ids triés croissants.
 * - `cursor`    : dernier verset révisé (null = début).
 * - `exclude`   : versets déjà couverts aujourd'hui (ex. renforcement).
 */
export function nextChunk(memorized: number[], cursor: number | null, exclude: ReadonlySet<number> = new Set(), size: number = ENGINE.chunkSize): Chunk | null {
  const n = memorized.length;
  if (n === 0) return null;

  let wraps = false;
  let idx = cursor === null ? 0 : firstGreater(memorized, cursor);
  while (idx < n && exclude.has(memorized[idx])) idx++;
  if (idx >= n) {
    idx = 0;
    wraps = cursor !== null;
    while (idx < n && exclude.has(memorized[idx])) idx++;
    if (idx >= n) return null;
  }
  const first = memorized[idx];
  const surah = fromAyahId(first).surah;
  const hizb = hizbOf(first);
  const run = [first];
  for (let j = idx + 1; j < n; j++) {
    const id = memorized[j];
    if (id !== run[run.length - 1] + 1 || exclude.has(id)) break;
    if (fromAyahId(id).surah !== surah || hizbOf(id) !== hizb) break;
    run.push(id);
  }
  const ids = run.slice(0, partSize(run.length, size));
  return toChunk(ids, ids[ids.length - 1], wraps);
}

/** Taille d'une part : on découpe une série contiguë en parts presque égales (pas de reste d'un seul verset). */
export function partSize(runLength: number, max: number): number {
  const parts = Math.ceil(runLength / max);
  return Math.ceil(runLength / parts);
}

function toChunk(ids: number[], endCursor: number, wraps: boolean): Chunk {
  const a = fromAyahId(ids[0]);
  const b = fromAyahId(ids[ids.length - 1]);
  return { surah: a.surah, from: a.ayah, to: b.ayah, endCursor, wraps, ids };
}

function firstGreater(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Regroupe des ids en morceaux contigus (même sourate), de tailles presque égales et ≤ size. */
export function groupRuns(ids: number[], size: number = ENGINE.chunkSize): { surah: number; from: number; to: number; ids: number[] }[] {
  const sorted = [...ids].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const id of sorted) {
    const cur = runs[runs.length - 1];
    if (cur && id === cur[cur.length - 1] + 1 && fromAyahId(id).surah === fromAyahId(cur[0]).surah) cur.push(id);
    else runs.push([id]);
  }
  const out: number[][] = [];
  for (const r of runs) {
    const part = partSize(r.length, size);
    for (let i = 0; i < r.length; i += part) out.push(r.slice(i, i + part));
  }
  return out.map((g) => {
    const a = fromAyahId(g[0]);
    const b = fromAyahId(g[g.length - 1]);
    return { surah: a.surah, from: a.ayah, to: b.ayah, ids: g };
  });
}
