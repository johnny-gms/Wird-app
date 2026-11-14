// Vérifications de la refonte UX : accueil adaptatif, séance (Consulté), progression, filtres, sélection de versets, avatars, paramètres, thèmes, petits écrans.
import { BASE, OUT, chromium, devices, done, markWorked, ok, onboard, settle } from './lib.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'allow', locale: 'fr-FR', reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const body = () => page.locator('body').innerText();

await onboard(page, { name: 'Amine', worked: false });

// ---------- Sourates déclarées ≠ sourates travaillées ----------
await page.goto(BASE + '/wird');
await page.getByRole('heading', { name: 'Mes sourates' }).waitFor();
const tags0 = await page.locator('a[href^="/wird/"]').evaluateAll((els) => els.map((e) => e.innerText));
ok(tags0.filter((t) => /Déjà apprise/.test(t)).length === 37, 'Mon Wird : les 37 sourates déclarées sont étiquetées « Déjà apprise »');
await page.goto(BASE + '/');
await markWorked(page);

// ---------- Accueil : carte verte adaptative ----------
ok(await page.getByText('Continuons ensemble').isVisible(), 'accueil : révisions dues → « Continuons ensemble »');
ok(await page.getByRole('button', { name: 'Commencer ma séance' }).isVisible(), 'accueil : bouton principal « Commencer ma séance »');
ok(await page.getByRole('button', { name: 'Recalculer' }).isVisible() && !(await page.getByRole('button', { name: 'Recalculer' }).evaluate((b) => b.className.includes('btn'))), 'accueil : « Recalculer » est une action secondaire');

// ---------- Séance : titre, « Consulté », sauvegarde, reprise ----------
await page.getByRole('button', { name: 'Commencer ma séance' }).click();
await page.waitForURL('**/session');
await page.getByRole('heading', { name: 'Travail des passages' }).waitFor();
ok(await page.getByRole('button', { name: 'Passer à l’évaluation' }).isVisible(), 'séance : « Passer à l’évaluation »');
ok(!(await page.getByText('Consulté', { exact: true }).count()), 'séance : rien n’est « Consulté » avant ouverture');
await page.locator('main ol > li button[aria-expanded]').first().click();
await page.getByText('Consulté', { exact: true }).first().waitFor();
ok(true, 'séance : un passage ouvert est marqué « Consulté »');
await settle(page, 500);
await page.reload();
await page.getByRole('heading', { name: 'Travail des passages' }).waitFor();
ok((await page.getByText('Consulté', { exact: true }).count()) > 0, 'séance sauvegardée : « Consulté » conservé après rechargement');
await page.getByRole('button', { name: /Interrompre/ }).click();
await page.getByRole('button', { name: /Interrompre|Quitter|Oui/ }).last().click().catch(() => {});
await page.goto(BASE + '/');
await page.getByText('Reprenons là où tu en étais').waitFor();
ok(true, 'accueil : séance en cours → « Reprenons là où tu en étais »');

// ---------- Progression ----------
await page.goto(BASE + '/progression');
await page.getByText('Mes 114 sourates').waitFor();
const prog = await body();
ok(!/versets en apprentissage|versets mémorisés|versets ajoutés/i.test(prog), 'progression : plus de statistiques « versets mémorisés / en apprentissage »');
ok(/sourates apprises/.test(prog) && /non commencées/.test(prog), 'progression : sourates apprises / en cours / à renforcer / non commencées');
const pos = (t) => prog.indexOf(t);
ok(pos('MES 114 SOURATES') < pos('VUE D’ENSEMBLE') && pos('VUE D’ENSEMBLE') < pos('ÉVOLUTION') && pos('SUIVI DES HIZB') < pos('MES OBJECTIFS'), 'progression : grille, vue d’ensemble, évolution … objectifs en dernier');

