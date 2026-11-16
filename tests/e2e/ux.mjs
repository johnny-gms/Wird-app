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
ok(/sourates apprises/.test(prog) && /sourates consolidées/.test(prog) && !/non commencées\s*$/m.test(prog.split('ÉVOLUTION')[0].split('VUE D’ENSEMBLE')[1] ?? ''), 'progression : apprises / en cours / à renforcer / consolidées (plus de « non commencées »)');
const pos = (t) => prog.indexOf(t);
ok(pos('MES 114 SOURATES') < pos('VUE D’ENSEMBLE') && pos('VUE D’ENSEMBLE') < pos('ÉVOLUTION') && pos('SUIVI DES HIZB') < pos('MES OBJECTIFS'), 'progression : grille, vue d’ensemble, évolution … objectifs en dernier');

// ---------- Mon Wird : filtres compacts ----------
await page.goto(BASE + '/wird');
await page.getByRole('heading', { name: 'Mes sourates' }).waitFor();
const chips = await page.locator('[role=group][aria-label="Filtrer par état"] button').evaluateAll((els) => els.map((e) => ({ t: e.innerText, h: e.getBoundingClientRect().height })));
ok(chips.length === 5 && chips[0].t === 'Toutes' && chips.every((c) => c.h >= 30 && c.h <= 34), `filtres d’état compacts (${chips.map((c) => `${c.t} ${Math.round(c.h)}px`).join(', ')})`);
const chipsText = await page.locator('[role=group][aria-label="Filtrer par état"]').innerText();
ok(!/Hizb|Juz/.test(chipsText) && (await page.getByRole('button', { name: 'Organiser par Juz et Hizb' }).isVisible()), 'Juz et Hizb séparés des filtres d’état : petit lien discret, pas un filtre');

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

// ---------- Coran : traduction française, mention retirée ----------
await page.goto(BASE + '/coran?m=list&s=112');
await page.getByText('Verset 4').waitFor();
const coran = await body();
ok(/Allah, Unique/.test(coran), 'liste des versets : traduction française sous le texte arabe');
ok(!/Projet Tanzil \(tanzil\.net\)|Touche un verset pour voir sa fiche/.test(coran), 'mention « Texte et pagination : Projet Tanzil… » retirée des pages du Coran');
await page.goto(BASE + '/coran?p=3');
await page.locator('.vm').first().waitFor();
ok(!/Projet Tanzil/.test(await body()), 'mention retirée aussi en vue Pages');
const titleFont = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
ok(/Iowan Old Style|Palatino|Georgia/.test(titleFont), `titres en serif (${titleFont.slice(0, 40)}…)`);

// ---------- Balayage : uniquement les sous-pages, vers leur parent ----------
const swipe = async (y = 300) => {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 4, y }] });
  for (const x of [30, 70, 120, 170]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
};
await page.goto(BASE + '/wird/112');
await page.getByRole('heading', { name: /112\./ }).waitFor();
await swipe();
ok(new URL(page.url()).pathname === '/wird', 'balayage depuis une fiche de sourate → liste des sourates');
await page.goto(BASE + '/progression');
await page.getByText('Mes 114 sourates').waitFor();
await swipe();
ok(new URL(page.url()).pathname === '/progression', 'balayage sans effet sur un onglet principal');
await page.goto(BASE + '/session');
await page.waitForTimeout(500);
const before = new URL(page.url()).pathname;
await swipe();
ok(new URL(page.url()).pathname === before, 'balayage sans effet pendant la séance');

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

// ---------- Onboarding : la dernière sourate (An-Nas) reste entièrement visible ----------
const small = await browser.newContext({ ...devices['iPhone SE'], serviceWorkers: 'block', locale: 'fr-FR', reducedMotion: 'reduce' });
const sp = await small.newPage();
await sp.goto(BASE);
await sp.getByText('garde-le.').waitFor();
await sp.getByRole('button', { name: /Suivant/ }).click();
await sp.getByRole('button', { name: /Suivant/ }).click();
await sp.getByRole('button', { name: /^Commencer/ }).click();
await sp.getByRole('button', { name: 'Continuer sans compte' }).click();
await sp.getByPlaceholder('Ton prénom').fill('Test');
await sp.getByRole('button', { name: 'Continuer' }).click();
await sp.getByRole('radio', { name: /Femme/ }).click();
await sp.getByRole('button', { name: 'Continuer' }).click();
await sp.getByText('Quelles sourates connais-tu déjà').waitFor();
await sp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await sp.waitForTimeout(400);
const geo = await sp.evaluate(() => {
  const last = [...document.querySelectorAll('li')].pop();
  const footer = [...document.querySelectorAll('div')].find((d) => getComputedStyle(d).position === 'fixed' && d.querySelector('button'));
  return { lastBottom: last.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top, text: last.innerText };
});
ok(/Nas/i.test(geo.text) && geo.lastBottom <= geo.footerTop + 1, `An-Nas entièrement visible au-dessus du pied de page (${Math.round(geo.lastBottom)} ≤ ${Math.round(geo.footerTop)})`);
await small.close();

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
