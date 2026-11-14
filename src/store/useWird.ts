import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '@/engine/config';
import { dateKey } from '@/engine/dates';
import {
  buildPlan,
  completeGoal as completeGoalCore,
  evaluateItem,
  hasOpenGoal,
  learningEnabled,
  memorizedIds,
  nextLearnTarget,
  reopenItem,
  skipItem,
  type Core,
} from '@/engine/plan';
import { SURAHS, ayahId, surahMeta } from '@/engine/quran';
import { newLearningVerse, newMemorizedVerse } from '@/engine/scheduling';
import type {
  DayRecord,
  Direction,
  DraftGrade,
  LearnMode,
  LearningGoal,
  PersistedState,
  Profile,
  PersonalGoal,
  PlanItem,
  Settings,
  SessionState,
  TrashItem,
  SessionSummary,
  UndoSnapshot,
  VerseState,
} from '@/engine/types';
import { kvClear, kvGetAll, kvSetMany, requestPersistentStorage } from '@/storage/db';
import { enqueue } from '@/sync/outbox';
import { normalizeState } from './migrate';
import { purgeTrash, trashGoal, trashPersonalGoal, trashVerses } from '@/engine/trash';

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
  trash: [],
  lastValidation: null,
});

const PERSISTED_KEYS = Object.keys(emptyState()) as (keyof PersistedState)[];

interface Actions {
  init(): Promise<void>;
  ensureToday(): void;
  completeOnboarding(cfg: OnboardingConfig): void;
  setName(name: string): void;
  updateProfile(patch: Partial<Pick<Profile, 'name' | 'age' | 'gender'>>): void;
  updateSettings(patch: Partial<Settings>): void;

  addMemorized(surah: number, from: number, to: number): void;
  removeVerses(surah: number, from: number, to: number): void;
  addGoal(surah: number, from: number, to: number): string;
  toggleGoalPause(id: string): void;
  completeGoal(id: string): void;
  deleteGoal(id: string): void;

  addAdhoc(surah: number, from: number, to: number): string | null;
  /** Ouvre la séance (tout le programme restant, ou un seul élément). Retourne false s'il n'y a rien à faire. */
  startSession(only?: string | string[]): boolean;
  openEvaluation(): void;
  backToProgram(): void;
  setDraft(itemId: string, grade: DraftGrade | null): void;
  /** Valide le bilan : applique toutes les évaluations. Retourne 'bilan' si du travail a été enregistré. */
  validateSession(): 'bilan' | 'none';
  skipItem(id: string): void;
  reopenItem(id: string): void;
  interrupt(addMs: number): void;
  addActiveTime(ms: number): void;

  addPersonalGoal(g: Omit<PersonalGoal, 'id' | 'createdAt' | 'achievedAt'>): void;
  toggleGoalAchieved(id: string): void;
  deletePersonalGoal(id: string): void;

  /** Sourates entières « déjà apprises » : ajoute les nouvelles, retire (corbeille) celles décochées jamais travaillées. */
  applyKnownSurahs(selected: number[]): void;
  /** Passe des versets appris en « à renforcer » dès aujourd'hui (ils restent dans la rotation). */
  flagReinforce(surah: number, from: number, to: number): void;
  /** Recalcule le programme du jour (éléments non faits uniquement). */
  refreshPlan(): void;
  restoreTrash(id: string): void;
  deleteTrashItem(id: string): void;
  undoValidation(): boolean;

  exportData(): string;
  importData(json: string): { ok: true } | { ok: false; error: string };
  resetAll(): Promise<void>;
}

