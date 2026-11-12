import type { Grade, NotificationPrefs, Settings } from './types';

/**
 * Paramètres du moteur de révision — un seul endroit à modifier pour ajuster le comportement.
 */
export const ENGINE = {
  /** Jours avant la prochaine proposition de renforcement après une évaluation moins bonne que « maîtrisé ». */
  reinforceDays: {
    hesitant: 4, // renforcement modéré
    difficult: 2, // renforcement rapproché
    failed: 1, // reprise dès le lendemain
  } satisfies Record<Exclude<Grade, 'mastered'>, number>,

  /**
   * « Maîtrisé » dans le circuit de renforcement : intervalle (jours) avant la prochaine confirmation,
   * selon le nombre de réussites consécutives. Après `confirmDays.length` réussites, le verset sort du renforcement
   * (il reste toujours dans la rotation générale).
   */
  masteredConfirmDays: [7, 21],

  /** Variation de la solidité (0..100) selon l'évaluation. */
  strengthDelta: { mastered: 20, hesitant: -5, difficult: -20, failed: -40 } satisfies Record<Grade, number>,
  strengthInitial: 40,
  /** Seuils d'affichage de la solidité. */
  strong: 70,
  medium: 40,

  /** Taille maximale d'un élément de travail (versets contigus d'une même sourate). */
  chunkSize: 10,

  /** Une sourate est « à entretenir » si ses versets mémorisés n'ont pas été révisés depuis ce nombre de jours. */
  maintainAfterDays: 30,
} as const;

export const GRADE_ORDER: Grade[] = ['mastered', 'hesitant', 'difficult', 'failed'];

export const GRADE_LABEL: Record<Grade, string> = {
  mastered: 'Maîtrisé',
  hesitant: 'Quelques hésitations',
  difficult: 'Difficile',
  failed: 'Non maîtrisé',
};

export const GRADE_HINT: Record<Grade, string> = {
  mastered: 'Récité avec fluidité, sans appui. Prochaine confirmation plus tard.',
  hesitant: 'Quelques accrocs, mais le fond est là. Petit renforcement dans quelques jours.',
  difficult: 'Beaucoup d’appuis nécessaires. Renforcement rapproché.',
  failed: 'À reprendre. Proposé de nouveau dès demain.',
};

export const KIND_LABEL = { review: 'Révision', reinforce: 'Renforcement', learn: 'Nouvel apprentissage' } as const;

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  daily: { enabled: true, time: '07:30' },
  second: { enabled: true, time: '19:30' },
  unfinished: { enabled: true, time: '09:00' },
  comeback: { enabled: true, afterDays: 3, time: '10:00' },
};

export const DEFAULT_SETTINGS: Settings = {
  direction: 'forward',
  reviewVersesPerDay: 20,
  reinforceVersesPerDay: 15,
  learningEnabled: true,
  learningChunk: 5,
  theme: 'system',
  notifications: DEFAULT_NOTIFICATIONS,
};
