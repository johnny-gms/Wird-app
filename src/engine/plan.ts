import { ENGINE } from './config';
import { idsPages, rangePages } from './pages';
import { applyGrade, newLearningVerse, promoteLearned } from './scheduling';
import { SURAHS, ayahId, surahMeta } from './quran';
import { groupRuns, nextChunk } from './rotation';
import type { DailyPlan, Direction, Grade, HistoryEntry, LearningGoal, PlanItem, RotationState, Settings, VerseState, WorkKind } from './types';

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

/** Ordre du programme : apprentissage, révisions, renforcement. L'ordre de travail reste libre pour l'utilisateur. */
const KIND_RANK: Record<WorkKind, number> = { learn: 0, review: 1, reinforce: 2 };

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

export const itemPages = (item: Pick<PlanItem, 'surah' | 'from' | 'to'>): number => rangePages(item.surah, item.from, item.to);

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
 * Construit (ou reconstruit) le programme du jour à partir des objectifs en pages.
 *  - Révision : on prend la rotation générale jusqu'à l'objectif ; si l'utilisateur connaît moins de contenu, on s'arrête à ce qu'il a.
 *  - Apprentissage : objectifs d'apprentissage en cours, jusqu'à l'objectif en pages ; s'il ne reste rien à apprendre, rien n'est inventé.
 *  - Renforcement : versets fragiles dus, plafonnés.
 * Les éléments déjà terminés ou ignorés sont conservés ; seuls les éléments « à faire » sont recalculés. Aucune dette.
 */
export function buildPlan(ctx: PlanContext, date: string, prev: DailyPlan | null): DailyPlan {
  const kept = prev && prev.date === date ? prev.items.filter((i) => i.status === 'done' || i.status === 'skipped') : [];
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
  const memorized = memorizedIds(ctx.verses);
  const keptRot = kept.filter((i) => i.kind === 'review' && !i.adhoc);
  let quota = ctx.settings.reviewPagesPerDay - keptRot.reduce((a, i) => a + itemPages(i), 0);
  let cursor = keptRot.length ? (keptRot[keptRot.length - 1].endCursor ?? ctx.rotation.cursor) : ctx.rotation.cursor;
  const seen = new Set<number>(keptRot.flatMap(itemIds));
  const rotExclude = new Set<number>([...coveredReinforce, ...picked, ...seen]);
  let guard = memorized.length + 2;
  while (quota > 0.05 && guard-- > 0) {
    const c = nextChunk(memorized, cursor, ctx.settings.direction, rotExclude, ENGINE.chunkSize);
    if (!c) break;
    // un tour complet de la rotation a été proposé : on ne répète pas les mêmes versets le même jour
    if (c.ids.some((id) => seen.has(id))) break;
    c.ids.forEach((id) => seen.add(id));
    items.push({ id: mkId(date, 'review', c.surah, c.from, c.to), kind: 'review', surah: c.surah, from: c.from, to: c.to, status: 'pending', endCursor: c.endCursor, wraps: c.wraps });
    quota -= idsPages(c.ids);
    cursor = c.endCursor;
    if (c.wraps && seen.size >= memorized.length) break;
  }

  // 3. Nouvel apprentissage : objectifs en cours, jusqu'à l'objectif en pages
  let learnBudget = ctx.settings.learnPagesPerDay - kept.filter((i) => i.kind === 'learn').reduce((a, i) => a + itemPages(i), 0);
  for (const g of ctx.goals) {
    if (learnBudget <= 0.05) break;
    if (g.paused || g.completedAt) continue;
    const keptG = kept.filter((i) => i.kind === 'learn' && i.goalId === g.id);
    let at = Math.max(g.cursor, ...keptG.map((i) => i.to + 1));
    while (learnBudget > 0.05) {
      const seg = learningSegment(ctx, g, at);
      if (!seg) break;
      items.push({ id: mkId(date, 'learn', g.surah, seg.from, seg.to), kind: 'learn', surah: g.surah, from: seg.from, to: seg.to, status: 'pending', goalId: g.id });
      learnBudget -= rangePages(g.surah, seg.from, seg.to);
      at = seg.to + 1;
    }
  }

  items.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  return { date, items };
}

