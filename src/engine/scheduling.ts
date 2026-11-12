import { ENGINE } from './config';
import { addDays } from './dates';
import type { Grade, VerseState } from './types';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Nouveau verset déjà mémorisé (saisi par l'utilisateur) : entre dans la rotation, sans renforcement imposé. */
export function newMemorizedVerse(id: number, today: string, source: 'user' | 'demo' = 'user'): VerseState {
  return {
    id,
    status: 'memorized',
    strength: 50,
    fragile: false,
    reinforceDue: null,
    stage: 0,
    lastGrade: null,
    lastReviewedAt: null,
    reviews: 0,
    addedAt: today,
    source,
  };
}

export function newLearningVerse(id: number, today: string): VerseState {
  return {
    id,
    status: 'learning',
    strength: 0,
    fragile: false,
    reinforceDue: null,
    stage: 0,
    lastGrade: null,
    lastReviewedAt: null,
    reviews: 0,
    addedAt: today,
    source: 'user',
  };
}

/** Un verset en cours d'apprentissage devient mémorisé : confirmation proposée dès le lendemain. */
export function promoteLearned(v: VerseState, today: string): VerseState {
  return {
    ...v,
    status: 'memorized',
    strength: Math.max(v.strength, ENGINE.strengthInitial),
    fragile: true,
    stage: 0,
    reinforceDue: addDays(today, 1),
  };
}

/**
 * Applique une évaluation à un verset.
 *  - La rotation générale n'est JAMAIS modifiée ici : un verset reste mémorisé quelle que soit la note.
 *  - Le renforcement (fragile / reinforceDue) est un mécanisme distinct, piloté par la note.
 */
export function applyGrade(v: VerseState, grade: Grade, today: string): VerseState {
  const next: VerseState = {
    ...v,
    strength: clamp(v.strength + ENGINE.strengthDelta[grade]),
    lastGrade: grade,
    lastReviewedAt: today,
    reviews: v.reviews + 1,
  };
  if (v.status === 'learning') return next;

  if (grade === 'mastered') {
    if (v.fragile) {
      const stage = v.stage + 1;
      const days = ENGINE.masteredConfirmDays;
      if (stage >= days.length) {
        next.fragile = false;
        next.reinforceDue = null;
        next.stage = 0;
      } else {
        next.stage = stage;
        next.reinforceDue = addDays(today, days[stage - 1]);
      }
    }
    return next;
  }
  next.fragile = true;
  next.stage = 0;
  next.reinforceDue = addDays(today, ENGINE.reinforceDays[grade]);
  return next;
}

export type Solidity = 'strong' | 'medium' | 'fragile';
export function solidity(v: VerseState): Solidity {
  if (v.fragile || v.strength < ENGINE.medium) return 'fragile';
  return v.strength >= ENGINE.strong ? 'strong' : 'medium';
}
