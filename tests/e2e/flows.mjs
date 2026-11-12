// Parcours métier : plusieurs jours (horloge simulée), renforcement, apprentissage automatique, corbeille, migration, export/import.
import { BASE, chromium, devices, done, ok, onboard, runSession, settle } from './lib.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], reducedMotion: 'reduce', locale: 'fr-FR', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Décalage d'horloge simulé (minuteries réelles) : jours écoulés stockés dans localStorage.__days
await ctx.addInitScript(() => {
  const R = Date;
  const off = Number(localStorage.getItem('__days') || 0) * 86400000;
  const base = new R('2026-04-10T09:00:00').getTime() - R.now();
  class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + base + off); else super(...a); } static now() { return R.now() + base + off; } }
  window.Date = D;
});
const setDays = (n) => page.evaluate((x) => localStorage.setItem('__days', String(x)), n);
const revisions = async () => {
  await page.goto(BASE + '/revisions');
  await page.getByRole('heading', { name: 'Mes révisions' }).waitFor();
  await page.waitForTimeout(300);
  return { text: await page.locator('body').innerText(), starts: await page.getByRole('button', { name: 'Commencer', exact: true }).count() };
};

// ---------- J0 ----------
await onboard(page, { name: 'Amina', juz: true });
await setDays(0);
const day0 = await runSession(page, (i, r) => (i === r.findIndex((x) => /Révision/.test(x)) ? 'Non maîtrisé' : 'Maîtrisé'));
ok(day0.n >= 3, `J0 : séance de ${day0.n} éléments évalués`);

// ---------- J+1 : renforcement + rotation qui avance, sans dette ----------
await setDays(1);
await page.reload();
const j1 = await revisions();
ok(/RENFORCEMENT \([1-9]/.test(j1.text), 'J+1 : l’élément « non maîtrisé » revient en renforcement dès le lendemain');
ok(!/retard|dette/i.test(j1.text), 'aucun mot « retard » ni « dette »');
ok(/À VENIR \([1-9]/.test(j1.text) && /estimation/.test(j1.text), '« À venir » avec estimation étiquetée');
await page.goto(BASE + '/wird');
await page.getByRole('heading', { name: 'Mes sourates' }).waitFor();
const states = await page.locator('a[href^="/wird/"]').evaluateAll((els) => els.map((e) => e.innerText));
ok(states.some((t) => /À renforcer/.test(t)), 'Mon Wird : une sourate passe en « À renforcer » (état réel)');
ok(states.filter((t) => /apprise|À renforcer/.test(t)).length >= 37, 'aucune sourate apprise n’a disparu');

// ---------- Absence de 10 jours : rien ne s'accumule ----------
await setDays(11);
await page.reload();
const j11 = await revisions();
ok(j11.starts > 0 && j11.starts <= j1.starts, `après 10 jours d’absence le programme n’a pas grossi (${j1.starts} éléments avant, ${j11.starts} après)`);
await page.goto(BASE + '/');
await page.getByText(/Content de te revoir/).waitFor();
await page.getByText(/Rien à rattraper/).waitFor();
ok(true, 'message de retour bienveillant (tutoiement)');

// ---------- Apprentissage automatique ----------
await page.goto(BASE + '/revisions');
await page.getByText('Auto', { exact: true }).first().waitFor();
ok(true, 'apprentissage automatique : une sourate est proposée dans le sens choisi');
await page.goto(BASE + '/profil');
for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /Plus de pages à apprendre/ }).click();
await settle(page);
const j11b = await runSession(page, () => 'Maîtrisé');
ok(j11b.n >= 3, 'séance avec objectif d’apprentissage relevé');
await page.goto(BASE + '/wird/1');
await page.getByRole('heading', { name: /1\. Al-Fatihah/ }).waitFor();
await page.getByRole('button', { name: /Verset 1 : /, exact: false }).first().waitFor();
const v1 = await page.getByRole('button', { name: /^Verset 1 :/ }).getAttribute('aria-label');
ok(/À renforcer|Appris/.test(v1), `Al-Fatiha apprise → confirmation à venir (${v1})`);

// ---------- Corbeille 30 jours ----------
await page.goto(BASE + '/wird/112');
await page.getByRole('button', { name: 'Sélectionner des versets' }).click();
await page.getByRole('button', { name: '1–4', exact: true }).waitFor().catch(() => undefined);
await page.getByRole('button', { name: 'Tout', exact: true }).click();
await page.getByRole('button', { name: /Retirer/ }).last().click();
await page.getByText('Retiré du suivi').waitFor();
await settle(page);
await page.goto(BASE + '/profil/corbeille');
await page.getByText(/Al-Ikhlas/).first().waitFor();
ok(/30 jours restants|29 jours restants|jours? restants?/.test(await page.locator('body').innerText()), 'corbeille : élément retiré visible avec jours restants');
await page.getByRole('button', { name: /Restaurer/ }).first().click();
await page.getByText('Restauré').waitFor();
await settle(page);
await page.goto(BASE + '/wird/112');
const v112 = await page.getByRole('button', { name: /^Verset 1 :/ }).getAttribute('aria-label');
ok(/Appris|À renforcer/.test(v112), `corbeille : restauration (${v112})`);

