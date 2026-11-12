import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ENGINE } from './config';
import { buildPlan, completeGoal, evaluateItem, goalProgress, memorizedIds, startItem, skipItem, type Core } from './plan';
import { allHizbStats, currentStreak, overall, surahStats } from './progress';
import { ayahId, fromAyahId, hizbRange, SURAHS, TOTAL_VERSES } from './quran';
import { periodReport } from './reports';
import { nextChunk } from './rotation';
import { applyGrade, newLearningVerse, newMemorizedVerse } from './scheduling';
import type { LearningGoal, VerseState } from './types';

const D = '2026-03-10';
const mem = (surah: number, from: number, to: number, verses: Record<number, VerseState> = {}) => {
  for (let a = from; a <= to; a++) verses[ayahId(surah, a)] = newMemorizedVerse(ayahId(surah, a), '2026-01-01');
  return verses;
};
const mkCore = (verses: Record<number, VerseState>, over: Partial<Core> = {}): Core => ({
  verses,
  goals: [],
  rotation: { cursor: null, cycles: 0 },
  settings: { ...DEFAULT_SETTINGS, reviewVersesPerDay: 20 },
  plan: null,
  history: [],
  ...over,
});

describe('données du Coran', () => {
  it('114 sourates, 6236 versets, ids stables', () => {
    expect(SURAHS).toHaveLength(114);
    expect(SURAHS.reduce((a, s) => a + s.n, 0)).toBe(TOTAL_VERSES);
    expect(ayahId(1, 1)).toBe(1);
    expect(ayahId(114, 6)).toBe(TOTAL_VERSES);
    for (const [s, a] of [[1, 1], [2, 286], [3, 1], [36, 83], [114, 6]] as const) expect(fromAyahId(ayahId(s, a))).toEqual({ surah: s, ayah: a });
  });
  it('60 hizb contigus couvrant tout le Coran', () => {
    let prevEnd = 0;
    for (let h = 1; h <= 60; h++) {
      const [a, b] = hizbRange(h);
      expect(a).toBe(prevEnd + 1);
      expect(b).toBeGreaterThanOrEqual(a);
      prevEnd = b;
    }
    expect(prevEnd).toBe(TOTAL_VERSES);
    expect(fromAyahId(hizbRange(2)[0])).toEqual({ surah: 2, ayah: 75 });
  });
});

describe('renforcement adaptatif', () => {
  const base = newMemorizedVerse(5, '2026-01-01');
  it('non maîtrisé → reprise dès le lendemain, jamais retiré de la rotation', () => {
    const v = applyGrade(base, 'failed', D);
    expect(v.reinforceDue).toBe('2026-03-11');
    expect(v.fragile).toBe(true);
    expect(v.status).toBe('memorized');
  });
  it('intervalles croissants avec la difficulté', () => {
    expect(applyGrade(base, 'difficult', D).reinforceDue).toBe('2026-03-12');
    expect(applyGrade(base, 'hesitant', D).reinforceDue).toBe('2026-03-14');
    expect(ENGINE.reinforceDays.failed).toBeLessThan(ENGINE.reinforceDays.difficult);
    expect(ENGINE.reinforceDays.difficult).toBeLessThan(ENGINE.reinforceDays.hesitant);
  });
  it('« maîtrisé » espace puis fait sortir du renforcement', () => {
    let v = applyGrade(base, 'failed', D);
    v = applyGrade(v, 'mastered', '2026-03-11');
    expect(v.fragile).toBe(true);
    expect(v.reinforceDue).toBe('2026-03-18'); // +7
    v = applyGrade(v, 'mastered', '2026-03-18');
    expect(v.fragile).toBe(false);
    expect(v.reinforceDue).toBeNull();
    expect(v.status).toBe('memorized');
  });
  it('un verset solide évalué « maîtrisé » n’entre pas en renforcement', () => {
    const v = applyGrade(base, 'mastered', D);
    expect(v.fragile).toBe(false);
    expect(v.strength).toBe(70);
  });
});

