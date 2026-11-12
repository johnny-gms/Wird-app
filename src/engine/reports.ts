import { addDays } from './dates';
import { ayahId, fromAyahId } from './quran';
import { groupRuns } from './rotation';
import type { Grade, HistoryEntry, ProgressPoint } from './types';

export interface PeriodReport {
  from: string;
  to: string;
  activeDays: number;
  periodDays: number;
  verses: number;
  items: number;
  byGrade: Record<Grade, number>;
  surahs: { surah: number; verses: number }[];
  /** Versets évalués « difficile » ou « non maîtrisé » au moins 2 fois sur la période, regroupés. */
  difficulties: { surah: number; from: number; to: number; count: number }[];
  /** Évolution de la part mémorisée sur la période (versets), si des données existent. */
  memorizedDelta: number | null;
}

const GRADES: Grade[] = ['mastered', 'hesitant', 'difficult', 'failed'];

export function periodReport(history: HistoryEntry[], progressLog: ProgressPoint[], from: string, to: string): PeriodReport {
  const inRange = history.filter((h) => h.date >= from && h.date <= to);
  const byGrade: Record<Grade, number> = { mastered: 0, hesitant: 0, difficult: 0, failed: 0 };
  const perSurah = new Map<number, number>();
  const hard = new Map<number, number>();
  let verses = 0;
  for (const h of inRange) {
    const n = h.to - h.from + 1;
    verses += n;
    byGrade[h.grade] += n;
    perSurah.set(h.surah, (perSurah.get(h.surah) ?? 0) + n);
    if (h.grade === 'difficult' || h.grade === 'failed') {
      for (let a = h.from; a <= h.to; a++) {
        const id = ayahId(h.surah, a);
        hard.set(id, (hard.get(id) ?? 0) + 1);
      }
    }
  }
  const recurring = [...hard.entries()].filter(([, c]) => c >= 2).map(([id]) => id);
  const difficulties = groupRuns(recurring, 50).map((r) => ({
    surah: r.surah,
    from: r.from,
    to: r.to,
    count: Math.max(...r.ids.map((id) => hard.get(id)!)),
  }));

  // Évolution de la mémorisation : dernier point <= to  moins dernier point < from
  let memorizedDelta: number | null = null;
  const before = [...progressLog].filter((p) => p.date < from).pop() ?? progressLog.find((p) => p.date >= from && p.date <= to);
  const end = [...progressLog].filter((p) => p.date <= to).pop();
  if (end && before) memorizedDelta = end.memorized - before.memorized;

  let periodDays = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) periodDays++;
  return {
    from,
    to,
    activeDays: new Set(inRange.map((h) => h.date)).size,
    periodDays,
    verses,
    items: inRange.length,
    byGrade,
    surahs: [...perSurah.entries()].map(([surah, v]) => ({ surah, verses: v })).sort((a, b) => b.verses - a.verses),
    difficulties,
    memorizedDelta,
  };
}

export { GRADES, fromAyahId };