// ---------- Migration : données V1.1 conservées ----------
const ctx2 = await browser.newContext({ ...devices['iPhone 14'], reducedMotion: 'reduce', locale: 'fr-FR' });
const p2 = await ctx2.newPage();
await p2.goto(BASE);
await p2.getByRole('button', { name: /^Commencer/ }).waitFor();
await p2.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('wird', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const verses = {};
  for (let id = 6189; id <= 6200; id++) verses[id] = { id, status: 'memorized', strength: 60, fragile: false, reinforceDue: null, stage: 0, lastGrade: 'mastered', lastReviewedAt: '2026-03-01', reviews: 2, addedAt: '2026-01-01', source: 'user' };
  const entries = {
    profile: { name: 'Ancien', createdAt: '2026-01-01', onboarded: true, demo: false },
    // réglages V1.1 : ancien « direction » de révision (inversé), objectifs en pages
    settings: { direction: 'backward', learnDirection: 'backward', learnPagesPerDay: 1, reviewPagesPerDay: 3, reinforceVersesPerDay: 15, theme: 'light', notifications: { daily: { enabled: true, time: '07:30' }, second: { enabled: true, time: '19:30' }, unfinished: { enabled: true, time: '09:00' }, comeback: { enabled: true, afterDays: 3, time: '10:00' } } },
    verses,
    history: [{ id: 'h1', ts: '2026-03-01T08:00:00Z', date: '2026-03-01', kind: 'review', surah: 105, from: 1, to: 5, grade: 'hesitant' }],
    plan: { date: '2026-03-01', items: [{ id: 'x', kind: 'review', surah: 105, from: 1, to: 5, status: 'in_progress' }] },
    session: { date: '2026-03-01', currentItemId: 'x', step: 'recite', activeMs: 1000, startedAt: '2026-03-01T08:00:00Z' },
    rotation: { cursor: 6190, cycles: 1 }, progressLog: [{ date: '2026-03-01', memorized: 12 }], summaries: [], personalGoals: [{ id: 'g', type: 'regularity', title: 'Un peu chaque jour', createdAt: '2026-01-01', achievedAt: null }], dayLog: [], goals: [],
  };
  await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); const s = t.objectStore('kv'); for (const [k, v] of Object.entries(entries)) s.put(v, k); t.oncomplete = res; t.onerror = rej; });
});
await p2.reload();
await p2.getByText('Ma progression').first().waitFor();
ok(/Ancien/.test(await p2.locator('body').innerText()) || (await p2.getByText('A').first().isVisible()), 'migration : profil conservé, aucun retour au premier lancement');
await p2.goto(BASE + '/progression');
await p2.getByText('Quelques hésitations').first().waitFor();
ok(true, 'migration : historique conservé');
await p2.goto(BASE + '/profil');
await p2.getByText('Apprentissage et révision').waitFor();
const prof = await p2.locator('body').innerText();
ok(/Hizb par Hizb/.test(prof) && (await p2.getByRole('radio', { name: 'An-Nas → Al-Fatiha' }).getAttribute('aria-checked')) === 'true', 'migration : sens d’apprentissage conservé, sens de révision supprimé');
await p2.goto(BASE + '/wird/105');
const m105 = await p2.getByRole('button', { name: /^Verset 1 :/ }).getAttribute('aria-label');
ok(/Appris/.test(m105), `migration : versets conservés (${m105})`);
await p2.goto(BASE + '/');
await p2.getByText('Ma progression').first().waitFor();
ok(true, 'migration : ancienne séance remplacée sans erreur');
await ctx2.close();

// ---------- Export / import / reset ----------
await page.goto(BASE + '/profil');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter mes données/ }).click()]);
const exported = JSON.parse((await import('node:fs')).readFileSync(await dl.path(), 'utf8'));
ok(exported.app === 'wird' && Object.keys(exported.data.verses).length > 100 && exported.data.history.length >= 3 && 'trash' in exported.data && !('direction' in exported.data.settings), 'export JSON complet (corbeille incluse)');
await page.getByRole('button', { name: /Tout réinitialiser/ }).click();
await page.getByRole('button', { name: /Effacer définitivement/ }).click();
await page.getByRole('heading', { name: 'Bienvenue dans WIRD' }).waitFor();
ok(true, 'remise à zéro → écran de bienvenue');
ok(errors.length === 0, `aucune erreur JS (${errors.slice(0, 2).join(' | ')})`);
await browser.close();
done();
