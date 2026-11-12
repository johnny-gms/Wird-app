import { ENGINE } from './config';
import { addDays } from './dates';
import { ayahId, rangeLabel, surahMeta } from './quran';
import type { LearningGoal, PersonalGoal, TrashItem, VerseState } from './types';

const uid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Retrait du suivi de versets : ils vont à la corbeille (30 jours), pas à la destruction. */
export function trashVerses(verses: Record<number, VerseState>, surah: number, from: number, to: number, now: Date): { verses: Record<number, VerseState>; item: TrashItem | null } {
  const next = { ...verses };
  const removed: VerseState[] = [];
  for (let a = from; a <= to; a++) {
    const id = ayahId(surah, a);
    if (next[id]) {
      removed.push(next[id]);
      delete next[id];
    }
  }
  const item: TrashItem | null = removed.length ? { id: uid(), kind: 'verses', deletedAt: now.toISOString(), label: `${surahMeta(surah).tr} · ${rangeLabel(surah, from, to).replace(/^Sourate \d+ — /, '')}`, verses: removed } : null;
  return { verses: next, item };
}

export function trashGoal(goal: LearningGoal, learningVerses: VerseState[], now: Date): TrashItem {
  return { id: uid(), kind: 'goal', deletedAt: now.toISOString(), label: `Apprentissage : ${surahMeta(goal.surah).tr}`, goal, verses: learningVerses };
}

export function trashPersonalGoal(goal: PersonalGoal, now: Date): TrashItem {
  return { id: uid(), kind: 'personalGoal', deletedAt: now.toISOString(), label: `Objectif : ${goal.title}`, goal };
}

/** Éléments de la corbeille encore conservés (30 jours) ; les autres sont purgés. */
export function purgeTrash(trash: TrashItem[], nowKey: string): TrashItem[] {
  return trash.filter((t) => addDays(t.deletedAt.slice(0, 10), ENGINE.trashDays) > nowKey);
}

/** Jours restants avant la purge définitive. */
export function trashDaysLeft(item: TrashItem, nowKey: string): number {
  const end = addDays(item.deletedAt.slice(0, 10), ENGINE.trashDays);
  const a = new Date(nowKey + 'T12:00').getTime();
  const b = new Date(end + 'T12:00').getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
