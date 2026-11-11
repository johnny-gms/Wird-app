import { ENGINE } from './config';
import { addDays } from './dates';
import { applyGrade, newLearningVerse, promoteLearned } from './scheduling';
import { ayahId } from './quran';
import { groupRuns, nextChunk } from './rotation';
import type { DailyPlan, Grade, HistoryEntry, LearningGoal, PlanItem, RotationState, Settings, VerseState, WorkKind } from './types';

export interface PlanContext {
  verses: Record<number, VerseState>;
  goals: LearningGoal[];
  rotation: RotationState;
  settings: Settings;
}

export interface Core extends PlanContext {
  plan: DailyPlan | null;
  history: HistoryEntry[];
}

const KIND_RANK: Record<WorkKind, number> = { review: 0, reinforce: 1, learn: 2 };

export function memorizedIds(verses: Record<number, VerseState>): number[] {
  const out: number[] = [];
  for (const k in verses) if (verses[k].status === 'memorized') out.push(Number(k));
  return out.sort((a, b) => a - b);
}

export function itemIds(item: Pick<PlanItem, 'surah' | 'from' | 'to'>): number[] {
  const out: number[] = [];
  for (let a = item.from; a <= item.to; a++) out.push(ayahId(item.surah, a));
  return out;
}

export function itemVerseCount(item: Pick<PlanItem, 'from' | 'to'>): number {
  return item.to - item.from + 1;
}

const mkId = (date: string, kind: WorkKind, surah: number, from: number, to: number) => `${date}:${kind}:${surah}:${from}-${to}`;

/** Versets de renforcement dus à la date donnée, par priorité (plus fragiles d'abord). */
export function dueReinforcement(verses: Record<number, VerseState>, date: string): VerseState[] {
  const due: VerseState[] = [];
  for (const k in verses) {
    const v = verses[k];
    if (v.status === 'memorized' && v.fragile && v.reinforceDue !== null && v.reinforceDue <= date) due.push(v);
  }
  return due.sort((a, b) => a.strength - b.strength || a.reinforceDue!.localeCompare(b.reinforceDue!) || a.id - b.id);
}

/**
 * Construit (ou reconstruit) le programme du jour.
 * Les éléments déjà commencés / terminés / ignorés sont conservés ; seuls les éléments « à faire » sont recalculés.
 * Aucun travail non fait la veille n'est reporté : il n'y a pas de dette.
 */
export function buildPlan(ctx: PlanContext, date: string, prev: DailyPlan | null): DailyPlan {
  const kept = prev && prev.date === date ? prev.items.filter((i) => i.status !== 'pending') : [];
  const items: PlanItem[] = [...kept];

  // 1. Renforcement
  const coveredReinforce = new Set<number>();
  let reinforceBudget = ctx.settings.reinforceVersesPerDay;
  for (const it of kept) {
    if (it.kind === 'reinforce') {
      itemIds(it).forEach((id) => coveredReinforce.add(id));
      reinforceBudget -= itemVerseCount(it);
    }
  }
  const picked: number[] = [];
  for (const v of dueReinforcement(ctx.verses, date)) {
    if (reinforceBudget <= 0) break;
    if (coveredReinforce.has(v.id)) continue;
    picked.push(v.id);
    reinforceBudget--;
  }
  for (const r of groupRuns(picked)) {
    items.push({ id: mkId(date, 'reinforce', r.surah, r.from, r.to), kind: 'reinforce', surah: r.surah, from: r.from, to: r.to, status: 'pending' });
  }

  // 2. Rotation générale (hors versets déjà couverts par le renforcement du jour)
  const exclude = new Set<number>(coveredReinforce);
  picked.forEach((id) => exclude.add(id));
  const memorized = memorizedIds(ctx.verses);
  const keptRot = kept.filter((i) => i.kind === 'review' && !i.adhoc);
  let quota = ctx.settings.reviewVersesPerDay - keptRot.reduce((a, i) => a + itemVerseCount(i), 0);
  let cursor = keptRot.length ? keptRot[keptRot.length - 1].endCursor ?? ctx.rotation.cursor : ctx.rotation.cursor;
  const seen = new Set<number>(keptRot.flatMap(itemIds));
  const rotExclude = new Set<number>([...exclude, ...seen]);
  let guard = memorized.length + 2;
  while (quota > 0 && guard-- > 0) {
    const c = nextChunk(memorized, cursor, ctx.settings.direction, rotExclude, ENGINE.chunkSize);
    if (!c) break;
    // ne pas reproposer, le même jour, des versets déjà inclus (un tour complet de la rotation)
    if (c.ids.some((id) => seen.has(id))) break;
    c.ids.forEach((id) => seen.add(id));
    items.push({
      id: mkId(date, 'review', c.surah, c.from, c.to),
      kind: 'review',
      surah: c.surah,
      from: c.from,
      to: c.to,
      status: 'pending',
      endCursor: c.endCursor,
      wraps: c.wraps,
    });
    quota -= c.ids.length;
    cursor = c.endCursor;
    // éviter de boucler si la rotation a fait le tour
    if (c.wraps && seen.size >= memorized.length) break;
  }

  // 3. Nouvel apprentissage : au plus un élément par objectif et par jour
  if (ctx.settings.learningEnabled) {
    for (const g of ctx.goals) {
      if (g.paused || g.completedAt) continue;
      if (items.some((i) => i.kind === 'learn' && i.goalId === g.id)) continue;
      const seg = learningSegment(ctx, g);
      if (!seg) continue;
      items.push({ id: mkId(date, 'learn', g.surah, seg.from, seg.to), kind: 'learn', surah: g.surah, from: seg.from, to: seg.to, status: 'pending', goalId: g.id });
    }
  }

  items.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  return { date, items };
}

