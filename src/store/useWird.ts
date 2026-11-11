import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '@/engine/config';
import { dateKey } from '@/engine/dates';
import {
  buildPlan,
  completeGoal as completeGoalCore,
  evaluateItem,
  memorizedIds,
  reopenItem,
  skipItem,
  startItem,
  type Core,
} from '@/engine/plan';
import { ayahId, surahMeta } from '@/engine/quran';
import { newLearningVerse, newMemorizedVerse } from '@/engine/scheduling';
import type {
  DayRecord,
  Grade,
  LearningGoal,
  PersistedState,
  PersonalGoal,
  PlanItem,
  Settings,
  SessionSummary,
  VerseState,
} from '@/engine/types';
import { kvClear, kvGetAll, kvSetMany, requestPersistentStorage } from '@/storage/db';
import { enqueue } from '@/sync/outbox';

export const SCHEMA_VERSION = 1;

const emptyState = (): PersistedState => ({
  profile: { name: '', createdAt: dateKey(), onboarded: false, demo: false },
  settings: structuredClone(DEFAULT_SETTINGS),
  verses: {},
  goals: [],
  plan: null,
  session: null,
  rotation: { cursor: null, cycles: 0 },
  history: [],
  progressLog: [],
  summaries: [],
  personalGoals: [],
  dayLog: [],
});

const PERSISTED_KEYS = Object.keys(emptyState()) as (keyof PersistedState)[];

interface Actions {
  init(): Promise<void>;
  ensureToday(): void;
  completeOnboarding(name: string, demo: boolean): void;
  setName(name: string): void;
  updateSettings(patch: Partial<Settings>): void;

  addMemorized(surah: number, from: number, to: number): void;
  removeVerses(surah: number, from: number, to: number): void;
  addGoal(surah: number, from: number, to: number): string;
  toggleGoalPause(id: string): void;
  completeGoal(id: string): void;
  deleteGoal(id: string): void;

  addAdhoc(surah: number, from: number, to: number): string | null;
  startSession(itemId?: string): string | null;
  finishRecitation(): void;
  backToRecitation(): void;
  submitGrade(grade: Grade): 'next' | 'finished';
  skipCurrent(): 'next' | 'finished';
  skipItem(id: string): void;
  reopenItem(id: string): void;
  interrupt(addMs: number): void;
  addActiveTime(ms: number): void;

  addPersonalGoal(g: Omit<PersonalGoal, 'id' | 'createdAt' | 'achievedAt'>): void;
  toggleGoalAchieved(id: string): void;
  deletePersonalGoal(id: string): void;

  exportData(): string;
  importData(json: string): { ok: true } | { ok: false; error: string };
  resetAll(): Promise<void>;
}

export type WirdStore = PersistedState & { ready: boolean; loadError: string | null } & Actions;

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

function logProgress(s: Pick<PersistedState, 'verses' | 'progressLog'>, today: string): PersistedState['progressLog'] {
  const memorized = memorizedIds(s.verses).length;
  const log = s.progressLog.filter((p) => p.date !== today);
  const last = log[log.length - 1];
  return !last || last.memorized !== memorized ? [...log, { date: today, memorized }] : log;
}

const core = (s: WirdStore): Core => ({ verses: s.verses, goals: s.goals, rotation: s.rotation, settings: s.settings, plan: s.plan, history: s.history });

