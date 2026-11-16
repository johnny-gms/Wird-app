import { describe, expect, it } from 'vitest';
import { migrateSettings, normalizeState } from './migrate';
import type { PersistedState } from '@/engine/types';

describe('migration des données V1', () => {
  it('objectifs en versets → pages, sens d’apprentissage ajouté, notifications conservées', () => {
    const s = migrateSettings({ direction: 'backward', reviewVersesPerDay: 45, learningEnabled: false, learningChunk: 5, reinforceVersesPerDay: 20, theme: 'dark', notifications: { daily: { enabled: false, time: '06:00' } } });
    expect('direction' in s).toBe(false); // le sens de révision n'existe plus
    expect(s.learnDirection).toBe('backward');
    expect(s.reviewPagesPerDay).toBe(3);
    expect(s.learnMode).toBe('off');
    expect(s.reinforceVersesPerDay).toBe(20);
    expect(s.theme).toBe('dark');
    expect(s.notifications.daily).toEqual({ enabled: false, time: '06:00' });
    expect(s.notifications.second.enabled).toBe(true);
    expect('reviewVersesPerDay' in s).toBe(false);
  });
  it('conserve la progression, abandonne l’ancienne séance, « en cours » devient « à faire »', () => {
    const base = { verses: {}, history: [], plan: null, session: null } as unknown as PersistedState;
    const v = { 5: { id: 5, status: 'memorized' } };
    const out = normalizeState(
      { profile: { name: 'A', onboarded: true }, verses: v, history: [{ id: 'h' }], session: { currentItemId: 'x', step: 'recite' }, plan: { date: '2026-01-01', items: [{ id: 'i', status: 'in_progress' }, { id: 'j', status: 'done' }] } } as unknown as Partial<PersistedState> & Record<string, unknown>,
      base,
    );
    expect(out.verses).toEqual(v);
    expect(out.history).toHaveLength(1);
    expect(out.session).toBeNull();
    expect(out.plan!.items.map((i) => i.status)).toEqual(['pending', 'done']);
    expect(out.profile.onboarded).toBe(true);
    expect(out.trash).toEqual([]);
    expect(out.lastValidation).toBeNull();
  });
});

describe('versets déclarés', () => {
  it('un verset mémorisé jamais travaillé est marqué « déclaré », un verset travaillé non', () => {
    const base = { id: 1, status: 'memorized', strength: 50, fragile: false, reinforceDue: null, stage: 0, lastGrade: null, lastReviewedAt: null, reviews: 0, addedAt: '2026-01-01', source: 'user' } as const;
    const out = normalizeState({ verses: { 1: { ...base }, 2: { ...base, id: 2, reviews: 3, lastGrade: 'mastered' } } } as never, {} as never);
    expect(out.verses[1].declared).toBe(true);
    expect(out.verses[2].declared).toBeUndefined();
  });
});

describe('rythme d’apprentissage Hizb / demi-Hizb', () => {
  it('l’ancien objectif en pages devient un demi-Hizb à un rythme équivalent', () => {
    expect(migrateSettings({ learnMode: 'pages', learnPagesPerWeek: 30 })).toMatchObject({ learnMode: 'hizb', learnUnit: 'half', learnEvery: 1 });
    expect(migrateSettings({ learnMode: 'pages', learnPagesPerWeek: 14 })).toMatchObject({ learnMode: 'hizb', learnEvery: 2 });
    expect(migrateSettings({ learnMode: 'pages', learnPagesPerWeek: 3 })).toMatchObject({ learnMode: 'hizb', learnEvery: 7 });
    expect(migrateSettings({ learnMode: 'pages', learnPagesPerWeek: 0 }).learnMode).toBe('off');
    expect(migrateSettings({ learnMode: 'surah' }).learnMode).toBe('surah');
  });
});
