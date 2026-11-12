// Parcours métier : plusieurs jours (horloge simulée), renforcement, apprentissage automatique, migration V1, export/import.
import { BASE, chromium, devices, done, ok, onboard, settle } from './lib.mjs';

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
const levels = ['Maîtrisé', 'Quelques hésitations', 'Difficile', 'Non maîtrisé'];

/** Ouvre la séance, évalue chaque élément avec `pick(i)`, valide. Retourne les intitulés des éléments. */
async function runSession(pick) {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: /Commencer la séance|Reprendre la séance/ }).click();
  await page.getByRole('heading', { name: 'Séance du jour' }).waitFor();
  const names = await page.locator('main ol > li button[aria-expanded] span.truncate').allInnerTexts();
  const ranges = await page.locator('main ol > li button[aria-expanded]').allInnerTexts();
  await page.getByRole('button', { name: 'Terminer la séance' }).click();
  const groups = page.getByRole('radiogroup');
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).getByRole('radio', { name: pick(i, ranges), exact: true }).click();
  await page.getByRole('button', { name: 'Valider le bilan' }).click();
  await page.waitForURL('**/session/bilan');
  await settle(page);
  return { names, ranges, n };
}
const programItems = async () => {
  await page.goto(BASE + '/wird/aujourdhui');
  await page.getByText(/traités/).waitFor();
  return page.locator('ul > li button[aria-label*="Sourate"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
};

// ---------- J0 ----------
await onboard(page, { name: 'Amina', juz: true });
await page.getByText('Bonjour').first().waitFor();
await setDays(0);
const day0 = await runSession((i, r) => (i === r.findIndex((x) => /Révision/.test(x)) ? 'Non maîtrisé' : 'Maîtrisé'));
ok(day0.n >= 3, `J0 : séance de ${day0.n} éléments évalués individuellement`);

// ---------- J+1 : renforcement + rotation qui avance, sans dette ----------
await setDays(1);
await page.reload();
const j1 = await programItems();
const body1 = await page.locator('body').innerText();
ok(/renforcement/i.test(body1), 'J+1 : l’élément « non maîtrisé » revient en renforcement dès le lendemain');
const reviewJ0First = day0.ranges.find((r) => /Révision|Renforcement|Nouvel/.test(r) === false) ?? '';
ok(j1.length > 0, `J+1 : programme du jour construit (${j1.length} éléments)`);
// l'élément non maîtrisé reste aussi dans la rotation générale (il n'a pas disparu)
await page.goto(BASE + '/wird/sourates');
await page.getByRole('region', { name: 'Progression globale' }).waitFor();
const label = await page.getByRole('link', { name: /^Sourate 114,/ }).getAttribute('aria-label').catch(() => '');
void reviewJ0First; void label;
const states = await page.locator('ol li a[aria-label^="Sourate"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
ok(states.some((s) => /à renforcer/.test(s)), 'tableau : une sourate passe en orange (à renforcer) d’après l’évaluation réelle');
ok(states.filter((s) => /apprise/.test(s)).length + states.filter((s) => /à renforcer/.test(s)).length >= 37, 'aucune sourate apprise n’a disparu de la progression');

// ---------- Absence de 10 jours ----------
await setDays(11);
await page.reload();
const j11 = await programItems();
ok(j11.length > 0 && j11.length <= j1.length, `après 10 jours d’absence le programme n’a pas grossi (${j1.length} éléments avant, ${j11.length} après : rien d’accumulé)`);
await page.goto(BASE + '/');
await page.getByText(/rien à rattraper/i).first().waitFor();
ok(true, 'message de reprise bienveillant');

// ---------- Apprentissage automatique ----------
await page.goto(BASE + '/wird/apprentissage');
await page.getByText('Auto', { exact: true }).first().waitFor();
ok(true, 'apprentissage automatique : une sourate est proposée dans le sens choisi');
await page.goto(BASE + '/profil/wird');
for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /Plus de pages à apprendre/ }).click();
await settle(page);
const j11b = await runSession(() => 'Maîtrisé');
ok(j11b.n >= 3, 'séance avec objectif d’apprentissage relevé');
await page.goto(BASE + '/wird/sourates');
await page.getByRole('region', { name: 'Progression globale' }).waitFor();
const fat = await page.getByRole('link', { name: /^Sourate 1, Al-Fatihah/ }).getAttribute('aria-label');
ok(/à renforcer/.test(fat), `Al-Fatiha entièrement apprise → confirmation à venir (${fat})`);