export interface OnboardingConfig {
  name: string;
  /** Sourates déjà apprises (entrent dans la rotation de révision). */
  knownSurahs: number[];
  learnDirection: Direction;
  learnMode: LearnMode;
  learnPagesPerWeek: number;
  reviewPagesPerDay: number;
  demo?: boolean;
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
  /**
   * Recalcule les éléments « à faire » du programme après un changement.
   * Si aucun objectif d'apprentissage n'est ouvert et que l'utilisateur vise des pages à apprendre, WIRD ouvre
   * automatiquement la prochaine sourate dans le sens d'apprentissage choisi.
   */
  const rebuild = (patch: Partial<PersistedState> = {}) => {
    let s = { ...get(), ...patch };
    const today = dateKey();
    if (s.profile.onboarded && learningEnabled(s.settings) && !hasOpenGoal(s)) {
      const t = nextLearnTarget(s.verses, s.goals, s.settings.learnDirection);
      if (t) {
        const verses = { ...s.verses };
        for (let a = t.from; a <= t.to; a++) {
          const id = ayahId(t.surah, a);
          if (!verses[id]) verses[id] = newLearningVerse(id, today);
        }
        const goal: LearningGoal = { id: uid(), surah: t.surah, from: t.from, to: t.to, cursor: t.from, paused: false, createdAt: today, completedAt: null, auto: true };
        patch = { ...patch, verses, goals: [...s.goals, goal] };
        s = { ...s, ...patch };
      }
    }
    // Séance ouverte : on ne garde que les éléments encore présents et à faire.
    let session = s.session;
    const nextPlan = buildPlan(s, today, s.plan);
    if (session) {
      const open = new Set(nextPlan.items.filter((i) => i.status === 'pending').map((i) => i.id));
      if (session.scope !== 'all') {
        const scope = session.scope.filter((id) => open.has(id));
        session = scope.length ? { ...session, scope } : null;
      } else if (open.size === 0) session = null;
    }
    // toute modification structurelle (ajout, retrait, réglage, nouveau jour) clôt la possibilité d'annuler la dernière validation
    set({ lastValidation: null, ...patch, plan: nextPlan, session });
  };

