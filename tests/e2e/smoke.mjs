// Test de bout en bout (Playwright) — nécessite `npm run build && npm run preview`.
// Usage : PW_REQUIRE=/chemin/package.json BASE_URL=http://127.0.0.1:4173 node tests/e2e/smoke.mjs
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(process.env.PW_REQUIRE ?? import.meta.url)('playwright');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = process.env.SHOTS ?? '.scratch';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) failures++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'allow', locale: 'fr-FR', reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE);
await page.getByRole('button', { name: /données de démonstration/i }).click();
await page.getByText('Votre Wird du jour').first().waitFor();
ok(true, 'onboarding → accueil (démo)');
await page.screenshot({ path: `${OUT}/01-home.png` });

// Navigation : 4 onglets
const tabs = await page.locator('nav[aria-label="Navigation principale"] a').allInnerTexts();
ok(tabs.map((t) => t.trim()).join('|') === 'Accueil|Mon Wird|Progression|Profil', `4 onglets: ${tabs.join(',')}`);

// Session complète
await page.getByRole('button', { name: /Commencer mon Wird/ }).click();
await page.waitForURL('**/session');
await page.getByText('Récitez de mémoire').waitFor();
ok(true, 'écran de récitation');
await page.getByRole('button', { name: /Afficher le texte de référence/ }).click();
await page.locator('section[aria-label="Texte de référence"] .ar').waitFor();
ok((await page.locator('section[aria-label="Texte de référence"] .ar').innerText()).length > 20, 'texte de référence affiché');
await page.screenshot({ path: `${OUT}/02-session-recite.png` });
await page.getByRole('button', { name: /J’ai terminé ma récitation/ }).click();
await page.getByText('Comment s’est passée votre récitation').waitFor();
ok(true, 'évaluation directe après récitation');
await page.screenshot({ path: `${OUT}/03-session-eval.png` });
await page.getByRole('button', { name: /Retour à la récitation/ }).click();
await page.getByText('Récitez de mémoire').waitFor();
ok(true, 'bouton retour → récitation');
await page.getByRole('button', { name: /J’ai terminé ma récitation/ }).click();

// Interruption puis reprise
await page.getByRole('button', { name: 'Interrompre' }).click();
await page.waitForURL(BASE + '/');
await page.getByRole('button', { name: /Reprendre/ }).first().waitFor();
ok(true, 'après interruption : bouton « Reprendre »');
await page.getByRole('button', { name: /Reprendre/ }).first().click();
await page.waitForURL('**/session');
await page.getByText('Comment s’est passée votre récitation').waitFor();
ok(true, 'reprise sur le même élément, à l’étape d’évaluation (rien perdu)');

// Parcours des évaluations
const grades = ['Maîtrisé', 'Quelques hésitations', 'Difficile', 'Non maîtrisé'];
let n = 0;
for (let guard = 0; guard < 30; guard++) {
  if (page.url().includes('/bilan')) break;
  if (await page.getByRole('button', { name: /J’ai terminé ma récitation/ }).isVisible().catch(() => false)) await page.getByRole('button', { name: /J’ai terminé ma récitation/ }).click();
  const g = grades[n % 4];
  await page.getByRole('button', { name: new RegExp('^\\d\\s*' + g) }).click();
  n++;
  await page.waitForTimeout(120);
}
await page.waitForURL('**/session/bilan');
ok(n >= 2, `${n} éléments évalués → bilan`);
await page.getByText('Votre Wird du jour est accompli').waitFor();
ok(true, 'écran de bilan');
await page.screenshot({ path: `${OUT}/04-bilan.png`, fullPage: true });

// Persistance : rechargement
await page.goto(BASE + '/progression/historique');
await page.getByText(/Maîtrisé|Difficile/).first().waitFor();
ok(true, 'historique présent');
await page.reload();
await page.getByText(/Maîtrisé|Difficile/).first().waitFor();
ok(true, 'historique persistant après rechargement (IndexedDB)');
await page.screenshot({ path: `${OUT}/05-history.png` });

// Écrans
for (const [path, text, shot] of [
  ['/progression/general', 'Progression générale', '06-progress'],
  ['/progression/hizb', 'couvert', '07-hizb'],
  ['/progression/sourates', 'En cours', '08-surahs-progress'],
  ['/progression/bilans', 'Semaine', '09-reports'],
  ['/progression/objectifs', 'Ajouter un objectif', '10-goals'],
  ['/wird/aujourdhui', 'Révisions', '11-today'],
  ['/wird/sourates', 'Toutes', '12-surahs'],
  ['/wird/sourates/2', 'Choisir des versets', '13-surah-detail'],
  ['/wird/apprentissage', 'Ajouter une sourate', '14-learning'],
  ['/profil', 'Apparence', '15-profile'],
  ['/profil/notifications', 'Nos règles', '16-notifs'],
  ['/profil/wird', 'Rotation des révisions', '17-wird-settings'],
  ['/profil/donnees', 'Sauvegarde', '18-data'],
]) {
  await page.goto(BASE + path);
  await page.getByText(text).first().waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/${shot}.png` });
}
ok(true, 'tous les écrans se chargent');

// Hors-ligne
await page.goto(BASE + '/');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
await page.getByText('Votre Wird du jour').first().waitFor({ timeout: 8000 });
ok(true, 'rechargement hors connexion OK (service worker)');
const offlineHist = await page.goto(BASE + '/progression/historique').then(() => page.getByText(/Maîtrisé|Difficile/).first().isVisible());
ok(offlineHist, 'données lisibles hors connexion');
await ctx.setOffline(false);

ok(errors.length === 0, `aucune erreur console (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(failures ? `\n${failures} échec(s)` : '\nTous les contrôles passent');
process.exit(failures ? 1 : 0);
