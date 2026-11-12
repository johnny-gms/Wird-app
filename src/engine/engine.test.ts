import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ENGINE } from './config';
import { buildPlan, completeGoal, evaluateItem, goalProgress, memorizedIds, nextLearnTarget, skipItem, itemPages, upcomingRotation, type Core } from './plan';
import { TOTAL_PAGES, idsPages, rangePages } from './pages';
import { allHizbStats, currentStreak, overall, surahStats } from './progress';
import { ayahId, fromAyahId, hizbOf, hizbRange, SURAHS, TOTAL_VERSES } from './quran';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { periodReport } from './reports';
import { nextChunk } from './rotation';
import { purgeTrash, trashDaysLeft, trashVerses } from './trash';
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
  settings: { ...DEFAULT_SETTINGS, reviewPagesPerDay: 1.5, learnPagesPerDay: 0.5 },
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

describe('texte Tanzil intégré (Uthmani Minimal 1.1)', () => {
  const t = JSON.parse(readFileSync('public/data/quran-uthmani.json', 'utf8')) as { s: string[][]; bismillah: string; bismillahVariants: Record<string, string>; license: string; sha256: string; source: string };
  const xml = readFileSync('data/tanzil/quran-uthmani-min.xml', 'utf8');
  it('provenance : empreinte, version et licence du fichier original', () => {
    expect(createHash('sha256').update(readFileSync('data/tanzil/quran-uthmani-min.xml')).digest('hex')).toBe(t.sha256);
    expect(readFileSync('data/tanzil/SHA256SUMS', 'utf8')).toContain(t.sha256);
    expect(t.source).toMatch(/Uthmani Minimal, Version 1\.1/);
    expect(t.license).toMatch(/Creative Commons Attribution 3\.0/);
    expect(t.license).toMatch(/CHANGING IT IS NOT ALLOWED/);
  });
  it('114 sourates, 6236 versets, numérotation exacte', () => {
    expect(t.s).toHaveLength(114);
    expect(t.s.flat()).toHaveLength(TOTAL_VERSES);
    t.s.forEach((v, i) => expect(v.length).toBe(SURAHS[i].n));
    expect(xml.match(/<aya /g)).toHaveLength(6236);
  });
  it('texte identique au XML original (sans aucune altération)', () => {
    const texts = [...xml.matchAll(/<aya index="\d+" text="([^"]*)"/g)].map((m) => m[1]);
    expect(t.s.flat()).toEqual(texts);
  });
  it('Basmala : verset 1 d’Al-Fatiha ; attribut séparé pour les autres sourates (sauf At-Tawba)', () => {
    expect(t.s[0][0]).toBe(t.bismillah);
    expect(xml.match(/bismillah="/g)).toHaveLength(112);
    expect(t.s[1][0]).not.toContain(t.bismillah.slice(0, 6)); // 2:1 = « الم », sans Basmala
    expect(Object.keys(t.bismillahVariants)).toEqual([]);
    expect(t.s.flat().every((v) => v.length > 0)).toBe(true);
  });
});

describe('Hizb et pages (source Tanzil quran-data.xml, recoupées)', () => {
  const meta = readFileSync('data/tanzil/quran-data.xml', 'utf8');
  const block = (name: string) => [...(meta.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '').matchAll(/sura="(\d+)" aya="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  it('60 Hizb = 1 quart sur 4 des 240 quarts Tanzil', () => {
    const q = block('hizbs');
    expect(q).toHaveLength(240);
    for (let h = 1; h <= 60; h++) expect(fromAyahId(hizbRange(h)[0])).toEqual({ surah: q[(h - 1) * 4][0], ayah: q[(h - 1) * 4][1] });
  });
  it('604 pages', () => expect(block('pages')).toHaveLength(604));
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
    const c1 = nextChunk(ids, null)!;
    expect([c1.surah, c1.from, c1.to]).toEqual([1, 1, 7]);
    const c2 = nextChunk(ids, c1.endCursor)!;
    expect([c2.surah, c2.from, c2.to]).toEqual([2, 1, 9]); // 25 versets contigus → parts égales de 9
  });
  it('revient au début après un tour complet', () => {
    const last = ids[ids.length - 1];
    const c = nextChunk(ids, last)!;
    expect([c.surah, c.from]).toEqual([1, 1]);
    expect(c.wraps).toBe(true);
  });
  it('gère les trous (versets non mémorisés)', () => {
    const v = { ...mem(2, 1, 3), ...mem(2, 10, 12) };
    const c = nextChunk(memorizedIds(v), ayahId(2, 3))!;
    expect([c.from, c.to]).toEqual([10, 12]);
  });
});