/** Prochain segment d'apprentissage : versets non encore mémorisés à partir du curseur de l'objectif. */
export function learningSegment(ctx: PlanContext, g: LearningGoal): { from: number; to: number } | null {
  let a = g.cursor;
  while (a <= g.to && ctx.verses[ayahId(g.surah, a)]?.status === 'memorized') a++;
  if (a > g.to) return null;
  let b = a;
  while (b < g.to && b - a + 1 < ctx.settings.learningChunk && ctx.verses[ayahId(g.surah, b + 1)]?.status !== 'memorized') b++;
  return { from: a, to: b };
}

export function goalProgress(g: LearningGoal): { done: number; total: number } {
  const total = g.to - g.from + 1;
  return { done: Math.max(0, Math.min(total, g.cursor - g.from)), total };
}

/** Marque un élément « en cours ». */
export function startItem(core: Core, itemId: string): Core {
  if (!core.plan) return core;
  const items = core.plan.items.map((i) => (i.id === itemId && (i.status === 'pending' || i.status === 'skipped') ? { ...i, status: 'in_progress' as const } : i));
  return { ...core, plan: { ...core.plan, items } };
}

export function skipItem(core: Core, itemId: string): Core {
  if (!core.plan) return core;
  const items = core.plan.items.map((i) => (i.id === itemId && i.status !== 'done' ? { ...i, status: 'skipped' as const } : i));
  return { ...core, plan: { ...core.plan, items } };
}

export function reopenItem(core: Core, itemId: string): Core {
  if (!core.plan) return core;
  const items = core.plan.items.map((i) => (i.id === itemId && i.status === 'skipped' ? { ...i, status: 'pending' as const } : i));
  return { ...core, plan: { ...core.plan, items } };
}

/**
 * Enregistre l'évaluation d'un élément :
 * met à jour chaque verset (solidité, renforcement), l'historique, l'élément du programme,
 * le curseur de rotation (jamais retiré de la rotation) et l'objectif d'apprentissage.
 */
export function evaluateItem(core: Core, itemId: string, grade: Grade, now: Date, today: string): Core {
  if (!core.plan) return core;
  const item = core.plan.items.find((i) => i.id === itemId);
  if (!item) return core;

  const verses = { ...core.verses };
  for (const id of itemIds(item)) {
    let v = verses[id];
    if (!v && item.kind === 'learn') v = newLearningVerse(id, today);
    if (!v) continue;
    verses[id] = applyGrade(v, grade, today);
  }

  let goals = core.goals;
  if (item.kind === 'learn' && item.goalId && (grade === 'mastered' || grade === 'hesitant')) {
    goals = goals.map((g) => (g.id === item.goalId ? { ...g, cursor: Math.max(g.cursor, item.to + 1) } : g));
  }

  const entry: HistoryEntry = {
    id: `${now.getTime()}-${itemId}`,
    ts: now.toISOString(),
    date: today,
    kind: item.kind,
    surah: item.surah,
    from: item.from,
    to: item.to,
    grade,
  };

  let items = core.plan.items.map((i) => (i.id === itemId ? { ...i, status: 'done' as const, grade, doneAt: now.toISOString() } : i));
  // Avance le curseur de rotation sur le préfixe d'éléments de rotation terminés.
  let rotation = core.rotation;
  const rot = items.filter((i) => i.kind === 'review' && !i.adhoc);
  const applied = new Set<string>();
  for (const i of rot) {
    if (i.applied) continue;
    if (i.status !== 'done') break;
    rotation = { cursor: i.endCursor ?? rotation.cursor, cycles: rotation.cycles + (i.wraps ? 1 : 0) };
    applied.add(i.id);
  }
  if (applied.size) items = items.map((i) => (applied.has(i.id) ? { ...i, applied: true } : i));

  return { ...core, verses, goals, rotation, history: [...core.history, entry], plan: { ...core.plan, items } };
}

/** Marque un objectif d'apprentissage comme terminé : les versets entrent dans la rotation, avec confirmation dès demain. */
export function completeGoal(core: Core, goalId: string, today: string): Core {
  const g = core.goals.find((x) => x.id === goalId);
  if (!g) return core;
  const verses = { ...core.verses };
  for (let a = g.from; a <= g.to; a++) {
    const id = ayahId(g.surah, a);
    const v = verses[id];
    if (v && v.status === 'learning') verses[id] = promoteLearned(v, today);
    else if (!v) verses[id] = promoteLearned(newLearningVerse(id, today), today);
  }
  const goals = core.goals.map((x) => (x.id === goalId ? { ...x, completedAt: today, cursor: g.to + 1 } : x));
  // Retire les éléments d'apprentissage non commencés de cet objectif.
  const plan = core.plan ? { ...core.plan, items: core.plan.items.filter((i) => !(i.goalId === goalId && i.status === 'pending')) } : null;
  return { ...core, verses, goals, plan };
}

export const tomorrow = (date: string) => addDays(date, 1);
