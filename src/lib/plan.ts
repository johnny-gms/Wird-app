import { itemPages, itemVerseCount } from '@/engine/plan';
import type { DailyPlan, WorkKind } from '@/engine/types';

export interface KindCount {
  items: number;
  verses: number;
  pages: number;
  done: number;
}

export function planCounts(plan: DailyPlan | null): Record<WorkKind, KindCount> & { total: number; done: number; skipped: number; open: number } {
  const out = {
    review: { items: 0, verses: 0, pages: 0, done: 0 },
    reinforce: { items: 0, verses: 0, pages: 0, done: 0 },
    learn: { items: 0, verses: 0, pages: 0, done: 0 },
  } as Record<WorkKind, KindCount>;
  let done = 0;
  let skipped = 0;
  let open = 0;
  for (const i of plan?.items ?? []) {
    const k = out[i.kind];
    k.items++;
    k.verses += itemVerseCount(i);
    k.pages += itemPages(i);
    if (i.status === 'done') {
      k.done++;
      done++;
    } else if (i.status === 'skipped') skipped++;
    else open++;
  }
  return { ...out, total: plan?.items.length ?? 0, done, skipped, open };
}
