import { ENGINE } from './config';
import { pageOf, rangePages } from './pages';
import { applyGrade, newLearningVerse, promoteLearned } from './scheduling';
import { SURAHS, ayahId, fromAyahId, surahMeta } from './quran';
import { learnUnits } from './units';
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

/** Versets de la rotation de révision : mémorisés, hors versets simplement déclarés (voir ENGINE.declaredInRotation). */
export function rotationIds(verses: Record<number, VerseState>): number[] {
  const out: number[] = [];
  for (const k in verses) {
    const v = verses[k];
    if (v.status !== 'memorized' || (!ENGINE.declaredInRotation && v.declared)) continue;
    if (ENGINE.autoExcludedSurahs.includes(fromAyahId(Number(k)).surah)) continue;
    out.push(Number(k));
  }
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

/** Signature d'un passage (type, sourate, versets) : identique d'un jour à l'autre, contrairement à l'id du programme. */
export const itemSig = (item: Pick<PlanItem, 'kind' | 'surah' | 'from' | 'to'>): string => `${item.kind}:${item.surah}:${item.from}-${item.to}`;

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
  const memorized = rotationIds(ctx.verses);
  const keptRot = kept.filter((i) => i.kind === 'review' && !i.adhoc);
  // La révision se compte en pages du Mushaf : « 2 pages par jour » = les versets appris de 2 pages.
  const pagesUsed = new Set<number>(keptRot.flatMap((i) => itemIds(i).map(pageOf)));
  let cursor = keptRot.length ? (keptRot[keptRot.length - 1].endCursor ?? ctx.rotation.cursor) : ctx.rotation.cursor;
  const seen = new Set<number>(keptRot.flatMap(itemIds));
  const rotExclude = new Set<number>([...coveredReinforce, ...picked, ...seen]);
  let guard = memorized.length + 2;
  while (pagesUsed.size < ctx.settings.reviewPagesPerDay && guard-- > 0) {
    const c = nextChunk(memorized, cursor, rotExclude, ENGINE.chunkSize, true);
    if (!c) break;
    // un tour complet de la rotation a été proposé : on ne répète pas les mêmes versets le même jour
    if (c.ids.some((id) => seen.has(id))) break;
    c.ids.forEach((id) => seen.add(id));
    pagesUsed.add(pageOf(c.ids[0]));
    items.push({ id: mkId(date, 'review', c.surah, c.from, c.to), kind: 'review', surah: c.surah, from: c.from, to: c.to, status: 'pending', endCursor: c.endCursor, wraps: c.wraps });
    cursor = c.endCursor;
    if (c.wraps && seen.size >= memorized.length) break;
  }

  // 3. Nouvel apprentissage : objectifs en cours, jusqu'à l'objectif en pages
  const keptLearn = kept.filter((i) => i.kind === 'learn').reduce((a, i) => a + itemPages(i), 0);
  let learnBudget = 0;
  let budgeted = false;
  // au moins un passage par jour tant qu'il reste quelque chose à apprendre, même si la sourate est très courte (budget < 0,05 page)
  let added = keptLearn > 0;
  for (const g of ctx.goals) {
    if (g.paused || g.completedAt) continue;
    // un seul objectif à la fois reçoit le budget du jour
    if (!budgeted) { learnBudget = dailyLearnPages(ctx.settings, g, ctx.goals.filter((x) => !x.paused && !x.completedAt)) - keptLearn; budgeted = true; }
    if (learnBudget <= 0.05 && added) break;
    const keptG = kept.filter((i) => i.kind === 'learn' && i.goalId === g.id);
    let at = Math.max(g.cursor, ...keptG.map((i) => i.to + 1));
    while (learnBudget > 0.05 || !added) {
      const seg = learningSegment(ctx, g, at);
      if (!seg) break;
      items.push({ id: mkId(date, 'learn', g.surah, seg.from, seg.to), kind: 'learn', surah: g.surah, from: seg.from, to: seg.to, status: 'pending', goalId: g.id });
      learnBudget -= rangePages(g.surah, seg.from, seg.to);
      added = true;
      at = seg.to + 1;
    }
  }

  items.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  return { date, items };
}

/**
 * Pages à apprendre aujourd'hui :
 *  - objectif d'un Hizb / demi-Hizb : pages de l'unité ÷ nombre de jours choisi (1, 2 ou 7) ;
 *  - sinon (une sourate par semaine, ou objectif choisi à la main) : pages de la sourate étalées sur 7 jours.
 */
export function dailyLearnPages(settings: Pick<Settings, 'learnMode' | 'learnEvery'>, g: Pick<LearningGoal, 'surah' | 'from' | 'to' | 'unitKey'>, group: Pick<LearningGoal, 'surah' | 'from' | 'to' | 'unitKey'>[] = [g]): number {
  if (settings.learnMode === 'hizb' && g.unitKey) {
    const pages = group.filter((x) => x.unitKey === g.unitKey).reduce((a, x) => a + rangePages(x.surah, x.from, x.to), 0);
    return pages / settings.learnEvery;
  }
  return rangePages(g.surah, g.from, g.to) / 7;
}

/** L'apprentissage est-il activé ? */
export const learningEnabled = (s: Pick<Settings, 'learnMode'>): boolean => s.learnMode !== 'off';

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
 * Les sourates exclues du programme automatique (Al-Fatiha) ne sont jamais proposées.
 */