describe('rotation générale', () => {
  const verses = { ...mem(1, 1, 7), ...mem(2, 1, 25) };
  const ids = memorizedIds(verses);
  it('avance du début vers la fin, par versets contigus d’une même sourate', () => {
    const c1 = nextChunk(ids, null, 'forward')!;
    expect([c1.surah, c1.from, c1.to]).toEqual([1, 1, 7]);
    const c2 = nextChunk(ids, c1.endCursor, 'forward')!;
    expect([c2.surah, c2.from, c2.to]).toEqual([2, 1, 9]); // 25 versets contigus → parts égales de 9
  });
  it('revient au début après un tour complet', () => {
    const last = ids[ids.length - 1];
    const c = nextChunk(ids, last, 'forward')!;
    expect([c.surah, c.from]).toEqual([1, 1]);
    expect(c.wraps).toBe(true);
  });
  it('sens inverse : de la fin vers le début', () => {
    const c1 = nextChunk(ids, null, 'backward')!;
    expect([c1.surah, c1.from, c1.to]).toEqual([2, 17, 25]);
    const c2 = nextChunk(ids, c1.endCursor, 'backward')!;
    expect([c2.surah, c2.from, c2.to]).toEqual([2, 9, 16]);
  });
  it('gère les trous (versets non mémorisés)', () => {
    const v = { ...mem(2, 1, 3), ...mem(2, 10, 12) };
    const c = nextChunk(memorizedIds(v), ayahId(2, 3), 'forward')!;
    expect([c.from, c.to]).toEqual([10, 12]);
  });
});

describe('découpage', () => {
  it('ne laisse jamais un reste d’un seul verset', () => {
    for (let len = 1; len <= 60; len++) {
      const v = mem(2, 1, len);
      const ids = memorizedIds(v);
      let cursor: number | null = null;
      let seen = 0;
      while (seen < len) {
        const c: ReturnType<typeof nextChunk> = nextChunk(ids, cursor, 'forward');
        expect(c!.ids.length).toBeLessThanOrEqual(ENGINE.chunkSize);
        if (len > 1) expect(c!.ids.length).toBeGreaterThan(1);
        seen += c!.ids.length;
        cursor = c!.endCursor;
      }
      expect(seen).toBe(len);
    }
  });
});

