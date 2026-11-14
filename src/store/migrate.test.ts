import { describe, expect, it } from 'vitest';
import { migrateSettings, normalizeState } from './migrate';
import type { PersistedState } from '@/engine/types';

describe('migration des données V1', () => {
  it('objectifs en versets → pages, sens d’apprentissage ajouté, notifications conservées', () => {
    const s = migrateSettings({ direction: 'backward', reviewVersesPerDay: 45, learningEnabled: false, learningChunk: 5, reinforceVersesPerDay: 20, theme: 'dark', notifications: { daily: { enabled: false, time: '06:00' } } });
    expect('direction' in s).toBe(false); // le sens de révision n'existe plus
    expect(s.learnDirection).toBe('backward');
    expect(s.reviewPagesPerDay).toBe(3);
    expect(s.learnPagesPerWeek).toBe(0);
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