describe('rotation par Hizb', () => {
  it('ne chevauche jamais deux Hizb et suit l’ordre 1 → 60, du début vers la fin de chaque Hizb', () => {
    // 2:60 → 2:90 traverse la limite des Hizb 1 et 2 (le Hizb 2 commence en 2:75)
    const v = mem(2, 60, 90);
    const ids = memorizedIds(v);
    let cursor: number | null = null;
    const chunks: { hizb: number; from: number; to: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const c: ReturnType<typeof nextChunk> = nextChunk(ids, cursor);
      if (!c || (chunks.length && c.wraps)) break;
      const hz = new Set(c.ids.map(hizbOf));
      expect(hz.size).toBe(1);
      chunks.push({ hizb: [...hz][0], from: c.from, to: c.to });
      cursor = c.endCursor;
    }
    expect(chunks[0].from).toBe(60);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].hizb).toBeGreaterThanOrEqual(chunks[i - 1].hizb);
    expect(chunks.some((c) => c.hizb === 1) && chunks.some((c) => c.hizb === 2)).toBe(true);
    expect(chunks.find((c) => c.hizb === 2)!.from).toBe(75);
    expect(Math.max(...chunks.filter((c) => c.hizb === 1).map((c) => c.to))).toBe(74);
  });
  it('un verset difficile reste dans la rotation et revient aussi en renforcement', () => {
    let c = mkCore(mem(2, 1, 10));
    c = { ...c, plan: buildPlan(c, D, null) };
    c = evaluateItem(c, c.plan!.items[0].id, 'failed', new Date(), D);
    const next = buildPlan(c, '2026-03-11', c.plan);
    expect(next.items.some((i) => i.kind === 'reinforce')).toBe(true);
    expect(memorizedIds(c.verses)).toHaveLength(10);
  });
  it('estimation « à venir » : indicative, croissante, jamais une dette', () => {
    const c = mkCore(mem(2, 1, 150), { settings: { ...DEFAULT_SETTINGS, reviewPagesPerDay: 1, learnPagesPerDay: 0 } });
    const plan = buildPlan(c, D, null);
    const up = upcomingRotation(c, plan, 5);
    expect(up.length).toBeGreaterThan(0);
    expect(up[0].inDays).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < up.length; i++) expect(up[i].inDays).toBeGreaterThanOrEqual(up[i - 1].inDays);
    const todayIds = new Set(plan.items.flatMap((i) => Array.from({ length: i.to - i.from + 1 }, (_, k) => ayahId(i.surah, i.from + k))));
    expect(up.every((u) => !todayIds.has(ayahId(u.surah, u.from)))).toBe(true);
    expect(upcomingRotation({ ...c, settings: { ...c.settings, reviewPagesPerDay: 0 } }, plan)).toEqual([]);
  });
});

describe('corbeille 30 jours', () => {
  it('le retrait du suivi est restaurable ; purge après 30 jours', () => {
    const v = mem(1, 1, 7);
    const t = trashVerses(v, 1, 2, 4, new Date('2026-03-10T10:00:00Z'));
    expect(Object.keys(t.verses)).toHaveLength(4);
    expect(t.item!.kind === 'verses' && t.item!.verses).toHaveLength(3);
    expect(purgeTrash([t.item!], '2026-04-08')).toHaveLength(1); // J+29
    expect(purgeTrash([t.item!], '2026-04-09')).toHaveLength(0); // J+30
    expect(trashDaysLeft(t.item!, '2026-03-20')).toBe(20);
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
        const c: ReturnType<typeof nextChunk> = nextChunk(ids, cursor);
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
    let c = mkCore(verses, { settings: { ...DEFAULT_SETTINGS, reviewPagesPerDay: 3 } });
    c = { ...c, plan: buildPlan(c, D, null) };
    const rev = c.plan!.items.filter((i) => i.kind === 'review');
    expect(rev.length).toBeGreaterThanOrEqual(3);
    // on évalue le 2e avant le 1er : le curseur ne bouge pas
    c = evaluateItem(c, rev[1].id, 'mastered', new Date(), D);
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
    const pages = rebuilt.items.filter((i) => i.kind === 'review').reduce((a, i) => a + itemPages(i), 0);
    expect(pages).toBeGreaterThanOrEqual(1.5 - 0.05); // objectif atteint (au morceau près)
    expect(pages).toBeLessThan(1.5 + 1);
  });
});