describe('programme du jour', () => {
  it('construit révision + renforcement sans doublon, sans dette', () => {
    let verses = mem(1, 1, 7);
    verses = mem(2, 1, 30, verses);
    verses[ayahId(2, 5)] = applyGrade(verses[ayahId(2, 5)], 'failed', '2026-03-09'); // dû aujourd'hui
    const plan = buildPlan(mkCore(verses), D, null);
    const reinforce = plan.items.filter((i) => i.kind === 'reinforce');
    expect(reinforce).toHaveLength(1);
    expect([reinforce[0].surah, reinforce[0].from, reinforce[0].to]).toEqual([2, 5, 5]);
    const covered = new Set<number>();
    for (const it of plan.items.filter((i) => i.kind === 'review'))
      for (let a = it.from; a <= it.to; a++) {
        const id = ayahId(it.surah, a);
        expect(covered.has(id)).toBe(false);
        covered.add(id);
      }
    expect(covered.has(ayahId(2, 5))).toBe(false); // couvert par le renforcement
    // jour suivant : rien n'est reporté
    const next = buildPlan(mkCore(verses), '2026-03-11', plan);
    expect(next.date).toBe('2026-03-11');
    expect(next.items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('évaluer fait avancer la rotation ; un élément ignoré la retient', () => {
    const verses = { ...mem(1, 1, 7), ...mem(2, 1, 60) };
    let c = mkCore(verses, { settings: { ...DEFAULT_SETTINGS, reviewVersesPerDay: 30 } });
    c = { ...c, plan: buildPlan(c, D, null) };
    const rev = c.plan!.items.filter((i) => i.kind === 'review');
    expect(rev.length).toBeGreaterThanOrEqual(3);
    // on évalue le 2e avant le 1er : le curseur ne bouge pas
    c = evaluateItem(startItem(c, rev[1].id), rev[1].id, 'mastered', new Date(), D);
    expect(c.rotation.cursor).toBeNull();
    c = evaluateItem(c, rev[0].id, 'hesitant', new Date(), D);
    expect(c.rotation.cursor).toBe(rev[1].endCursor);
    // élément ignoré : bloque le curseur, pas de perte
    c = skipItem(c, rev[2].id);
    expect(c.plan!.items.find((i) => i.id === rev[2].id)!.status).toBe('skipped');
    expect(c.rotation.cursor).toBe(rev[1].endCursor);
    expect(c.history).toHaveLength(2);
  });

  it('une mauvaise évaluation ne retire jamais un verset de la rotation', () => {
    let c = mkCore(mem(1, 1, 7));
    c = { ...c, plan: buildPlan(c, D, null) };
    const it0 = c.plan!.items[0];
    c = evaluateItem(c, it0.id, 'failed', new Date(), D);
    expect(memorizedIds(c.verses)).toHaveLength(7);
    // le lendemain : en renforcement ET toujours dans la rotation
    const p2 = buildPlan(c, '2026-03-11', c.plan);
    expect(p2.items.some((i) => i.kind === 'reinforce')).toBe(true);
  });

  it('reconstruction du programme : conserve ce qui est fait, ne duplique rien', () => {
    let c = mkCore(mem(2, 1, 100));
    c = { ...c, plan: buildPlan(c, D, null) };
    const first = c.plan!.items[0];
    c = evaluateItem(c, first.id, 'mastered', new Date(), D);
    const rebuilt = buildPlan(c, D, c.plan);
    const keys = rebuilt.items.map((i) => `${i.kind}${i.surah}:${i.from}-${i.to}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rebuilt.items.find((i) => i.id === first.id)!.status).toBe('done');
    const total = rebuilt.items.filter((i) => i.kind === 'review').reduce((a, i) => a + (i.to - i.from + 1), 0);
    expect(total).toBe(20);
  });
});

describe('nouvel apprentissage', () => {
  it('avance par segments, reste en place si difficile, puis passe en mémorisé', () => {
    const goal: LearningGoal = { id: 'g1', surah: 78, from: 1, to: 12, cursor: 1, paused: false, createdAt: D, completedAt: null };
    const verses: Record<number, VerseState> = {};
    for (let a = 1; a <= 12; a++) verses[ayahId(78, a)] = newLearningVerse(ayahId(78, a), D);
    let c = mkCore(verses, { goals: [goal] });
    c = { ...c, plan: buildPlan(c, D, null) };
    let learn = c.plan!.items.find((i) => i.kind === 'learn')!;
    expect([learn.from, learn.to]).toEqual([1, 5]);
    c = evaluateItem(c, learn.id, 'difficult', new Date(), D);
    expect(c.goals[0].cursor).toBe(1); // difficile : on reste sur ces versets
    c = { ...c, plan: buildPlan(c, '2026-03-11', c.plan) };
    learn = c.plan!.items.find((i) => i.kind === 'learn')!;
    expect([learn.from, learn.to]).toEqual([1, 5]);
    c = evaluateItem(c, learn.id, 'mastered', new Date(), '2026-03-11');
    expect(c.goals[0].cursor).toBe(6);
    expect(goalProgress(c.goals[0])).toEqual({ done: 5, total: 12 });
    expect(memorizedIds(c.verses)).toHaveLength(0); // pas encore mémorisé : marquage manuel
    c = completeGoal(c, 'g1', '2026-03-12');
    expect(memorizedIds(c.verses)).toHaveLength(12);
    expect(c.verses[ayahId(78, 1)].reinforceDue).toBe('2026-03-13'); // confirmation dès le lendemain
    expect(c.goals[0].completedAt).toBe('2026-03-12');
  });
});

describe('progression', () => {
  it('calcule sourates, hizb et ne fabrique rien sans donnée', () => {
    expect(overall({}, D)).toMatchObject({ memorizedVerses: 0, surahsWorked: 0, hizbCovered: 0, ratio: 0 });
    expect(allHizbStats({}).every((h) => h.memorized === 0)).toBe(true);
    const v = mem(1, 1, 7);
    expect(surahStats(v, 1, D).state).toBe('complete');
    expect(surahStats(v, 2, D).state).toBe('none');
    const [a, b] = hizbRange(1);
    const full: Record<number, VerseState> = {};
    for (let id = a; id <= b; id++) full[id] = newMemorizedVerse(id, D);
    const o = overall(full, D);
    expect(o.hizbCovered).toBe(1);
    expect(allHizbStats(full)[0].ratio).toBe(1);
    expect(allHizbStats(full)[1].memorized).toBe(0);
  });
  it('à entretenir : versets non révisés depuis longtemps', () => {
    const v = mem(1, 1, 7);
    expect(surahStats(v, 1, D).needsMaintenance).toBe(true); // ajouté 2026-01-01, jamais révisé
    expect(surahStats(v, 1, '2026-01-10').needsMaintenance).toBe(false);
  });
  it('régularité : la série d’hier n’est pas cassée tant qu’aujourd’hui n’est pas fini', () => {
    const days = new Set(['2026-03-08', '2026-03-09']);
    expect(currentStreak(days, D)).toBe(2);
    expect(currentStreak(new Set(['2026-03-05']), D)).toBe(0);
  });
  it('bilan de période : difficultés récurrentes', () => {
    const h = (date: string, grade: 'difficult' | 'mastered') => ({ id: date + grade, ts: date, date, kind: 'review' as const, surah: 2, from: 1, to: 5, grade });
    const r = periodReport([h('2026-03-02', 'difficult'), h('2026-03-04', 'difficult'), h('2026-03-05', 'mastered')], [], '2026-03-02', '2026-03-08');
    expect(r.activeDays).toBe(3);
    expect(r.verses).toBe(15);
    expect(r.difficulties).toEqual([{ surah: 2, from: 1, to: 5, count: 2 }]);
  });
});