/** Segment d'apprentissage suivant : versets non encore mémorisés contigus, à partir de `start` (par défaut le curseur). */
export function learningSegment(ctx: Pick<PlanContext, 'verses'>, g: LearningGoal, start: number = g.cursor): { from: number; to: number } | null {
  let a = start;
  while (a <= g.to && ctx.verses[ayahId(g.surah, a)]?.status === 'memorized') a++;
  if (a > g.to) return null;
  let b = a;
  while (b < g.to && b - a + 1 < ENGINE.chunkSize && ctx.verses[ayahId(g.surah, b + 1)]?.status !== 'memorized') b++;
  return { from: a, to: b };
}

export function goalProgress(g: LearningGoal): { done: number; total: number } {
  const total = g.to - g.from + 1;
  return { done: Math.max(0, Math.min(total, g.cursor - g.from)), total };
}

/**
 * Prochaine sourate à apprendre, dans le sens d'apprentissage choisi : la première sourate (dans l'ordre du sens)
 * qui n'est pas entièrement mémorisée et sans objectif d'apprentissage en cours. Retourne la plage de versets restante.
 */
export function nextLearnTarget(verses: Record<number, VerseState>, goals: LearningGoal[], dir: Direction): { surah: number; from: number; to: number } | null {
  const order = SURAHS.map((s) => s.id);
  if (dir === 'backward') order.reverse();
  const busy = new Set(goals.filter((g) => !g.completedAt).map((g) => g.surah));
  for (const sNum of order) {
    if (busy.has(sNum)) continue;
    const n = surahMeta(sNum).n;
    let first = 0;
    let last = 0;
    for (let a = 1; a <= n; a++) {
      if (verses[ayahId(sNum, a)]?.status === 'memorized') continue;
      if (!first) first = a;
      last = a;
    }
    if (first) return { surah: sNum, from: first, to: last };
  }
  return null;
}

/** Reste-t-il un objectif d'apprentissage ouvert (en pause, ou avec du contenu à travailler) ? Sinon WIRD en propose un. */
export function hasOpenGoal(ctx: Pick<PlanContext, 'verses' | 'goals'>): boolean {
  return ctx.goals.some((g) => !g.completedAt && (g.paused || learningSegment(ctx, g) !== null));
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
 * À appeler dans l'ordre du programme.
 */
export function evaluateItem(core: Core, itemId: string, grade: Grade, now: Date, today: string): Core {
  if (!core.plan) return core;
  const item = core.plan.items.find((i) => i.id === itemId);
  if (!item || item.status === 'done') return core;

  const verses = { ...core.verses };
  for (const id of itemIds(item)) {
    let v = verses[id];
    if (!v && item.kind === 'learn') v = newLearningVerse(id, today);
    if (!v) continue;
    verses[id] = applyGrade(v, grade, today);
  }

  let goals = core.goals;
  if (item.kind === 'learn' && item.goalId && (grade === 'mastered' || grade === 'hesitant')) {
    goals = goals.map((g) => {
      if (g.id !== item.goalId) return g;
      // le curseur n'avance que si cet élément suit directement les versets déjà acquis (pas de « saut » après un élément difficile)
      let a = g.cursor;
      while (a < item.from && core.verses[ayahId(g.surah, a)]?.status === 'memorized') a++;
      return a >= item.from ? { ...g, cursor: Math.max(g.cursor, item.to + 1) } : g;
    });
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
  const applied = new Set<string>();
  for (const i of items.filter((x) => x.kind === 'review' && !x.adhoc)) {
    if (i.applied) continue;
    if (i.status !== 'done') break;
    rotation = { cursor: i.endCursor ?? rotation.cursor, cycles: rotation.cycles + (i.wraps ? 1 : 0) };
    applied.add(i.id);
  }
  if (applied.size) items = items.map((i) => (applied.has(i.id) ? { ...i, applied: true } : i));

  let out: Core = { ...core, verses, goals, rotation, history: [...core.history, entry], plan: { ...core.plan, items } };
  // Un apprentissage automatique entièrement parcouru passe tout seul en mémorisé (confirmation dès demain).
  for (const g of out.goals) if (g.auto && !g.completedAt && learningSegment(out, g) === null) out = completeGoal(out, g.id, today);
  return out;
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
  // Retire les éléments d'apprentissage non traités de cet objectif.
  const plan = core.plan ? { ...core.plan, items: core.plan.items.filter((i) => !(i.goalId === goalId && i.status === 'pending')) } : null;
  return { ...core, verses, goals, plan };
}
