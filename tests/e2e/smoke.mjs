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
ok(/Ta première étape/.test(home) && !/0 \/ 0 passages/.test(home) && /Commencer à apprendre/.test(home), 'accueil du premier jour : une étape claire, pas de « 0 / 0 passages »');
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
await page.getByRole('button', { name: /Commencer à apprendre|^Commencer$|^Continuer$/ }).first().click();
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
await page.getByRole('button', { name: 'Sélectionner des versets' }).click();
ok(await page.getByText('Sélectionne plusieurs versets d’un geste').isVisible(), 'astuce animée : glisser le doigt sur plusieurs versets');
await page.getByRole('button', { name: 'Essayer' }).click();
await page.waitForTimeout(700);
const v1 = await page.locator('[data-v="1"]').boundingBox();
const v3 = await page.locator('[data-v="3"]').boundingBox();
await page.mouse.move(v1.x + v1.width / 2, v1.y + v1.height / 2);
await page.mouse.down();
await page.mouse.move(v3.x + v3.width / 2, v3.y + v3.height / 2, { steps: 6 });
await page.mouse.up();
ok(/Versets 1 à 3/.test(await page.getByRole('dialog').innerText()), 'glisser sur la grille sélectionne plusieurs versets');
await page.keyboard.press('Escape');

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

// ---------- Réviser en plus, au lancement (sourates seulement déclarées « déjà apprises ») ----------
{
  const c2 = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block', locale: 'fr-FR', reducedMotion: 'reduce' });
  const p2 = await c2.newPage();
  await onboard(p2, { name: 'Sara', known: 'juz' });
  const txt = await p2.locator('body').innerText();
  ok(/Commencer/.test(txt) && /passages?/.test(txt), 'lancement avec des sourates déclarées : un programme de révision est proposé dès le premier jour');
  ok(/Réviser en plus/.test(txt), 'accueil : « Réviser en plus » proposé');
  await p2.getByRole('button', { name: 'Réviser en plus' }).click();
  await p2.getByLabel('Rechercher une sourate').fill('naba');
  await p2.getByRole('button', { name: /An-Naba|Naba/ }).first().click();
  await p2.getByRole('button', { name: 'Choisir des versets' }).click();
  ok(/Versets? \d/.test(await p2.getByRole('dialog').innerText()), 'révision en plus : choix de la plage de versets');
  await p2.getByRole('button', { name: /^Réviser (le|les) versets? / }).click();
  await p2.waitForURL('**/session');
  if (await p2.getByText('Comment veux-tu travailler ?').isVisible().catch(() => false)) await chooseMode(p2, 'mushaf');
  const n2 = await gradeAll(p2, 'Maîtrisé');
  ok(n2 === 1, 'révision en plus : 1 passage évalué et validé');
  await p2.goto(BASE + '/');
  await p2.getByText('Ma progression').first().waitFor();
  ok(/Réviser (davantage|en plus)/.test(await p2.locator('body').innerText()), 'on peut enchaîner une nouvelle révision en plus');
  await c2.close();
}

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