describe('nouvel apprentissage', () => {
  it('avance par segments, reste en place si difficile, puis passe en mémorisé', () => {
    const goal: LearningGoal = { id: 'g1', surah: 78, from: 1, to: 25, cursor: 1, paused: false, createdAt: D, completedAt: null };
    const verses: Record<number, VerseState> = {};
    for (let a = 1; a <= 25; a++) verses[ayahId(78, a)] = newLearningVerse(ayahId(78, a), D);
    let c = mkCore(verses, { goals: [goal], settings: { ...DEFAULT_SETTINGS, learnPagesPerDay: 0.5, reviewPagesPerDay: 0 } });
    c = { ...c, plan: buildPlan(c, D, null) };
    let learn = c.plan!.items.find((i) => i.kind === 'learn')!;
    expect(learn.from).toBe(1);
    const firstTo = learn.to;
    expect(firstTo).toBeLessThanOrEqual(ENGINE.chunkSize);
    c = evaluateItem(c, learn.id, 'difficult', new Date(), D);
    expect(c.goals[0].cursor).toBe(1); // difficile : on reste sur ces versets
    c = { ...c, plan: buildPlan(c, '2026-03-11', c.plan) };
    learn = c.plan!.items.find((i) => i.kind === 'learn')!;
    expect([learn.from, learn.to]).toEqual([1, firstTo]);
    c = evaluateItem(c, learn.id, 'mastered', new Date(), '2026-03-11');
    expect(c.goals[0].cursor).toBe(firstTo + 1);
    expect(goalProgress(c.goals[0])).toEqual({ done: firstTo, total: 25 });
    expect(memorizedIds(c.verses)).toHaveLength(0); // objectif manuel : marquage manuel
    c = completeGoal(c, 'g1', '2026-03-12');
    expect(memorizedIds(c.verses)).toHaveLength(25);
    expect(c.verses[ayahId(78, 1)].reinforceDue).toBe('2026-03-13'); // confirmation dès le lendemain
  });

  it('un élément difficile ne fait pas « sauter » les suivants (budget de 2 pages → plusieurs segments)', () => {
    const goal: LearningGoal = { id: 'g1', surah: 2, from: 1, to: 60, cursor: 1, paused: false, createdAt: D, completedAt: null };
    const verses: Record<number, VerseState> = {};
    for (let a = 1; a <= 60; a++) verses[ayahId(2, a)] = newLearningVerse(ayahId(2, a), D);
    let c = mkCore(verses, { goals: [goal], settings: { ...DEFAULT_SETTINGS, learnPagesPerDay: 2, reviewPagesPerDay: 0 } });
    c = { ...c, plan: buildPlan(c, D, null) };
    const learn = c.plan!.items.filter((i) => i.kind === 'learn');
    expect(learn.length).toBeGreaterThanOrEqual(2);
    c = evaluateItem(c, learn[0].id, 'failed', new Date(), D);
    c = evaluateItem(c, learn[1].id, 'mastered', new Date(), D);
    expect(c.goals[0].cursor).toBe(1);
  });

  it('apprentissage automatique : prochaine sourate selon le sens, indépendant du sens de révision', () => {
    const known = mem(1, 1, 7, mem(2, 1, 286, mem(3, 1, 150)));
    expect(nextLearnTarget(known, [], 'forward')).toMatchObject({ surah: 3, from: 151 });
    expect(nextLearnTarget(known, [], 'backward')).toMatchObject({ surah: 114, from: 1, to: 6 });
    const all: Record<number, VerseState> = {};
    for (const s of SURAHS) mem(s.id, 1, s.n, all);
    expect(nextLearnTarget(all, [], 'forward')).toBeNull();
  });

  it('objectif auto : terminé et mémorisé dès que tout est parcouru', () => {
    const goal: LearningGoal = { id: 'a1', surah: 112, from: 1, to: 4, cursor: 1, paused: false, createdAt: D, completedAt: null, auto: true };
    const verses: Record<number, VerseState> = {};
    for (let a = 1; a <= 4; a++) verses[ayahId(112, a)] = newLearningVerse(ayahId(112, a), D);
    let c = mkCore(verses, { goals: [goal], settings: { ...DEFAULT_SETTINGS, learnPagesPerDay: 1, reviewPagesPerDay: 0 } });
    c = { ...c, plan: buildPlan(c, D, null) };
    c = evaluateItem(c, c.plan!.items[0].id, 'mastered', new Date(), D);
    expect(c.goals[0].completedAt).toBe(D);
    expect(memorizedIds(c.verses)).toHaveLength(4);
  });
});

describe('pages du Mushaf', () => {
  it('604 pages, poids cohérents', () => {
    expect(TOTAL_PAGES).toBe(604);
    const all = Array.from({ length: TOTAL_VERSES }, (_, i) => i + 1);
    expect(idsPages(all)).toBeCloseTo(604, 6);
    expect(rangePages(1, 1, 7)).toBeCloseTo(1, 6); // Al-Fatiha = page 1
  });
});

describe('adaptation du programme', () => {
  it('peu de contenu : la révision se limite à ce que l’utilisateur connaît, sans inventer', () => {
    const c = mkCore(mem(112, 1, 4), { settings: { ...DEFAULT_SETTINGS, reviewPagesPerDay: 10, learnPagesPerDay: 2 } });
    const plan = buildPlan(c, D, null);
    expect(plan.items.filter((i) => i.kind === 'review')).toHaveLength(1);
    expect(plan.items.some((i) => i.kind === 'learn')).toBe(false); // aucun objectif d'apprentissage : rien d'inventé
  });
  it('objectifs à 0 : pas de travail de ce type', () => {
    const c = mkCore(mem(1, 1, 7), { settings: { ...DEFAULT_SETTINGS, reviewPagesPerDay: 0, learnPagesPerDay: 0 } });
    expect(buildPlan(c, D, null).items).toHaveLength(0);
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
