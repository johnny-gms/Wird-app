/** Modèles de données WIRD. Identifiant de verset stable = numéro global 1..6236 (ordre du Mushaf). */

export type Grade = 'mastered' | 'hesitant' | 'difficult' | 'failed';
export type WorkKind = 'review' | 'reinforce' | 'learn';
export type ItemStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type Direction = 'forward' | 'backward';
export type ThemeMode = 'light' | 'dark' | 'system';

/** État d'un verset suivi. Un verset absent de la table n'est pas suivi. */
export interface VerseState {
  id: number;
  status: 'learning' | 'memorized';
  /** Solidité 0..100, pilotée par les évaluations. */
  strength: number;
  /** Verset dans le circuit de renforcement (indépendant de la rotation). */
  fragile: boolean;
  /** Date (AAAA-MM-JJ) à partir de laquelle le renforcement est proposé. */
  reinforceDue: string | null;
  /** Nombre de « maîtrisé » consécutifs dans le circuit de renforcement. */
  stage: number;
  lastGrade: Grade | null;
  lastReviewedAt: string | null; // AAAA-MM-JJ
  reviews: number;
  addedAt: string; // AAAA-MM-JJ
  source: 'user' | 'demo';
}

export interface LearningGoal {
  id: string;
  surah: number;
  from: number;
  to: number;
  /** Prochain verset à travailler. > to quand tout a été parcouru. */
  cursor: number;
  paused: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface PlanItem {
  id: string;
  kind: WorkKind;
  surah: number;
  from: number;
  to: number;
  status: ItemStatus;
  grade?: Grade;
  goalId?: string;
  /** Rotation : id global du dernier verset du morceau, dans le sens de parcours. */
  endCursor?: number;
  wraps?: boolean;
  /** Le curseur de rotation a déjà été avancé pour cet élément. */
  applied?: boolean;
  /** Ajouté à la demande (n'influence pas la rotation). */
  adhoc?: boolean;
  doneAt?: string;
}

export interface DailyPlan {
  date: string;
  items: PlanItem[];
}

export interface SessionState {
  date: string;
  currentItemId: string | null;
  step: 'recite' | 'evaluate';
  /** Temps actif cumulé (ms), mesuré uniquement quand l'application est visible. */
  activeMs: number;
  startedAt: string;
}

export interface HistoryEntry {
  id: string;
  ts: string; // ISO
  date: string; // AAAA-MM-JJ
  kind: WorkKind;
  surah: number;
  from: number;
  to: number;
  grade: Grade;
}

export interface ProgressPoint {
  date: string;
  memorized: number;
}

export interface SessionSummary {
  date: string;
  finishedAt: string;
  verses: number;
  mastered: number;
  toReinforce: number;
  surahs: number[];
  activeMs: number;
  itemsDone: number;
  itemsSkipped: number;
  itemsTotal: number;
}

export type GoalType = 'memorization' | 'review' | 'regularity';
export interface PersonalGoal {
  id: string;
  type: GoalType;
  title: string;
  /** memorization : sourate ciblée (progression calculée automatiquement). */
  surah?: number;
  /** regularity : jours actifs souhaités par semaine (facultatif). */
  daysPerWeek?: number;
  createdAt: string;
  achievedAt: string | null;
}

export interface NotificationPrefs {
  daily: { enabled: boolean; time: string };
  second: { enabled: boolean; time: string };
  unfinished: { enabled: boolean; time: string };
  comeback: { enabled: boolean; afterDays: number; time: string };
}

export interface Settings {
  direction: Direction;
  /** Quantité de rotation par jour, en versets (indicatif, jamais une dette). */
  reviewVersesPerDay: number;
  /** Plafond de versets de renforcement proposés par jour. */
  reinforceVersesPerDay: number;
  learningEnabled: boolean;
  /** Taille d'un élément d'apprentissage, en versets. */
  learningChunk: number;
  theme: ThemeMode;
  notifications: NotificationPrefs;
}

export interface Profile {
  name: string;
  createdAt: string;
  onboarded: boolean;
  demo: boolean;
}

export interface RotationState {
  /** id global du dernier verset révisé ; null = pas encore commencé. */
  cursor: number | null;
  cycles: number;
}

/** Bilan d'une journée passée (aucun report : ce qui n'a pas été fait n'est pas dû). */
export interface DayRecord {
  date: string;
  total: number;
  done: number;
  skipped: number;
  notDone: number;
}

/** Instantané complet persisté (hors table des versets, stockée à part). */
export interface PersistedState {
  profile: Profile;
  settings: Settings;
  verses: Record<number, VerseState>;
  goals: LearningGoal[];
  plan: DailyPlan | null;
  session: SessionState | null;
  rotation: RotationState;
  history: HistoryEntry[];
  progressLog: ProgressPoint[];
  summaries: SessionSummary[];
  personalGoals: PersonalGoal[];
  dayLog: DayRecord[];
}