// ---------- Mon Wird : filtres compacts ----------
await page.goto(BASE + '/wird');
await page.getByRole('heading', { name: 'Mes sourates' }).waitFor();
const chips = await page.locator('[role=group][aria-label="Filtrer par état"] button').evaluateAll((els) => els.map((e) => ({ t: e.innerText, h: e.getBoundingClientRect().height })));
ok(chips.length === 5 && chips[0].t === 'Toutes' && chips.every((c) => c.h >= 30 && c.h <= 34), `filtres d’état compacts (${chips.map((c) => `${c.t} ${Math.round(c.h)}px`).join(', ')})`);
ok(await page.getByRole('button', { name: 'Organiser par Hizb' }).isVisible(), '« Par Hizb » séparé des filtres d’état');

// ---------- Détail : sélection simple / multiple ----------
await page.goto(BASE + '/wird/112');
await page.getByRole('heading', { name: /112\./ }).waitFor();
ok(/à renforcer/.test(await body()) && /en apprentissage/.test(await body()), 'détail : quatre indicateurs');
await page.getByRole('button', { name: /^Verset 1 :/ }).click();
ok(await page.getByRole('dialog').isVisible(), 'grille : appui simple → détail du verset');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
await page.getByRole('button', { name: /^Verset 1 :/ }).click();
await page.getByRole('button', { name: /^Verset 2 :/ }).click();
await page.getByText('2 versets sélectionnés').waitFor();
await page.getByRole('button', { name: /^Verset 2 :/ }).click();
await page.getByText('1 verset sélectionné').waitFor();
ok(true, 'grille : mode sélection (sélection / désélection de plusieurs versets)');
await page.getByRole('button', { name: 'Choisir une action' }).click();
ok(await page.getByRole('dialog').getByRole('button', { name: /Déjà appris/ }).isVisible(), 'sélection → feuille d’actions');
await page.keyboard.press('Escape');

// ---------- Avatars ----------
await page.goto(BASE + '/profil/profil');
await page.getByRole('radio', { name: /Homme/ }).click();
ok(await page.getByRole('img', { name: 'Photo de profil : homme' }).first().isVisible(), 'avatar homme');
await page.getByRole('radio', { name: /Femme/ }).click();
ok(await page.getByRole('img', { name: 'Photo de profil : femme' }).first().isVisible(), 'avatar femme (automatique selon le choix)');
await settle(page, 500);
await page.goto(BASE + '/profil');
await page.getByRole('link', { name: /Paramètres/ }).waitFor();
ok(await page.getByRole('img', { name: 'Photo de profil : femme' }).first().isVisible(), 'avatar affiché dans le Profil');

// ---------- Paramètres : restauration confirmée, thème sombre ----------
await page.goto(BASE + '/profil/parametres');
await page.getByRole('heading', { name: 'Mémorisation et révision' }).waitFor();
await page.locator('input[type=file]').setInputFiles({ name: 'sauvegarde.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
await page.getByText('Restaurer cette sauvegarde ?').waitFor();
ok(true, 'restauration JSON : confirmation demandée avant d’écraser les données');
await page.keyboard.press('Escape');
const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.getByRole('radio', { name: 'Sombre' }).click();
await page.waitForTimeout(300);
const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok(bgLight !== bgDark, `thème sombre appliqué (${bgLight} → ${bgDark})`);
await page.screenshot({ path: `${OUT}/ux-dark.png` });
await page.getByRole('radio', { name: 'Clair' }).click();

// ---------- Lisibilité : petit écran (320 px) ----------
await page.setViewportSize({ width: 320, height: 640 });
for (const path of ['/', '/wird', '/wird/2', '/revisions', '/progression', '/profil', '/profil/parametres']) {
  await page.goto(BASE + path);
  await page.waitForTimeout(500);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 1, `320 px : pas de défilement horizontal (${path})`);
}
ok(errors.length === 0, `aucune erreur JS (${errors.slice(0, 2).join(' | ')})`);
await browser.close();
done();
