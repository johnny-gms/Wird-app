import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/engine/config';
import { newMemorizedVerse } from '@/engine/scheduling';
import type { HistoryEntry, VerseState } from '@/engine/types';
import { SyncEngine, type SyncSlice, type Transport } from './engine';
import type { SyncRecord } from './records';

/** Serveur en mémoire, même règle que le Worker : on garde, par clé, la version la plus récente (HLC). */
class FakeServer {
  rows = new Map<string, SyncRecord>();
  transport(): Transport {
    return {
      push: async (records) => { for (const r of records) { const c = this.rows.get(r.key); if (!c || r.hlc > c.hlc) this.rows.set(r.key, r); } },
      pull: async (since) => { const records = [...this.rows.values()].filter((r) => r.hlc > since).sort((a, b) => a.hlc.localeCompare(b.hlc)); return { records, cursor: records.at(-1)?.hlc ?? since }; },
    };
  }
}

const slice = (verses: Record<number, VerseState> = {}): SyncSlice => ({ verses, goals: [], personalGoals: [], trash: [], settings: { ...DEFAULT_SETTINGS }, profile: { name: '', createdAt: '2026-01-01', onboarded: true, demo: false }, rotation: { cursor: null, cycles: 0 }, history: [] });
const entry = (id: string, ts: string): HistoryEntry => ({ id, ts, date: ts.slice(0, 10), kind: 'review', surah: 1, from: 1, to: 2, grade: 'mastered' });

class Device {
  state: SyncSlice;
  eng: SyncEngine;
  constructor(public name: string, now: () => number, init: SyncSlice) {
    this.state = init;
    this.eng = new SyncEngine(name, now);
    this.eng.seed(init);
  }
  edit(f: (s: SyncSlice) => SyncSlice) {
    this.state = f(this.state);
    this.eng.track(this.state);
  }
  sync(server: FakeServer) {
    return this.eng.sync(server.transport(), () => this.state, (s) => (this.state = s));
  }
}

describe('synchronisation de deux appareils', () => {
  it('convergence : modifications concurrentes, suppression, historique fusionné, sans écho', async () => {
    let t = 1_000;
    const now = () => t++;
    const server = new FakeServer();
    const v1 = newMemorizedVerse(1, '2026-01-01');
    const A = new Device('A', now, slice({ 1: v1 }));
    const B = new Device('B', now, slice());
    await A.sync(server); // A publie ses données
    await B.sync(server); // B les reçoit
    expect(B.state.verses[1]).toEqual(v1);

    // hors ligne : A modifie le verset 1 et évalue ; B modifie aussi le verset 1 (plus tard) et ajoute une évaluation
    A.edit((s) => ({ ...s, verses: { ...s.verses, 1: { ...s.verses[1], strength: 90 } }, history: [...s.history, entry('a1', '2026-03-01T08:00:00Z')] }));
    t += 500;
    B.edit((s) => ({ ...s, verses: { ...s.verses, 1: { ...s.verses[1], strength: 20, fragile: true } }, history: [...s.history, entry('b1', '2026-03-01T09:00:00Z')] }));

    const rA = await A.sync(server);
    await B.sync(server);
    const rA2 = await A.sync(server);
    expect(B.state.verses[1].strength).toBe(20); // dernier modifié gagne
    expect(A.state.verses[1]).toEqual(B.state.verses[1]); // convergence
    expect(A.state.history.map((h) => h.id).sort()).toEqual(['a1', 'b1']); // aucune évaluation perdue
    expect(B.state.history.map((h) => h.id).sort()).toEqual(['a1', 'b1']);
    expect(rA.pushed).toBeGreaterThan(0);
    expect(rA2.pushed).toBe(0); // pas d'écho de ce qui vient d'être reçu
    expect((await B.sync(server)).pushed).toBe(0);

    // suppression (retrait du suivi) sur A ; B n'y touche pas : la suppression se propage
    t += 500;
    A.edit((s) => { const verses = { ...s.verses }; delete verses[1]; return { ...s, verses }; });
    await A.sync(server);
    await B.sync(server);
    expect(B.state.verses[1]).toBeUndefined();
    // idempotence : resynchroniser ne change plus rien
    const before = JSON.stringify(B.state);
    await A.sync(server);
    await B.sync(server);
    expect(JSON.stringify(B.state)).toBe(before);
  });

  it('une modification après une suppression distante est conservée (restauration depuis la corbeille)', async () => {
    let t = 1_000;
    const now = () => t++;
    const server = new FakeServer();
    const A = new Device('A', now, slice({ 5: newMemorizedVerse(5, '2026-01-01') }));
    const B = new Device('B', now, slice());
    await A.sync(server);
    await B.sync(server);
    A.edit((s) => { const verses = { ...s.verses }; delete verses[5]; return { ...s, verses }; });
    t += 100;
    B.edit((s) => ({ ...s, verses: { ...s.verses, 5: { ...s.verses[5], strength: 77 } } })); // plus récent que la suppression
    await A.sync(server);
    await B.sync(server);
    await A.sync(server);
    expect(A.state.verses[5]?.strength).toBe(77);
    expect(B.state.verses[5]?.strength).toBe(77);
  });

  it('première activation : les données existantes sont envoyées ; les réglages se synchronisent par clé', async () => {
    let t = 1_000;
    const now = () => t++;
    const server = new FakeServer();
    const A = new Device('A', now, slice({ 2: newMemorizedVerse(2, '2026-01-01') }));
    const B = new Device('B', now, slice());
    await A.sync(server);
    await B.sync(server);
    A.edit((s) => ({ ...s, settings: { ...s.settings, reviewPagesPerDay: 6 } }));
    t += 10;
    B.edit((s) => ({ ...s, settings: { ...s.settings, theme: 'dark' } })); // autre clé : pas de conflit
    await A.sync(server);
    await B.sync(server);
    await A.sync(server);
    expect(A.state.settings.reviewPagesPerDay).toBe(6);
    expect(A.state.settings.theme).toBe('dark');
    expect(B.state.settings.reviewPagesPerDay).toBe(6);
  });
});
