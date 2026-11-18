// Parcours de bout en bout (Playwright). Usage :
//   npm run build && node tests/e2e/serve.mjs 4173 &     (sert dist/ avec les en-têtes de public/_headers, comme Cloudflare Pages)
//   PW_REQUIRE=/chemin/vers/playwright/index.js node tests/e2e/smoke.mjs
import { BASE, OUT, chooseMode, chromium, devices, done, gradeAll, ok, onboard, settle } from './lib.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'allow', locale: 'fr-FR', reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET/.test(m.text()) && errors.push(m.text()));
const body = () => page.locator('body').innerText();

// ---------- en-têtes de sécurité ----------
const res = await page.goto(BASE);
const h = res.headers();
ok(/default-src 'self'/.test(h['content-security-policy'] ?? '') && /frame-ancestors 'none'/.test(h['content-security-policy'] ?? ''), 'en-tête CSP présent');
ok(h['x-content-type-options'] === 'nosniff' && h['x-frame-options'] === 'DENY', 'en-têtes de protection présents');

// ---------- Premier lancement ----------
await page.getByText('garde-le.').waitFor();
ok(await page.getByText('Ce que tu as appris').isVisible(), 'présentation (3 écrans, tutoiement)');
await page.getByRole('button', { name: /Suivant/ }).click();
await page.getByRole('button', { name: 'Retour' }).click();
await page.getByText('garde-le.').waitFor();
await onboard(page, { name: 'Amine', learn: /Avancé/, dir: /De la fin du Coran/ });
const home = await body();
ok(/MÉMORISATION/i.test(home) && /Sourate à apprendre/i.test(home), 'accueil : carte Mémorisation et sourate à apprendre');
ok(/Amine/.test(home), 'accueil : prénom affiché');
const tabs = (await page.locator('nav[aria-label="Navigation principale"] a').allInnerTexts()).map((t) => t.trim()).join('|');
ok(tabs === 'Accueil|Mon Wird|Révisions|Progression|Profil', `5 onglets : ${tabs}`);
await page.screenshot({ path: `${OUT}/01-home.png` });

// ---------- Révisions ----------
await page.goto(BASE + '/revisions');
await page.getByRole('tab', { name: /Aujourd/ }).click();
ok(!/en retard/i.test(await body()), 'Révisions : aucun « retard »');
await page.getByRole('tab', { name: /Apprentissage/ }).click();
await page.getByRole('tab', { name: /À venir/ }).click().catch(() => {});

// ---------- Séance d'apprentissage ----------
await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Continuer', exact: true }).click();
await page.waitForURL('**/session');
await chooseMode(page, 'mushaf');
const n = await gradeAll(page, 'Maîtrisé');
ok(n >= 1, `bilan : ${n} passage(s) évalué(s)`);
await page.waitForTimeout(2200);
ok(/Continuer à apprendre/.test(await body()), 'bilan : proposition de continuer à apprendre');
await page.screenshot({ path: `${OUT}/02-bilan.png`, fullPage: true });
await page.getByRole('button', { name: 'Continuer à apprendre ?' }).click();
await page.waitForURL('**/apprendre');
ok(true, 'écran « Que veux-tu apprendre ? »');
await page.goto(BASE + '/');
await settle(page);

// ---------- Interruption / reprise ----------
const start = page.getByRole('button', { name: /Commencer|Continuer|Reprendre/ }).first();
if (await start.isVisible().catch(() => false)) {
  await start.click();
  await page.waitForURL('**/session');
  if (await page.getByText('Comment veux-tu travailler ?').isVisible().catch(() => false)) await chooseMode(page, 'phone');
  await page.getByRole('button', { name: 'Interrompre' }).first().click();
  await page.waitForURL(BASE + '/');
  ok(true, 'séance interrompue puis retour à l’accueil');
}

// ---------- Mon Wird ----------
await page.locator('nav a', { hasText: 'Mon Wird' }).click();
await page.getByRole('heading', { name: /Mon Wird/ }).waitFor();
const cards = await page.locator('a[href^="/wird/"]').count();
ok(cards === 114, `Mon Wird : ${cards} cartes de sourates`);
await page.getByLabel('Rechercher une sourate').fill('ikhlas');
ok((await page.locator('a[href^="/wird/"]').count()) === 1, 'recherche par nom');
await page.goto(BASE + '/wird/112');
await page.getByRole('heading', { name: /Al-Ikhlas/ }).waitFor();
ok(true, 'détail d’une sourate');

// ---------- Coran numérique (lecteur de pages) ----------
await page.goto(BASE + '/coran?p=1');
await page.locator('.vm').first().waitFor();
ok((await page.locator('.vm').count()) >= 7, 'lecteur : page 1 (Al-Fatiha, 7 versets)');
await page.screenshot({ path: `${OUT}/03-reader.png` });
await page.goto(BASE + '/coran?m=list&s=112');
await page.getByText('Verset 4').waitFor();
ok(true, 'lecteur : liste d’une sourate');

// ---------- Progression / Profil / Paramètres ----------
await page.locator('nav a', { hasText: 'Progression' }).click();
await page.getByText('Mes 114 sourates').waitFor();
ok((await page.locator('ol a[aria-label^="Sourate"]').count()) === 114, 'Progression : 114 cases numérotées');
await page.locator('nav a', { hasText: 'Profil' }).click();
await page.getByRole('link', { name: /Paramètres/ }).click();
await page.getByRole('heading', { name: 'Apparence' }).waitFor();
for (const t of ['Apparence', 'Données et sauvegardes', 'À propos', 'Réinitialisation']) ok((await page.getByText(t, { exact: true }).count()) > 0, `Paramètres : section « ${t} »`);
await page.goto(BASE + '/profil/notifications');
await page.getByRole('heading', { name: 'Rappels', exact: true }).waitFor();
ok(!/Rappels activés/.test(await body()), 'jamais « Rappels activés » sans abonnement réel');

// ---------- Persistance et hors ligne ----------
await page.goto(BASE + '/');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
await page.getByText('Ma progression').first().waitFor({ timeout: 8000 });
ok(true, 'rechargement hors connexion OK (service worker)');
await page.goto(BASE + '/coran?p=3');
await page.locator('.vm').first().waitFor();
ok(true, 'Coran numérique hors connexion');
await ctx.setOffline(false);
ok(errors.length === 0, `aucune erreur console (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
done();