export function nextLearnTarget(verses: Record<number, VerseState>, goals: LearningGoal[], dir: Direction): { surah: number; from: number; to: number } | null {
  const order = SURAHS.map((s) => s.id).filter((id) => !ENGINE.autoExcludedSurahs.includes(id));
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

export interface LearnTargets {
  /** Renseigné pour un Hizb / demi-Hizb : les objectifs créés ensemble partagent le même rythme. */
  unitKey?: string;
  segments: { surah: number; from: number; to: number }[];
}

/**
 * Prochain(s) passage(s) à apprendre selon le rythme choisi :
 *  - « une sourate par semaine » : la prochaine sourate (voir nextLearnTarget) ;
 *  - « Hizb / demi-Hizb » : le prochain Hizb (ou demi-Hizb) dans le sens choisi qui a encore des versets à apprendre,
 *    découpé en parties de sourates exactes (un verset déjà appris est sauté, Al-Fatiha n'est jamais proposée).
 */
export function nextLearnTargets(verses: Record<number, VerseState>, goals: LearningGoal[], settings: Pick<Settings, 'learnMode' | 'learnUnit' | 'learnDirection'>): LearnTargets | null {
  if (settings.learnMode === 'off') return null;
  if (settings.learnMode === 'surah') {
    const t = nextLearnTarget(verses, goals, settings.learnDirection);
    return t ? { segments: [t] } : null;
  }
  const open = goals.filter((g) => !g.completedAt);
  const busyKeys = new Set(open.map((g) => g.unitKey).filter(Boolean));
  const covered = new Set<number>();
  for (const g of open) for (let a = g.from; a <= g.to; a++) covered.add(ayahId(g.surah, a));
  const units = learnUnits(settings.learnUnit);
  if (settings.learnDirection === 'backward') units.reverse();
  for (const u of units) {
    if (busyKeys.has(u.key)) continue;
    const bySurah = new Map<number, { from: number; to: number }>();
    for (let id = u.from; id <= u.to; id++) {
      const { surah, ayah } = fromAyahId(id);
      if (ENGINE.autoExcludedSurahs.includes(surah) || verses[id]?.status === 'memorized' || covered.has(id)) continue;
      const cur = bySurah.get(surah);
      if (cur) cur.to = ayah;
      else bySurah.set(surah, { from: ayah, to: ayah });
    }
    if (bySurah.size) return { unitKey: u.key, segments: [...bySurah].map(([surah, r]) => ({ surah, ...r })) };
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

export interface UpcomingChunk {
  surah: number;
  from: number;
  to: number;
  /** Nombre de jours estimés avant le passage (1 = demain). Estimation : dépend de ton rythme et de ce que tu ajoutes. */
  inDays: number;
}

/**
 * Estimation des prochains passages de la rotation générale (au-delà du programme du jour), d'après l'objectif de
 * révision en pages. Ce n'est PAS un calendrier : rien n'est dû ; c'est une projection indicative.
 */
export function upcomingRotation(ctx: PlanContext, today: DailyPlan | null, maxItems = 6): UpcomingChunk[] {
  const pagesPerDay = ctx.settings.reviewPagesPerDay;
  if (pagesPerDay <= 0) return [];
  const memorized = rotationIds(ctx.verses);
  if (!memorized.length) return [];
  const rot = (today?.items ?? []).filter((i) => i.kind === 'review' && !i.adhoc && i.endCursor !== undefined);
  let cursor = rot.length ? rot[rot.length - 1].endCursor! : ctx.rotation.cursor;
  const seen = new Set<number>(rot.flatMap(itemIds));
  const out: UpcomingChunk[] = [];
  const todayPages = new Set<number>((today?.items ?? []).filter((i) => i.kind === 'review' && !i.adhoc).flatMap((i) => itemIds(i).map(pageOf)));
  const upcoming = new Set<number>();
  let guard = memorized.length + 2;
  while (out.length < maxItems && guard-- > 0) {
    const c = nextChunk(memorized, cursor, new Set(), ENGINE.chunkSize, true);
    if (!c || c.ids.some((id) => seen.has(id))) break;
    const pg = pageOf(c.ids[0]);
    if (!todayPages.has(pg)) upcoming.add(pg);
    // jour estimé : pages à venir ÷ rythme quotidien (demain = 1)
    out.push({ surah: c.surah, from: c.from, to: c.to, inDays: Math.floor(Math.max(0, upcoming.size - 1) / pagesPerDay) + 1 });
    c.ids.forEach((id) => seen.add(id));
    cursor = c.endCursor;
  }
  return out;
}

/** Aperçu d'un rythme d'apprentissage : prochain passage et pages par jour correspondantes (calculés sur les versets réels). */
export function learnPreview(verses: Record<number, VerseState>, settings: Pick<Settings, 'learnMode' | 'learnUnit' | 'learnDirection' | 'learnEvery'>): { label: string; pagesPerDay: number } | null {
  const t = nextLearnTargets(verses, [], settings);
  if (!t) return null;
  const pages = t.segments.reduce((a, g) => a + rangePages(g.surah, g.from, g.to), 0);
  const first = surahMeta(t.segments[0].surah).tr;
  const last = surahMeta(t.segments[t.segments.length - 1].surah).tr;
  const name = t.unitKey ? (t.unitKey.startsWith('hh:') ? `Demi-Hizb ${t.unitKey.slice(3)}` : `Hizb ${t.unitKey.slice(2)}`) : first;
  const span = t.unitKey ? (first === last ? first : `${first} → ${last}`) : `${t.segments[0].from === 1 && t.segments[0].to === surahMeta(t.segments[0].surah).n ? 'sourate entière' : `versets ${t.segments[0].from} à ${t.segments[0].to}`}`;
  return { label: `${name} · ${span}`, pagesPerDay: settings.learnMode === 'hizb' ? pages / settings.learnEvery : pages / 7 };
}
