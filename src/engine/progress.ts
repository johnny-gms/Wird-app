import { ENGINE } from './config';
import { addDays, diffDays } from './dates';
import { rangePages, verseWeight } from './pages';
import { HIZB_STARTS, SURAHS, TOTAL_VERSES, ayahId, fromAyahId, hizbRange, surahMeta } from './quran';
import type { HistoryEntry, VerseState } from './types';

export type SurahState = 'none' | 'learning' | 'partial' | 'complete';

export interface SurahStats {
  surah: number;
  total: number;
  memorized: number;
  learning: number;
  fragile: number;
  /** versets mémorisés non révisés depuis longtemps */
  stale: number;
  state: SurahState;
  /** A des versets mémorisés mais en retard de révision. */
  needsMaintenance: boolean;
  needsReinforcement: boolean;
}

export function surahStats(verses: Record<number, VerseState>, surah: number, today: string): SurahStats {
  const n = surahMeta(surah).n;
  let memorized = 0;
  let learning = 0;
  let fragile = 0;
  let stale = 0;
  for (let a = 1; a <= n; a++) {
    const v = verses[ayahId(surah, a)];
    if (!v) continue;
    if (v.status === 'learning') learning++;
    else {
      memorized++;
      if (v.fragile) fragile++;
      const ref = v.lastReviewedAt ?? v.addedAt;
      if (diffDays(ref, today) > ENGINE.maintainAfterDays) stale++;
    }
  }
  const state: SurahState = memorized === n ? 'complete' : memorized > 0 ? 'partial' : learning > 0 ? 'learning' : 'none';
  return { surah, total: n, memorized, learning, fragile, stale, state, needsMaintenance: stale > 0, needsReinforcement: fragile > 0 };
}

export function allSurahStats(verses: Record<number, VerseState>, today: string): SurahStats[] {
  return SURAHS.map((s) => surahStats(verses, s.id, today));
}

export interface HizbStats {
  hizb: number;
  total: number;
  memorized: number;
  ratio: number;
  complete: boolean;
}

export function allHizbStats(verses: Record<number, VerseState>): HizbStats[] {
  // sommes préfixes des versets mémorisés
  const prefix = new Array<number>(TOTAL_VERSES + 1).fill(0);
  for (let i = 1; i <= TOTAL_VERSES; i++) prefix[i] = prefix[i - 1] + (verses[i]?.status === 'memorized' ? 1 : 0);
  return HIZB_STARTS.map((_, i) => {
    const [a, b] = hizbRange(i + 1);
    const total = b - a + 1;
    const memorized = prefix[b] - prefix[a - 1];
    return { hizb: i + 1, total, memorized, ratio: memorized / total, complete: memorized === total };
  });
}

export interface Overall {
  memorizedVerses: number;
  learningVerses: number;
  /** Part du Coran mémorisée (0..1). Affichée en pourcentage, jamais comme compteur principal. */
  ratio: number;
  surahsWorked: number;
  surahsComplete: number;
  hizbCovered: number;
  fragileVerses: number;
}

export function overall(verses: Record<number, VerseState>, today: string): Overall {
  let memorizedVerses = 0;
  let learningVerses = 0;
  let fragileVerses = 0;
  for (const k in verses) {
    const v = verses[k];
    if (v.status === 'memorized') {
      memorizedVerses++;
      if (v.fragile) fragileVerses++;
    } else learningVerses++;
  }
  const ss = allSurahStats(verses, today);
  return {
    memorizedVerses,
    learningVerses,
    ratio: memorizedVerses / TOTAL_VERSES,
    surahsWorked: ss.filter((s) => s.state !== 'none').length,
    surahsComplete: ss.filter((s) => s.state === 'complete').length,
    hizbCovered: allHizbStats(verses).filter((h) => h.complete).length,
    fragileVerses,
  };
}

// ---------- Régularité ----------

export function activeDaySet(history: HistoryEntry[]): Set<string> {
  return new Set(history.map((h) => h.date));
}

/** Série en cours. Si aujourd'hui n'est pas encore travaillé, la série d'hier n'est pas cassée. */
export function currentStreak(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function activeDaysIn(days: Set<string>, from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (days.has(d)) n++;
  return n;
}

/** Versets travaillés par jour sur les N derniers jours (ancien -> récent). */
export function volumeByDay(history: HistoryEntry[], today: string, n: number): { date: string; verses: number }[] {
  const map = new Map<string, number>();
  for (const h of history) map.set(h.date, (map.get(h.date) ?? 0) + (h.to - h.from + 1));
  const out: { date: string; verses: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    out.push({ date: d, verses: map.get(d) ?? 0 });
  }
  return out;
}

// ---------- Vue des 114 sourates ----------

/**
 * État visuel d'une sourate (tableau des 114 cases). Dérivé uniquement des données réelles :
 *  - reinforce : au moins un verset mémorisé est dans le circuit de renforcement (fragile) ;
 *  - learned   : tous les versets sont mémorisés, aucun fragile ;
 *  - learning  : des versets en apprentissage, ou sourate partiellement mémorisée ;
 *  - none      : non commencée.
 */
export type CellState = 'learned' | 'learning' | 'reinforce' | 'none';

export function cellState(st: SurahStats): CellState {
  if (st.needsReinforcement) return 'reinforce';
  if (st.state === 'complete') return 'learned';
  if (st.state === 'partial' || st.state === 'learning') return 'learning';
  return 'none';
}

/** Pages du Mushaf mémorisées (somme pondérée des versets mémorisés). */
export function memorizedPages(verses: Record<number, VerseState>): number {
  let s = 0;
  for (const k in verses) if (verses[k].status === 'memorized') s += verseWeight(Number(k));
  return s;
}

/** Pages travaillées par jour sur les N derniers jours (ancien → récent). */
export function pagesByDay(history: HistoryEntry[], today: string, n: number): { date: string; pages: number }[] {
  const map = new Map<string, number>();
  for (const h of history) map.set(h.date, (map.get(h.date) ?? 0) + rangePages(h.surah, h.from, h.to));
  const out: { date: string; pages: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    out.push({ date: d, pages: map.get(d) ?? 0 });
  }
  return out;
}

/** Sourates dont au moins un verset appartient au hizb. */
export function hizbSurahs(h: number): number[] {
  const [a, b] = hizbRange(h);
  const s1 = fromAyahId(a).surah;
  const s2 = fromAyahId(b).surah;
  return Array.from({ length: s2 - s1 + 1 }, (_, i) => s1 + i);
}
