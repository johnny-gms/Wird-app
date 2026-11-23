import { ENGINE } from './config';
import { diffDays, startOfWeek } from './dates';
import { idsPages, pageOf, rangePages } from './pages';
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

/** Contexte de construction du programme : l'historique sert à répartir les objectifs par semaine. */
export type PlanBuildContext = PlanContext & { history?: HistoryEntry[] };

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

/** Versets de la rotation de révision : tous les versets mémorisés (les versets simplement déclarés « déjà appris » en font partie, voir ENGINE.declaredInRotation). */
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
export function buildPlan(ctx: PlanBuildContext, date: string, prev: DailyPlan | null): DailyPlan {
  // Les révisions « en plus » (demandées par l'utilisateur) restent au programme tant qu'elles ne sont pas faites.
  const kept = prev && prev.date === date ? prev.items.filter((i) => i.status === 'done' || i.status === 'skipped' || (i.extra && i.status === 'pending')) : [];
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
  const rotStart = items.length;
  let guard = memorized.length + 2;
  // Objectif par semaine (pages / Hizb / Juz) : répartition sur la semaine, sans dette (voir weekQuota).
  const weeklyReview = ctx.settings.reviewWeekly ? weeklyReviewPages(ctx.settings) : null;
  let weeklyToAdd = weeklyReview !== null ? weekQuota(weeklyReview, date) - weekDone(ctx.history, date, 'review', (h) => rangePages(h.surah, h.from, h.to)) : 0;
  while ((weeklyReview !== null ? weeklyToAdd > 0.04 : pagesUsed.size < ctx.settings.reviewPagesPerDay) && guard-- > 0) {
    const c = nextChunk(memorized, cursor, rotExclude, ENGINE.chunkSize, true);
    if (!c) break;
    // un tour complet de la rotation a été proposé : on ne répète pas les mêmes versets le même jour
    if (c.ids.some((id) => seen.has(id))) break;
    c.ids.forEach((id) => seen.add(id));
    pagesUsed.add(pageOf(c.ids[0]));
    weeklyToAdd -= idsPages(c.ids);
    items.push({ id: mkId(date, 'review', c.surah, c.from, c.to), kind: 'review', surah: c.surah, from: c.from, to: c.to, status: 'pending', endCursor: c.endCursor, wraps: c.wraps });
    cursor = c.endCursor;
    if (c.wraps && seen.size >= memorized.length) break;
  }

  // Une sourate qui s'étend sur plusieurs pages (ou deux Hizb) reste UN passage : « sourate entière », pas « versets 1 à 15 » puis « 16 à 30 ».
  const merged = mergeSameSurah(items.slice(rotStart), (a, b) => ({ ...a, to: b.to, id: mkId(date, 'review', a.surah, a.from, b.to), endCursor: b.endCursor, wraps: a.wraps || b.wraps }));
  items.splice(rotStart, items.length - rotStart, ...merged);

  // 3. Nouvel apprentissage : objectifs en cours, jusqu'à l'objectif en pages
  const keptLearn = kept.filter((i) => i.kind === 'learn').reduce((a, i) => a + itemPages(i), 0);
  const lw = ctx.settings.learnWeekly;
  if (lw && ctx.settings.learnMode !== 'off') {
    // Objectif par semaine (versets ou pages) : cumul visé à la fin de la journée − déjà appris cette semaine.
    const week = (ctx.history ?? []).filter((h) => h.kind === 'learn');
    let verseBudget = Math.ceil(weekQuota(lw.amount, date)) - (lw.unit === 'verses' ? weekDone(week, date, 'learn', (h) => h.to - h.from + 1) : 0);
    let pageBudget = weekQuota(lw.amount, date) - (lw.unit === 'pages' ? weekDone(week, date, 'learn', (h) => rangePages(h.surah, h.from, h.to)) : 0);
    // Le budget de la semaine se répartit sur les objectifs ouverts, l'un après l'autre : une petite sourate terminée ne vide pas la semaine.
    const left = () => (lw.unit === 'verses' ? verseBudget >= 1 : pageBudget > 0.03);
    for (const g of ctx.goals) {
      if (!left()) break;
      if (g.paused || g.completedAt) continue;
      const keptG = kept.filter((i) => i.kind === 'learn' && i.goalId === g.id);
      let at = Math.max(g.cursor, ...keptG.map((i) => i.to + 1));
      while (left()) {
        let seg = learningSegment(ctx, g, at);
        if (!seg) break;
        if (lw.unit === 'verses') seg = { from: seg.from, to: Math.min(seg.to, seg.from + verseBudget - 1) };
        else {
          let e = seg.from;
          while (e < seg.to && rangePages(g.surah, seg.from, e + 1) <= pageBudget) e++;
          seg = { from: seg.from, to: e };
        }
        items.push({ id: mkId(date, 'learn', g.surah, seg.from, seg.to), kind: 'learn', surah: g.surah, from: seg.from, to: seg.to, status: 'pending', goalId: g.id });
        verseBudget -= seg.to - seg.from + 1;
        pageBudget -= rangePages(g.surah, seg.from, seg.to);
        at = seg.to + 1;
      }
    }
    items.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
    // budget restant alors que tous les objectifs ouverts sont parcourus : la suite doit s'ouvrir (voir le store)
    return { date, items, ...(left() ? { moreLearn: true } : {}) };
  }
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

/** Regroupe les passages qui se suivent dans une même sourate (le suivant commence juste après la fin du précédent). */
export function mergeSameSurah<T extends { surah: number; from: number; to: number }>(list: T[], join: (a: T, b: T) => T): T[] {
  const out: T[] = [];
  for (const it of list) {
    const last = out[out.length - 1];
    if (last && last.surah === it.surah && last.to + 1 === it.from) out[out.length - 1] = join(last, it);
    else out.push(it);
  }
  return out;
}

/** Pages du Mushaf par unité de révision : un Hizb ≈ 10 pages (604 ÷ 60), un Juz ≈ 20 pages (604 ÷ 30). */
export const PAGES_PER_UNIT = { pages: 1, hizb: 10, juz: 20 } as const;

/** Objectif de révision par semaine, en pages (null si le réglage par jour est utilisé). */
export function weeklyReviewPages(s: Pick<Settings, 'reviewWeekly' | 'reviewPagesPerDay'>): number {
  return s.reviewWeekly ? s.reviewWeekly.amount * PAGES_PER_UNIT[s.reviewWeekly.unit] : s.reviewPagesPerDay * 7;
}

/** Pages de révision par jour (moyenne), selon l'objectif par semaine ou par jour. */
export const reviewPagesPerDay = (s: Pick<Settings, 'reviewWeekly' | 'reviewPagesPerDay'>): number => weeklyReviewPages(s) / 7;

/** Cumul visé à la fin de la journée : le total de la semaine réparti du lundi au dimanche (jamais de dette : un jour manqué se rattrape dans la semaine). */
export function weekQuota(weekly: number, date: string): number {
  return (weekly * (diffDays(startOfWeek(date), date) + 1)) / 7;
}

/** Quantité déjà travaillée depuis lundi (jour courant inclus). */
export function weekDone(history: HistoryEntry[] | undefined, date: string, kind: WorkKind, measure: (h: HistoryEntry) => number): number {
  const from = startOfWeek(date);
  let n = 0;
  for (const h of history ?? []) if (h.kind === kind && h.date >= from && h.date <= date) n += measure(h);
  return n;
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
  const pagesPerDay = reviewPagesPerDay(ctx.settings);
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
  while (out.length < maxItems + 4 && guard-- > 0) {
    const c = nextChunk(memorized, cursor, new Set(), ENGINE.chunkSize, true);
    if (!c || c.ids.some((id) => seen.has(id))) break;
    const pg = pageOf(c.ids[0]);
    if (!todayPages.has(pg)) upcoming.add(pg);
    // jour estimé : pages à venir ÷ rythme quotidien (demain = 1)
    out.push({ surah: c.surah, from: c.from, to: c.to, inDays: Math.floor(Math.max(0, upcoming.size - 1) / pagesPerDay) + 1 });
    c.ids.forEach((id) => seen.add(id));
    cursor = c.endCursor;
  }
  // même regroupement que le programme du jour : une sourate sur plusieurs pages = un seul passage
  return mergeSameSurah(out, (a, b) => ({ ...a, to: b.to })).slice(0, maxItems);
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