export const useWird = create<WirdStore>((set, get) => {
  /** Recalcule les éléments « à faire » du programme après un changement. */
  const rebuild = (patch: Partial<PersistedState> = {}) => {
    const s = { ...get(), ...patch };
    const today = dateKey();
    set({ ...patch, plan: buildPlan(s, today, s.plan) });
  };

  const nextItem = (plan: PersistedState['plan'], afterId?: string | null): PlanItem | null => {
    if (!plan) return null;
    const open = plan.items.filter((i) => i.status === 'pending' || i.status === 'in_progress');
    if (!open.length) return null;
    if (afterId) {
      const idx = plan.items.findIndex((i) => i.id === afterId);
      const later = plan.items.slice(idx + 1).find((i) => i.status === 'pending' || i.status === 'in_progress');
      if (later) return later;
    }
    return open.find((i) => i.status === 'in_progress') ?? open[0];
  };

  const finishSession = () => {
    const s = get();
    const plan = s.plan;
    const today = dateKey();
    if (!plan) return;
    const done = plan.items.filter((i) => i.status === 'done');
    let verses = 0;
    let mastered = 0;
    const surahs = new Set<number>();
    for (const i of done) {
      const n = i.to - i.from + 1;
      verses += n;
      if (i.grade === 'mastered') mastered += n;
      surahs.add(i.surah);
    }
    const summary: SessionSummary = {
      date: today,
      finishedAt: new Date().toISOString(),
      verses,
      mastered,
      toReinforce: verses - mastered,
      surahs: [...surahs],
      activeMs: s.session?.activeMs ?? 0,
      itemsDone: done.length,
      itemsSkipped: plan.items.filter((i) => i.status === 'skipped').length,
      itemsTotal: plan.items.length,
    };
    set({ summaries: [...s.summaries.filter((x) => x.date !== today), summary].slice(-400), session: null });
  };

  return {
    ...emptyState(),
    ready: false,
    loadError: null,

    async init() {
      try {
        const stored = await kvGetAll();
        const base = emptyState();
        const merged: Partial<PersistedState> = {};
        for (const k of PERSISTED_KEYS) if (stored[k] !== undefined) (merged as Record<string, unknown>)[k] = stored[k];
        const settings = { ...base.settings, ...(merged.settings ?? {}), notifications: { ...base.settings.notifications, ...(merged.settings?.notifications ?? {}) } };
        set({ ...base, ...merged, settings, ready: true });
        get().ensureToday();
        void requestPersistentStorage();
      } catch (e) {
        set({ ready: true, loadError: e instanceof Error ? e.message : 'Stockage local indisponible' });
      }
    },

    /** Changement de jour : archive le programme précédent (sans report) et prépare celui d'aujourd'hui. */
    ensureToday() {
      const s = get();
      if (!s.profile.onboarded) return;
      const today = dateKey();
      if (s.plan?.date === today) return;
      let dayLog = s.dayLog;
      if (s.plan && s.plan.items.length) {
        const rec: DayRecord = {
          date: s.plan.date,
          total: s.plan.items.length,
          done: s.plan.items.filter((i) => i.status === 'done').length,
          skipped: s.plan.items.filter((i) => i.status === 'skipped').length,
          notDone: s.plan.items.filter((i) => i.status === 'pending' || i.status === 'in_progress').length,
        };
        dayLog = [...dayLog.filter((d) => d.date !== rec.date), rec].slice(-400);
      }
      set({ dayLog, session: null, plan: buildPlan(s, today, null) });
    },

    completeOnboarding(name, demo) {
      const today = dateKey();
      const verses: Record<number, VerseState> = {};
      const goals: LearningGoal[] = [];
      if (demo) {
        // Données de démonstration : sourates 93 à 114 déjà mémorisées + un apprentissage en cours (sourate 78).
        for (let sNum = 93; sNum <= 114; sNum++)
          for (let a = 1; a <= surahMeta(sNum).n; a++) verses[ayahId(sNum, a)] = newMemorizedVerse(ayahId(sNum, a), today, 'demo');
        for (let a = 1; a <= 10; a++) verses[ayahId(78, a)] = newLearningVerse(ayahId(78, a), today);
        goals.push({ id: uid(), surah: 78, from: 1, to: 10, cursor: 1, paused: false, createdAt: today, completedAt: null });
      }
      const profile = { name: name.trim(), createdAt: today, onboarded: true, demo };
      const progressLog = logProgress({ verses, progressLog: [] }, today);
      set({ profile, verses, goals, progressLog, plan: null });
      rebuild();
    },

    setName(name) {
      set({ profile: { ...get().profile, name: name.trim() } });
    },

    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      if (patch.direction || patch.reviewVersesPerDay || patch.reinforceVersesPerDay || patch.learningEnabled !== undefined || patch.learningChunk) {
        // Le sens change le point de reprise : on repart du curseur existant dans le nouveau sens.
        rebuild({ settings });
      }
      if (patch.notifications) void enqueue('prefs', { prefs: settings.notifications, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    },

    addMemorized(surah, from, to) {
      const today = dateKey();
      const verses = { ...get().verses };
      for (let a = from; a <= to; a++) {
        const id = ayahId(surah, a);
        if (!verses[id] || verses[id].status === 'learning') verses[id] = newMemorizedVerse(id, today);
      }
      rebuild({ verses, progressLog: logProgress({ verses, progressLog: get().progressLog }, today) });
    },

    removeVerses(surah, from, to) {
      const today = dateKey();
      const verses = { ...get().verses };
      for (let a = from; a <= to; a++) delete verses[ayahId(surah, a)];
      // un objectif d'apprentissage dont tous les versets ont disparu est supprimé
      const goals = get().goals.filter((g) => !(g.surah === surah && g.from >= from && g.to <= to && !g.completedAt));
      rebuild({ verses, goals, progressLog: logProgress({ verses, progressLog: get().progressLog }, today) });
    },

    addGoal(surah, from, to) {
      const today = dateKey();
      const verses = { ...get().verses };
      for (let a = from; a <= to; a++) {
        const id = ayahId(surah, a);
        if (!verses[id]) verses[id] = newLearningVerse(id, today);
      }
      const goal: LearningGoal = { id: uid(), surah, from, to, cursor: from, paused: false, createdAt: today, completedAt: null };
      rebuild({ verses, goals: [...get().goals, goal] });
      return goal.id;
    },

    toggleGoalPause(id) {
      rebuild({ goals: get().goals.map((g) => (g.id === id ? { ...g, paused: !g.paused } : g)) });
    },

    completeGoal(id) {
      const today = dateKey();
      const c = completeGoalCore(core(get()), id, today);
      rebuild({ verses: c.verses, goals: c.goals, plan: c.plan, progressLog: logProgress({ verses: c.verses, progressLog: get().progressLog }, today) });
    },

    deleteGoal(id) {
      const g = get().goals.find((x) => x.id === id);
      if (!g) return;
      const verses = { ...get().verses };
      // les versets encore « en apprentissage » de cet objectif ne sont plus suivis ; les mémorisés restent
      for (let a = g.from; a <= g.to; a++) if (verses[ayahId(g.surah, a)]?.status === 'learning') delete verses[ayahId(g.surah, a)];
      const plan = get().plan;
      rebuild({ verses, goals: get().goals.filter((x) => x.id !== id), plan: plan ? { ...plan, items: plan.items.filter((i) => i.goalId !== id || i.status === 'done') } : plan });
    },

    addAdhoc(surah, from, to) {
      const s = get();
      if (!s.plan) return null;
      const n = s.plan.items.filter((i) => i.adhoc).length;
      const item: PlanItem = { id: `${s.plan.date}:adhoc:${n}:${surah}:${from}-${to}`, kind: 'review', surah, from, to, status: 'pending', adhoc: true };
      set({ plan: { ...s.plan, items: [...s.plan.items, item] } });
      return item.id;
    },

    startSession(itemId) {
      get().ensureToday();
      const s = get();
      if (!s.plan) return null;
      const target = itemId ? s.plan.items.find((i) => i.id === itemId) : nextItem(s.plan);
      if (!target || target.status === 'done') return null;
      const c = startItem(core(s), target.id);
      const prev = s.session && s.session.date === s.plan.date ? s.session : null;
      set({
        plan: c.plan,
        session: {
          date: s.plan.date,
          currentItemId: target.id,
          step: prev && prev.currentItemId === target.id ? prev.step : 'recite',
          activeMs: prev?.activeMs ?? 0,
          startedAt: prev?.startedAt ?? new Date().toISOString(),
        },
      });
      return target.id;
    },

    finishRecitation() {
      const s = get().session;
      if (s) set({ session: { ...s, step: 'evaluate' } });
    },
    backToRecitation() {
      const s = get().session;
      if (s) set({ session: { ...s, step: 'recite' } });
    },

    submitGrade(grade) {
      const s = get();
      const sess = s.session;
      if (!sess?.currentItemId || !s.plan) return 'finished';
      const now = new Date();
      const today = dateKey(now);
      const c = evaluateItem(core(s), sess.currentItemId, grade, now, today);
      set({ verses: c.verses, goals: c.goals, rotation: c.rotation, history: c.history, plan: c.plan });
      const nxt = nextItem(c.plan, sess.currentItemId);
      // Prévient le serveur de rappels (si configuré) : stoppe les relances ; `unfinished` = il reste du travail commencé.
      void enqueue('activity', { date: today, at: now.toISOString(), unfinished: nxt !== null, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (!nxt) {
        finishSession();
        return 'finished';
      }
      const started = startItem(core(get()), nxt.id);
      set({ plan: started.plan, session: { ...get().session!, currentItemId: nxt.id, step: 'recite' } });
      return 'next';
    },

    skipCurrent() {
      const s = get();
      const sess = s.session;
      if (!sess?.currentItemId || !s.plan) return 'finished';
      const c = skipItem(core(s), sess.currentItemId);
      set({ plan: c.plan });
      const nxt = nextItem(c.plan, sess.currentItemId);
      if (!nxt) {
        finishSession();
        return 'finished';
      }
      const started = startItem(core(get()), nxt.id);
      set({ plan: started.plan, session: { ...get().session!, currentItemId: nxt.id, step: 'recite' } });
      return 'next';
    },

    skipItem(id) {
      set({ plan: skipItem(core(get()), id).plan });
    },
    reopenItem(id) {
      set({ plan: reopenItem(core(get()), id).plan });
    },

    /** Interrompre : rien n'est perdu, l'élément reste « en cours » et la session est reprise là où elle s'est arrêtée. */
    interrupt(addMs) {
      const s = get().session;
      if (s) set({ session: { ...s, activeMs: s.activeMs + addMs } });
      if (get().history.some((h) => h.date === dateKey())) void enqueue('activity', { date: dateKey(), at: new Date().toISOString(), unfinished: true, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    },
    addActiveTime(ms) {
      const s = get().session;
      if (s && ms > 0) set({ session: { ...s, activeMs: s.activeMs + ms } });
    },

    addPersonalGoal(g) {
      set({ personalGoals: [...get().personalGoals, { ...g, id: uid(), createdAt: dateKey(), achievedAt: null }] });
    },
    toggleGoalAchieved(id) {
      set({ personalGoals: get().personalGoals.map((g) => (g.id === id ? { ...g, achievedAt: g.achievedAt ? null : dateKey() } : g)) });
    },
    deletePersonalGoal(id) {
      set({ personalGoals: get().personalGoals.filter((g) => g.id !== id) });
    },

    exportData() {
      const s = get();
      const data: Record<string, unknown> = {};
      for (const k of PERSISTED_KEYS) data[k] = s[k];
      return JSON.stringify({ app: 'wird', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
    },

    importData(json) {
      try {
        const parsed = JSON.parse(json);
        if (parsed?.app !== 'wird' || typeof parsed.data !== 'object') return { ok: false, error: 'Ce fichier n’est pas une sauvegarde WIRD.' };
        if (parsed.schema > SCHEMA_VERSION) return { ok: false, error: 'Sauvegarde issue d’une version plus récente de WIRD.' };
        const base = emptyState();
        const d = parsed.data as Partial<PersistedState>;
        if (!d.profile || typeof d.verses !== 'object') return { ok: false, error: 'Sauvegarde incomplète.' };
        const next: PersistedState = { ...base, ...d, settings: { ...base.settings, ...d.settings, notifications: { ...base.settings.notifications, ...d.settings?.notifications } } };
        set({ ...next, plan: null, session: null });
        get().ensureToday();
        if (next.plan?.date === dateKey() && !get().plan) rebuild();
        return { ok: true };
      } catch {
        return { ok: false, error: 'Fichier illisible.' };
      }
    },

    async resetAll() {
      await kvClear();
      set({ ...emptyState() });
    },
  };
});

/** Persistance : chaque tranche d'état modifiée est écrite dans IndexedDB (regroupée, ~100 ms). */
export function startPersistence(): void {
  let last: Partial<PersistedState> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const s = useWird.getState();
    if (!s.ready || s.loadError) return;
    const changed: [string, unknown][] = [];
    for (const k of PERSISTED_KEYS) {
      if (s[k] !== last[k]) {
        changed.push([k, s[k] ?? null]);
        (last as Record<string, unknown>)[k] = s[k];
      }
    }
    if (changed.length) void kvSetMany(changed).catch(() => undefined);
  };
  // l'état initial chargé n'a pas besoin d'être réécrit
  const unsub = useWird.subscribe((s) => {
    if (s.ready && Object.keys(last).length === 0) {
      for (const k of PERSISTED_KEYS) (last as Record<string, unknown>)[k] = s[k];
      return;
    }
    if (!timer) timer = setTimeout(flush, 0); // regroupe les changements d’un même tick ; écriture quasi immédiate
  });
  const now = () => {
    if (timer) clearTimeout(timer);
    flush();
  };
  window.addEventListener('pagehide', now);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') now();
  });
  void unsub;
}

export { uid };
