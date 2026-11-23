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
  /** Verset déclaré « déjà appris » avant WIRD et jamais travaillé dans l'application : signalé tel quel jusqu'à sa première évaluation dans WIRD. */
  declared?: boolean;
}

export interface LearningGoal {
  id: string;
  surah: number;
  from: number;
  to: number;
  /** Prochain verset à travailler. > to quand tout a été parcouru. */
  cursor: number;
  /** Créé automatiquement par WIRD (prochaine sourate dans le sens d'apprentissage) ; terminé automatiquement. */
  auto?: boolean;
  /** Objectifs d'un même Hizb / demi-Hizb créés ensemble (ex. « h:3 », « hh:5 ») : ils partagent le rythme du jour. */
  unitKey?: string;
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
  /** Révision « en plus » demandée par l'utilisateur (reste au programme tant qu'elle n'est pas faite). */
  extra?: boolean;
  doneAt?: string;
}

export interface DailyPlan {
  date: string;
  items: PlanItem[];
  /** Objectif d'apprentissage par semaine : il reste du budget alors que les objectifs ouverts sont épuisés. */
  moreLearn?: boolean;
}

/** Évaluation en cours de saisie pour un élément : une note, ou « skip » (non travaillé). */
export type DraftGrade = Grade | 'skip';

/**
 * Séance : on consulte le programme, on travaille, puis on évalue TOUT d'un coup (« Passer à l'évaluation »).
 * Les évaluations saisies restent un brouillon modifiable jusqu'à la validation du bilan.
 */
/** Mode de séance : avec un Mushaf papier, ou directement dans WIRD (dévoilement cumulatif des versets). */
export type SessionMode = 'mushaf' | 'phone';

/** Progression d'un passage en mode Téléphone. */
export interface PhoneProgress {
  /** Nombre de versets dévoilés (cumulatif : les précédents restent intégrés). */
  shown: number;
  /** Tous les versets dévoilés sont masqués (récitation de mémoire). */
  hidden: boolean;
  /** Passage travaillé jusqu'au bout. */
  done: boolean;
}

export interface SessionState {
  date: string;
  step: 'choose' | 'program' | 'evaluate';
  mode?: SessionMode;
  /** Séance principale du jour ou séance supplémentaire. */
  kind?: 'main' | 'extra';
  /** Durée indicative choisie pour une séance supplémentaire (jamais une limite). */
  minutes?: number;
  /** Mode Téléphone : progression par passage (clé = signature du passage, stable d'un jour à l'autre). */
  phone?: Record<string, PhoneProgress>;
  /** Mode Téléphone : signature du passage ouvert. */
  current?: string | null;
  /** id d'élément → signature, pour retrouver ses évaluations si la séance est reprise le lendemain. */
  sigs?: Record<string, string>;
  /** Éléments du programme concernés par la séance (ordre du programme). */
  scope: 'all' | string[];
  draft: Record<string, DraftGrade>;
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

/** Rythme d'apprentissage : une sourate par semaine, un Hizb / demi-Hizb à intervalle choisi, ou aucun nouvel apprentissage. */
export type LearnMode = 'surah' | 'hizb' | 'off';
export type LearnUnit = 'half' | 'full';
/** Un passage tous les N jours (1 = chaque jour, 2 = tous les 2 jours, 7 = chaque semaine). */
export type LearnEvery = 1 | 2 | 7;

export type Gender = 'male' | 'female';

export interface Settings {
  /** Sens dans lequel on apprend de NOUVELLES sourates (indépendant du sens de révision). */
  learnDirection: Direction;
  /** Rythme d'apprentissage : « une sourate par semaine » (débutants) ou un nombre de pages par semaine. */
  learnMode: LearnMode;
  /** Unité du mode « hizb » : demi-Hizb ou Hizb. */
  learnUnit: LearnUnit;
  /** Rythme du mode « hizb » : une unité tous les N jours. */
  learnEvery: LearnEvery;
  /** Objectif quotidien de révision, en pages entières du Mushaf. */
  reviewPagesPerDay: number;
  /** Objectif d'apprentissage par semaine (niveaux Débutant / Intermédiaire / Avancé) : en versets ou en pages. null = ancien réglage (rythme par sourate / Hizb). */
  learnWeekly: { unit: 'verses' | 'pages'; amount: number; level?: 'intermediate' | 'advanced' } | null;
  /** Objectif de révision par semaine : en pages, en Hizb ou en Juz (toujours du début à la fin du Coran). null = pages par jour. */
  reviewWeekly: { unit: 'pages' | 'hizb' | 'juz'; amount: number } | null;
  /** Plafond de versets de renforcement proposés par jour. */
  reinforceVersesPerDay: number;
  theme: ThemeMode;
  /** Retours haptiques (vibrations) lorsque l'appareil les permet. */
  haptics: boolean;
  notifications: NotificationPrefs;
}

export interface Profile {
  name: string;
  age?: number | null;
  gender?: Gender | null;
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

/** Élément de la corbeille (conservé 30 jours, restaurable). */
export type TrashItem =
  | { id: string; kind: 'verses'; deletedAt: string; label: string; verses: VerseState[] }
  | { id: string; kind: 'goal'; deletedAt: string; label: string; goal: LearningGoal; verses: VerseState[] }
  | { id: string; kind: 'personalGoal'; deletedAt: string; label: string; goal: PersonalGoal };

/** Instantané avant une validation de séance : permet « Annuler la validation ». */
export interface UndoSnapshot {
  at: string; // ISO
  date: string;
  /** États des versets AVANT la validation (absent = verset non suivi). */
  verses: Record<number, VerseState | null>;
  goals: LearningGoal[];
  rotation: RotationState;
  plan: DailyPlan | null;
  session: SessionState | null;
  progressLog: ProgressPoint[];
  summaries: SessionSummary[];
  /** Entrées d'historique ajoutées par la validation. */
  historyIds: string[];
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
  trash: TrashItem[];
  lastValidation: UndoSnapshot | null;
}