// ---------- Migration : données V1 conservées ----------
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
    // réglages tels que l'ancienne version les enregistrait
    settings: { direction: 'backward', reviewVersesPerDay: 45, reinforceVersesPerDay: 15, learningEnabled: false, learningChunk: 5, theme: 'light', notifications: { daily: { enabled: true, time: '07:30' }, second: { enabled: true, time: '19:30' }, unfinished: { enabled: true, time: '09:00' }, comeback: { enabled: true, afterDays: 3, time: '10:00' } } },
    verses,
    history: [{ id: 'h1', ts: '2026-03-01T08:00:00Z', date: '2026-03-01', kind: 'review', surah: 105, from: 1, to: 5, grade: 'hesitant' }],
    plan: { date: '2026-03-01', items: [{ id: 'x', kind: 'review', surah: 105, from: 1, to: 5, status: 'in_progress' }] },
    session: { date: '2026-03-01', currentItemId: 'x', step: 'recite', activeMs: 1000, startedAt: '2026-03-01T08:00:00Z' },
    rotation: { cursor: 5984, cycles: 1 }, progressLog: [{ date: '2026-03-01', memorized: 12 }], summaries: [], personalGoals: [{ id: 'g', type: 'regularity', title: 'Un peu chaque jour', createdAt: '2026-01-01', achievedAt: null }], dayLog: [], goals: [],
  };
  await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); const s = t.objectStore('kv'); for (const [k, v] of Object.entries(entries)) s.put(v, k); t.oncomplete = res; t.onerror = rej; });
});
await p2.reload();
await p2.getByText(/Bonjour|Bon après-midi|Bonsoir/).first().waitFor();
ok(await p2.getByText('Ancien').first().isVisible(), 'migration : profil conservé, aucun retour au parcours de premier lancement');
await p2.goto(BASE + '/progression/historique');
await p2.getByText('Quelques hésitations').first().waitFor();
ok(true, 'migration : historique conservé');
await p2.goto(BASE + '/profil/wird');
await p2.getByText('Pages à réviser').waitFor();
const rv = await p2.getByRole('button', { name: /Moins de pages à réviser/ }).locator('xpath=../div').innerText();
const lv = await p2.getByRole('button', { name: /Moins de pages à apprendre/ }).locator('xpath=../div').innerText();
ok(/3/.test(rv) && /^0\b/.test(lv.trim()), `migration : réglages convertis (45 versets → ${rv.replace(/\n/g, ' ')} ; apprentissage désactivé → ${lv.replace(/\n/g, ' ')})`);
ok((await p2.getByRole('radio', { name: 'An-Nas → Al-Fatiha' }).evaluateAll((e) => e.map((x) => x.getAttribute('aria-checked')))).join() === 'true,true', 'migration : sens de révision conservé, sens d’apprentissage aligné');
await p2.goto(BASE + '/wird/sourates');
await p2.getByRole('region', { name: 'Progression globale' }).waitFor();
const m105 = await p2.getByRole('link', { name: /^Sourate 105,/ }).getAttribute('aria-label');
ok(/apprise/.test(m105), `migration : versets mémorisés conservés (${m105})`);
await p2.goto(BASE + '/');
await p2.getByText('Programme du jour').first().waitFor();
ok(true, 'migration : ancien programme / séance remplacés sans erreur');
await ctx2.close();

// ---------- Export / import / reset ----------
await page.goto(BASE + '/profil/donnees');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter mes données/ }).click()]);
const path = await dl.path();
const exported = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
ok(exported.app === 'wird' && Object.keys(exported.data.verses).length > 100 && exported.data.history.length >= 3 && exported.data.settings.learnDirection, 'export JSON complet');
await page.getByRole('button', { name: /Effacer toutes les données/ }).click();
await page.getByRole('button', { name: /Effacer définitivement/ }).click();
await page.getByRole('heading', { name: 'WIRD' }).waitFor();
ok(true, 'remise à zéro → écran de bienvenue');
await page.getByRole('button', { name: /^Commencer/ }).click();
for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Continuer|Je n’en connais/ }).click();
await page.getByRole('button', { name: /Commencer à utiliser/ }).click();
await page.getByText('Vos données vous appartiennent').waitFor();
await settle(page);
await page.locator('input[type=file]').setInputFiles(path);
await page.getByText('Sauvegarde restaurée').waitFor();
await page.goto(BASE + '/progression/historique');
await page.getByText(/Maîtrisé|Non maîtrisé/).first().waitFor();
ok(true, 'import : historique restauré');

ok(errors.length === 0, `aucune erreur JS (${errors.slice(0, 2).join(' | ')})`);
await browser.close();
done();