  const finishSummary = () => {
    const s = get();
    const plan = s.plan;
    const today = dateKey();
    if (!plan) return;
    const done = plan.items.filter((i) => i.status === 'done');
    if (!done.length) return;
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
      activeMs: (s.summaries.find((x) => x.date === today)?.activeMs ?? 0) + (s.session?.activeMs ?? 0),
      itemsDone: done.length,
      itemsSkipped: plan.items.filter((i) => i.status === 'skipped').length,
      itemsTotal: plan.items.length,
    };
    set({ summaries: [...s.summaries.filter((x) => x.date !== today), summary].slice(-400) });
  };

  return {
    ...emptyState(),
    ready: false,
    loadError: null,

    async init() {
      try {
        const stored = await kvGetAll();
        const base = emptyState();
        const picked: Record<string, unknown> = {};
        for (const k of PERSISTED_KEYS) if (stored[k] !== undefined) picked[k] = stored[k];
        // Migration : les données enregistrées par la V1 sont conservées et remises à niveau.
        set({ ...normalizeState(picked as Partial<PersistedState>, base), ready: true });
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
      // corbeille : purge à 30 jours ; annulation de validation : disponible 24 h
      const purged = purgeTrash(s.trash, today);
      if (purged.length !== s.trash.length) set({ trash: purged });
      if (s.lastValidation && Date.now() - new Date(s.lastValidation.at).getTime() > 86_400_000) set({ lastValidation: null });
      if (s.plan?.date === today) return;
      let dayLog = s.dayLog;
      if (s.plan && s.plan.items.length) {
        const rec: DayRecord = {
          date: s.plan.date,
          total: s.plan.items.length,
          done: s.plan.items.filter((i) => i.status === 'done').length,
          skipped: s.plan.items.filter((i) => i.status === 'skipped').length,
          notDone: s.plan.items.filter((i) => i.status === 'pending').length,
        };
        dayLog = [...dayLog.filter((d) => d.date !== rec.date), rec].slice(-400);
      }
      rebuild({ dayLog, session: null, plan: null });
    },

    /** Fin du parcours de premier lancement : enregistre la configuration et les sourates déjà apprises. */
    completeOnboarding(cfg) {
      const today = dateKey();
      const verses: Record<number, VerseState> = {};
      const goals: LearningGoal[] = [];
      const known = new Set(cfg.knownSurahs);
      if (cfg.demo) for (let sNum = 93; sNum <= 114; sNum++) known.add(sNum);
      for (const sNum of known)
        for (let a = 1; a <= surahMeta(sNum).n; a++) verses[ayahId(sNum, a)] = newMemorizedVerse(ayahId(sNum, a), today, cfg.demo ? 'demo' : 'user');
      if (cfg.demo) {
        for (let a = 1; a <= 10; a++) verses[ayahId(78, a)] = newLearningVerse(ayahId(78, a), today);
        goals.push({ id: uid(), surah: 78, from: 1, to: 10, cursor: 1, paused: false, createdAt: today, completedAt: null });
      }
      const settings: Settings = {
        ...get().settings,
        learnDirection: cfg.learnDirection,
        learnMode: cfg.learnMode,
        learnPagesPerWeek: cfg.learnPagesPerWeek,
        reviewPagesPerDay: cfg.reviewPagesPerDay,
      };
      const profile = { name: cfg.name.trim(), createdAt: today, onboarded: true, demo: !!cfg.demo };
      const progressLog = logProgress({ verses, progressLog: [] }, today);
      rebuild({ profile, verses, goals, settings, progressLog, plan: null, rotation: { cursor: null, cycles: 0 }, session: null });
    },

    updateProfile(patch) {
      set({ profile: { ...get().profile, ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) } });
    },

    setName(name) {
      set({ profile: { ...get().profile, name: name.trim() } });
    },

    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      if (patch.learnDirection || patch.learnMode !== undefined || patch.learnPagesPerWeek !== undefined || patch.reviewPagesPerDay !== undefined || patch.reinforceVersesPerDay) {
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

    /** Retire des versets du suivi : ils vont à la corbeille (restaurables 30 jours). */
    removeVerses(surah, from, to) {
      const today = dateKey();
      const t = trashVerses(get().verses, surah, from, to, new Date());
      // un objectif d'apprentissage dont tous les versets ont disparu est supprimé (et mis à la corbeille)
      const removedGoals = get().goals.filter((g) => g.surah === surah && g.from >= from && g.to <= to && !g.completedAt);
      const goals = get().goals.filter((g) => !removedGoals.includes(g));
      const trash = [...get().trash, ...(t.item ? [t.item] : []), ...removedGoals.map((g) => trashGoal(g, [], new Date()))];
      rebuild({ verses: t.verses, goals, trash, progressLog: logProgress({ verses: t.verses, progressLog: get().progressLog }, today) });
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
      // les versets encore « en apprentissage » de cet objectif ne sont plus suivis (corbeille) ; les mémorisés restent
      const removed: VerseState[] = [];
      for (let a = g.from; a <= g.to; a++) {
        const vid = ayahId(g.surah, a);
        if (verses[vid]?.status === 'learning') {
          removed.push(verses[vid]);
          delete verses[vid];
        }
      }
      const plan = get().plan;
      rebuild({
        verses,
        goals: get().goals.filter((x) => x.id !== id),
        trash: [...get().trash, trashGoal(g, removed, new Date())],
        plan: plan ? { ...plan, items: plan.items.filter((i) => i.goalId !== id || i.status === 'done') } : plan,
      });
    },

    addAdhoc(surah, from, to) {
      const s = get();
      if (!s.plan) return null;
      const n = s.plan.items.filter((i) => i.adhoc).length;
      const item: PlanItem = { id: `${s.plan.date}:adhoc:${n}:${surah}:${from}-${to}`, kind: 'review', surah, from, to, status: 'pending', adhoc: true };
      set({ plan: { ...s.plan, items: [...s.plan.items, item] } });
      return item.id;
    },

    startSession(only) {
      get().ensureToday();
      const s = get();
      if (!s.plan) return false;
      const open = s.plan.items.filter((i) => i.status === 'pending');
      const ids = only === undefined ? null : Array.isArray(only) ? only : [only];
      if (ids ? !ids.some((id) => open.some((i) => i.id === id)) : open.length === 0) return false;
      const wanted: SessionState['scope'] = ids ?? 'all';
      const prev = s.session && s.session.date === s.plan.date ? s.session : null;
      const same = prev && JSON.stringify(prev.scope) === JSON.stringify(wanted);
      if (same) return true; // reprise : brouillon d'évaluation conservé
      set({ session: { date: s.plan.date, step: 'program', scope: wanted, draft: {}, activeMs: prev?.activeMs ?? 0, startedAt: prev?.startedAt ?? new Date().toISOString() } });
      return true;
    },

    openEvaluation() {
      const s = get().session;
      if (s) set({ session: { ...s, step: 'evaluate' } });
    },
    backToProgram() {
      const s = get().session;
      if (s) set({ session: { ...s, step: 'program' } });
    },
    setDraft(itemId, grade) {
      const s = get().session;
      if (!s) return;
      const draft = { ...s.draft };
      if (grade === null) delete draft[itemId];
      else draft[itemId] = grade;
      set({ session: { ...s, draft } });
    },

    /**
     * Valide le bilan de la séance : chaque évaluation est appliquée dans l'ordre du programme
     * (solidité, renforcement, historique, rotation, apprentissage). Un élément « non travaillé » est ignoré pour aujourd'hui.
     */
    validateSession() {
      const s = get();
      const sess = s.session;
      if (!sess || !s.plan) return 'none';
      const now = new Date();
      const today = dateKey(now);
      const inScope = (id: string) => (sess.scope === 'all' ? true : sess.scope.includes(id));
      let c = core(s);
      let evaluated = 0;
      for (const it of s.plan.items) {
        if (it.status !== 'pending' || !inScope(it.id)) continue;
        const d = sess.draft[it.id];
        if (!d) continue;
        if (d === 'skip') c = skipItem(c, it.id);
        else {
          c = evaluateItem(c, it.id, d, now, today);
          evaluated++;
        }
      }
      // instantané « avant » (uniquement les versets modifiés) pour pouvoir annuler une validation accidentelle
      const before: Record<number, VerseState | null> = {};
      for (const k in c.verses) if (c.verses[k] !== s.verses[k]) before[Number(k)] = s.verses[k] ?? null;
      const lastValidation: UndoSnapshot | null =
        evaluated > 0
          ? { at: now.toISOString(), date: today, verses: before, goals: s.goals, rotation: s.rotation, plan: s.plan, session: sess, progressLog: s.progressLog, summaries: s.summaries, historyIds: c.history.slice(s.history.length).map((h) => h.id) }
          : s.lastValidation;
      set({ verses: c.verses, goals: c.goals, rotation: c.rotation, history: c.history, plan: c.plan, lastValidation, progressLog: logProgress({ verses: c.verses, progressLog: s.progressLog }, today) });
      const stillOpen = (c.plan?.items ?? []).some((i) => i.status === 'pending');
      if (evaluated > 0) void enqueue('activity', { date: today, at: now.toISOString(), unfinished: stillOpen, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      finishSummary();
      set({ session: null });
      return evaluated > 0 ? 'bilan' : 'none';
    },

    /** Annule la dernière validation : tout revient comme avant, et la séance se rouvre à l'évaluation (brouillon conservé). */
    undoValidation() {
      const snap = get().lastValidation;
      if (!snap) return false;
      const verses = { ...get().verses };
      for (const k in snap.verses) {
        const v = snap.verses[k];
        if (v === null) delete verses[Number(k)];
        else verses[Number(k)] = v;
      }
      const ids = new Set(snap.historyIds);
      set({
        verses,
        goals: snap.goals,
        rotation: snap.rotation,
        plan: snap.plan,
        session: snap.session ? { ...snap.session, step: 'evaluate' } : null,
        history: get().history.filter((h) => !ids.has(h.id)),
        progressLog: snap.progressLog,
        summaries: snap.summaries,
        lastValidation: null,
      });
      return true;
    },

    skipItem(id) {
      set({ plan: skipItem(core(get()), id).plan });
    },
    reopenItem(id) {
      set({ plan: reopenItem(core(get()), id).plan });
    },

    /** Interrompre : rien n'est perdu, la séance (et le brouillon d'évaluation) se reprend là où elle s'est arrêtée. */
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
      const g = get().personalGoals.find((x) => x.id === id);
      if (!g) return;
      set({ personalGoals: get().personalGoals.filter((x) => x.id !== id), trash: [...get().trash, trashPersonalGoal(g, new Date())] });
    },

    applyKnownSurahs(selected) {
      const today = dateKey();
      const verses0 = get().verses;
      const complete = new Set<number>();
      for (const sObj of SURAHS) {
        let all = true;
        for (let a = 1; a <= sObj.n; a++) if (verses0[ayahId(sObj.id, a)]?.status !== 'memorized') { all = false; break; }
        if (all) complete.add(sObj.id);
      }
      const want = new Set(selected);
      let verses = { ...verses0 };
      const trashAdd: TrashItem[] = [];
      for (const id of want) {
        if (complete.has(id)) continue;
        for (let a = 1; a <= surahMeta(id).n; a++) {
          const k = ayahId(id, a);
          if (!verses[k] || verses[k].status === 'learning') verses[k] = newMemorizedVerse(k, today);
        }
      }
      for (const id of complete) {
        if (want.has(id)) continue;
        // on ne retire que les versets jamais travaillés dans l'app ; ceux qui ont un historique restent
        const t = trashVerses(verses, id, 1, surahMeta(id).n, new Date());
        const keep = (t.item?.kind === 'verses' ? t.item.verses : []).filter((v) => v.reviews > 0 || v.lastReviewedAt);
        verses = { ...t.verses };
        for (const v of keep) verses[v.id] = v;
        if (t.item && t.item.kind === 'verses') {
          const removed = t.item.verses.filter((v) => !(v.reviews > 0 || v.lastReviewedAt));
          if (removed.length) trashAdd.push({ ...t.item, verses: removed });
        }
      }
      rebuild({ verses, trash: [...get().trash, ...trashAdd], progressLog: logProgress({ verses, progressLog: get().progressLog }, today) });
    },

    flagReinforce(surah, from, to) {
      const today = dateKey();
      const verses = { ...get().verses };
      for (let a = from; a <= to; a++) {
        const id = ayahId(surah, a);
        const v = verses[id];
        if (v && v.status === 'memorized') verses[id] = { ...v, fragile: true, stage: 0, reinforceDue: today };
      }
      rebuild({ verses });
    },

    refreshPlan() {
      rebuild();
    },

    /** Restaure un élément de la corbeille (versets, objectif d'apprentissage ou objectif personnel). */
    restoreTrash(id) {
      const item = get().trash.find((t) => t.id === id);
      if (!item) return;
      const trash = get().trash.filter((t) => t.id !== id);
      if (item.kind === 'personalGoal') {
        set({ trash, personalGoals: [...get().personalGoals, item.goal] });
        return;
      }
      const verses = { ...get().verses };
      for (const v of item.verses) if (!verses[v.id]) verses[v.id] = v; // ne jamais écraser un verset ressuivi depuis
      const goals = item.kind === 'goal' && !get().goals.some((g) => g.id === item.goal.id) ? [...get().goals, item.goal] : get().goals;
      rebuild({ verses, goals, trash, progressLog: logProgress({ verses, progressLog: get().progressLog }, dateKey()) });
    },
    deleteTrashItem(id) {
      set({ trash: get().trash.filter((t) => t.id !== id) });
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
        const next = normalizeState(d as Partial<PersistedState> & Record<string, unknown>, base);
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
