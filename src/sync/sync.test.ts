import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/engine/config';
import type { PersistedState, VerseState } from '@/engine/types';
import { newMemorizedVerse } from '@/engine/scheduling';
import { fmtHlc, observe, parseHlc, tick } from './hlc';
import { countConflicts, mergeRecordSets, toApply, winner } from './merge';
import { diffRecords, readRecord, writeRecord, type SyncRecord } from './records';

const base = (): Pick<PersistedState, 'verses' | 'goals' | 'personalGoals' | 'trash' | 'settings' | 'profile' | 'rotation' | 'history'> => ({
  verses: { 1: newMemorizedVerse(1, '2026-01-01'), 2: newMemorizedVerse(2, '2026-01-01') },
  goals: [],
  personalGoals: [],
  trash: [],
  settings: { ...DEFAULT_SETTINGS },
  profile: { name: 'A', createdAt: '2026-01-01', onboarded: true, demo: false },
  rotation: { cursor: null, cycles: 0 },
  history: [],
});

describe('horloge hybride', () => {
  it('toujours croissante, même si l’horloge recule ; ordre alphabétique = ordre chronologique', () => {
    const a = tick(null, 1_000, 'A');
    const b = tick(a, 500, 'A'); // horloge qui recule
    const c = tick(b, 2_000, 'A');
    expect([a, b, c].sort()).toEqual([a, b, c]);
    expect(parseHlc(b).ms).toBe(1_000);
    expect(parseHlc(b).c).toBe(1);
    expect(observe(a, fmtHlc(5_000, 3, 'B'), 1_000, 'A') > fmtHlc(5_000, 3, 'B')).toBe(true);
  });
});

describe('détection des modifications locales', () => {
  it('versets modifiés, créés, supprimés ; réglages et prénom', () => {
    const a = base();
    const verses: Record<number, VerseState> = { ...a.verses, 3: newMemorizedVerse(3, '2026-02-01') };
    delete verses[1];
    verses[2] = { ...verses[2], strength: 80 };
    const b = { ...a, verses, settings: { ...a.settings, reviewPagesPerDay: 4 }, profile: { ...a.profile, name: 'B' } };
    const d = diffRecords(a, b);
    expect(d.deleted).toEqual(['v:1']);
    expect(d.changed.sort()).toEqual(['p:name', 's:reviewPagesPerDay', 'v:2', 'v:3']);
  });
  it('writeRecord / readRecord : aller-retour sur chaque type d’enregistrement', () => {
    let s = base();
    s = writeRecord(s, 'v:9', newMemorizedVerse(9, '2026-03-01'), false);
    expect(readRecord(s, 'v:9')).toBeTruthy();
    s = writeRecord(s, 'v:9', null, true);
    expect(readRecord(s, 'v:9')).toBeUndefined();
    s = writeRecord(s, 's:theme', 'dark', false);
    expect(s.settings.theme).toBe('dark');
    s = writeRecord(s, 'h:x', { id: 'x', ts: '2026-03-01T00:00:00Z', date: '2026-03-01', kind: 'review', surah: 1, from: 1, to: 2, grade: 'mastered' }, false);
    expect(s.history).toHaveLength(1);
    s = writeRecord(s, 'p:name', 'Zoé', false);
    expect(s.profile.name).toBe('Zoé');
  });
});

describe('fusion des conflits (dernier modifié gagne, convergence)', () => {
  const rec = (key: string, hlc: string, value: unknown, del = false): SyncRecord => ({ key, hlc, del, value });
  const H = (ms: number, d: string) => fmtHlc(ms, 0, d);

  it('la modification la plus récente l’emporte, suppression comprise', () => {
    expect(winner(rec('v:1', H(1, 'A'), 1), rec('v:1', H(2, 'B'), 2))!.value).toBe(2);
    expect(winner(rec('v:1', H(5, 'A'), 1), rec('v:1', H(2, 'B'), null, true))!.value).toBe(1); // modif après suppression : conservée
    expect(winner(rec('v:1', H(2, 'A'), 1), rec('v:1', H(5, 'B'), null, true))!.del).toBe(true);
  });
  it('commutative, associative, idempotente : tous les appareils convergent', () => {
    const A = new Map([rec('v:1', H(1, 'A'), 'a1'), rec('v:2', H(5, 'A'), 'a2'), rec('s:theme', H(3, 'A'), 'dark')].map((r) => [r.key, r] as const));
    const B = new Map([rec('v:1', H(2, 'B'), 'b1'), rec('v:3', H(4, 'B'), 'b3'), rec('v:2', H(6, 'B'), null, true)].map((r) => [r.key, r] as const));
    const C = new Map([rec('v:1', H(2, 'C'), 'c1'), rec('s:theme', H(9, 'C'), 'light')].map((r) => [r.key, r] as const));
    const dump = (m: Map<string, SyncRecord>) => JSON.stringify([...m.entries()].sort(([x], [y]) => x.localeCompare(y)));
    const ab = mergeRecordSets(mergeRecordSets(A, B), C);
    expect(dump(mergeRecordSets(A, B))).toBe(dump(mergeRecordSets(B, A)));
    expect(dump(ab)).toBe(dump(mergeRecordSets(A, mergeRecordSets(C, B))));
    expect(dump(mergeRecordSets(ab, ab))).toBe(dump(ab));
    expect(ab.get('v:1')!.value).toBe('c1'); // même ms : départage déterministe par identifiant d'appareil
    expect(ab.get('v:2')!.del).toBe(true);
  });
  it('n’applique que ce qui est plus récent que la version locale, et compte les vrais conflits', () => {
    const local = new Map([['v:1', H(5, 'A')], ['v:2', H(1, 'A')]]);
    const remote = [rec('v:1', H(3, 'B'), 'x'), rec('v:2', H(4, 'B'), 'y'), rec('v:3', H(1, 'B'), 'z')];
    expect(toApply(remote, (k) => local.get(k)).map((r) => r.key)).toEqual(['v:2', 'v:3']);
    expect(countConflicts([rec('v:1', H(5, 'A'), 'a'), rec('v:2', H(1, 'A'), 'same')], [rec('v:1', H(3, 'B'), 'b'), rec('v:2', H(1, 'B'), 'same')])).toBe(1);
  });
  it('l’historique des évaluations n’est jamais perdu : deux appareils ajoutent des entrées distinctes', () => {
    const e = (id: string) => ({ id, ts: `2026-03-01T0${id}:00:00Z`, date: '2026-03-01', kind: 'review' as const, surah: 1, from: 1, to: 2, grade: 'mastered' as const });
    let s = base();
    s = writeRecord(s, 'h:1', e('1'), false); // appareil A
    s = writeRecord(s, 'h:2', e('2'), false); // appareil B (reçu)
    expect(s.history.map((h) => h.id)).toEqual(['1', '2']);
  });
});
