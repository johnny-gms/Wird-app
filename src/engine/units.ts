import { HALF_HIZB_STARTS, HIZB_STARTS } from '@/data/surahs.generated';
import { TOTAL_VERSES, ayahId } from './quran';
import type { LearnUnit } from './types';

export interface LearnUnitRange {
  key: string;
  /** Id global du premier et du dernier verset de l'unité. */
  from: number;
  to: number;
}

/** Hizb (60) ou demi-Hizb (120), dans l'ordre du Coran, d'après les débuts Tanzil recoupés avec quran-meta. */
export function learnUnits(unit: LearnUnit): LearnUnitRange[] {
  const starts = unit === 'half' ? HALF_HIZB_STARTS : HIZB_STARTS;
  const prefix = unit === 'half' ? 'hh' : 'h';
  return starts.map(([s, a], i) => ({
    key: `${prefix}:${i + 1}`,
    from: ayahId(s, a),
    to: i + 1 < starts.length ? ayahId(starts[i + 1][0], starts[i + 1][1]) - 1 : TOTAL_VERSES,
  }));
}
