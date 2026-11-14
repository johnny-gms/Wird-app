// Parcours de bout en bout (Playwright) — nécessite `npm run build && npm run preview`.
// Usage : PW_REQUIRE=/chemin/package.json BASE_URL=http://127.0.0.1:4173 node tests/e2e/smoke.mjs
import { BASE, OUT, chromium, devices, done, ok, onboard, settle } from './lib.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'allow', locale: 'fr-FR', reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// ---------- Premier lancement ----------
await page.goto(BASE);
await page.getByText('garde-le.').waitFor();
ok(await page.getByText('Ce que tu as appris').isVisible(), 'présentation (3 écrans, tutoiement)');
await page.screenshot({ path: `${OUT}/01-welcome.png` });
await page.getByRole('button', { name: /Suivant/ }).click();
ok(await page.getByRole('button', { name: 'Retour' }).isVisible(), 'bouton retour dès le 2e écran');
await page.getByRole('button', { name: 'Retour' }).click();
await page.getByText('garde-le.').waitFor();
await page.getByRole('button', { name: /Suivant/ }).click();
await page.getByRole('button', { name: /Suivant/ }).click();
await page.getByRole('button', { name: /^Commencer/ }).click();
await page.getByText(/Crée ton compte/).waitFor();
ok(true, 'écran de création de compte / connexion (e-mail + mot de passe)');
await page.getByRole('button', { name: 'Continuer sans compte' }).click();
await page.getByPlaceholder('Ton prénom').fill('Amine');
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByText('Quelles sourates connais-tu déjà').waitFor();
await page.getByRole('button', { name: /Juz/ }).click();
ok((await page.locator('text=/^37$/').count()) > 0, 'sélection multiple : Juz ʿAmma → 37 sourates cochées');
await page.getByRole('checkbox', { name: /Al-Fatihah/ }).click();
await page.getByRole('checkbox', { name: /Al-Fatihah/ }).click();
await page.screenshot({ path: `${OUT}/02-known.png` });
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByRole('radio', { name: /An-Nas → Al-Fatiha/ }).click();
await page.getByText(/Prochaine sourate proposée : 77\./).waitFor();
ok(true, 'sens d’apprentissage inversé → prochaine sourate proposée : 77');
await page.getByRole('radio', { name: /Des pages par semaine/ }).click();
await page.getByRole('button', { name: /Plus de pages par semaine/ }).click();
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByText('Combien de pages réviser par jour').waitFor();
await page.getByRole('button', { name: /Plus de pages à réviser/ }).click();
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByText('Tout est prêt').waitFor();
const recap = await page.locator('ul').first().innerText();
ok(/37 sourates/.test(recap) && /An-Nas → Al-Fatiha/.test(recap) && /3 pages par semaine/.test(recap) && /2 pages par jour/.test(recap), 'récapitulatif fidèle');
await page.getByRole('button', { name: /C’est parti/ }).click();
await page.getByText('Ma progression').first().waitFor();
await settle(page);

// ---------- Accueil / navigation ----------
const head = await page.locator('h1').first().innerText();
ok(/As-salam alaykoum/.test(head) && !/Bonjour|Bonsoir/.test(head), `salutation : « ${head} »`);
const tabs = await page.locator('nav[aria-label="Navigation principale"] a').allInnerTexts();
ok(tabs.map((t) => t.trim()).join('|') === 'Accueil|Mon Wird|Révisions|Progression|Profil', `5 onglets : ${tabs.join(', ')}`);
const home = await page.locator('body').innerText();
ok(/aujourd’hui/i.test(home) && /ma progression/i.test(home) && /régularité/i.test(home) && /Coran numérique/.test(home), 'accueil : programme, progression, régularité, Coran numérique');
await page.screenshot({ path: `${OUT}/03-home.png`, fullPage: true });
await page.reload();
await page.getByText('Ma progression').first().waitFor();
ok(true, 'relancement : arrivée directe sur l’accueil');

// ---------- Mon Wird : 114 cartes, états, filtres ----------
await page.locator('nav a', { hasText: 'Mon Wird' }).click();
await page.getByRole('heading', { name: 'Mes sourates' }).waitFor();
const cards = await page.locator('a[href^="/wird/"]').count();
ok(cards === 114, `Mon Wird : ${cards} cartes de sourates`);
await page.screenshot({ path: `${OUT}/04-monwird.png` });
await page.getByLabel('Rechercher une sourate').fill('ikhlas');
ok((await page.locator('a[href^="/wird/"]').count()) === 1, 'recherche par nom');
await page.getByLabel('Rechercher une sourate').fill('');
await page.getByRole('button', { name: 'Par Hizb' }).click();
await page.getByRole('button', { name: '60', exact: true }).click();
await page.getByText(/dans le Hizb 60/).waitFor();
const n60 = (await page.locator('a[href^="/wird/"]').count());
ok(n60 > 20 && n60 < 40, `filtre par Hizb : ${n60} sourates dans le Hizb 60`);
await page.getByRole('button', { name: /Hizb 60/ }).click();
await page.getByRole('button', { name: '60', exact: true }).click(); // retire le filtre
await page.getByRole('button', { name: 'Apprises' }).click();
ok((await page.locator('a[href^="/wird/"]').count()) === 37, 'filtre « Apprises » : 37 sourates');
await page.getByRole('button', { name: 'Toutes' }).click();
const slider = page.getByRole('slider', { name: 'Défilement rapide' });
await slider.waitFor();
await page.mouse.wheel(0, 200); await page.waitForTimeout(300);
const box = await slider.boundingBox();
const y0 = await page.evaluate(() => scrollY);
await page.mouse.wheel(0, 300); await page.waitForTimeout(350);
await page.mouse.move(box.x + box.width - 14, box.y + 30);
await page.mouse.down();
await page.mouse.move(box.x + box.width - 14, box.y + box.height - 20, { steps: 8 });
await page.mouse.up();
ok((await page.evaluate(() => scrollY)) > y0 + 2000, 'curseur de défilement rapide déplaçable');

// ---------- Détail d'une sourate : sélection rapide par groupes de 5 ----------
await page.goto(BASE + '/wird/2');
await page.getByRole('heading', { name: /2\. Al-Baqarah/ }).waitFor();
await page.getByRole('button', { name: 'Sélectionner des versets' }).click();
await page.getByRole('dialog').waitFor();
await page.getByRole('button', { name: '1–5', exact: true }).click();
await page.getByRole('button', { name: '6–10', exact: true }).click();
ok(/10 versets sélectionnés/.test(await page.getByRole('dialog').innerText()), 'groupes de 5 : 1–5 + 6–10 = 10 versets');
await page.getByRole('button', { name: 'Moins', exact: true }).click(); // groupes de 4
ok(await page.getByRole('button', { name: '1–4', exact: true }).isVisible(), 'taille des groupes ajustable');
await page.getByRole('button', { name: 'Plus', exact: true }).click();
await page.screenshot({ path: `${OUT}/05-picker.png` });
await page.getByRole('button', { name: /Déjà appris/ }).click();
await page.getByText('Ajouté à ta rotation').waitFor();
await settle(page);
await page.getByRole('button', { name: /Verset 3 : Appris/ }).click();
await page.getByRole('dialog').waitFor();
ok(/Appris/.test(await page.getByRole('dialog').innerText()), 'fiche d’un verset (état)');
await page.keyboard.press('Escape');

// ---------- Coran numérique ----------
await page.goto(BASE + '/coran?p=1');
await page.getByText('Page 1 / 604').waitFor();
await page.locator('.vm').first().waitFor();
ok((await page.locator('.vm').count()) >= 7, 'Coran numérique : page 1 (Al-Fatiha, 7 versets)');
await page.getByRole('button', { name: 'Suivante' }).click();
await page.getByText('Page 2 / 604').waitFor();
await page.getByRole('button', { name: 'Agrandir le texte' }).click();
await page.locator('p.ar span.cursor-pointer').first().click();
await page.getByRole('dialog').waitFor();
ok(/Modifier le statut/.test(await page.getByRole('dialog').innerText()), 'toucher un verset ouvre sa fiche');
await page.keyboard.press('Escape');
await page.screenshot({ path: `${OUT}/06-coran.png` });
await page.goto(BASE + '/coran?m=list&s=112');
await page.getByText('Verset 4').waitFor();
ok(true, 'Coran numérique : liste d’une sourate');

// ---------- Révisions ----------
await page.locator('nav a', { hasText: 'Révisions' }).click();
await page.getByRole('heading', { name: 'Mes révisions' }).waitFor();
const rev = await page.locator('body').innerText();
ok(/renforcement/i.test(rev) && /nouvel apprentissage/i.test(rev) && /à venir/i.test(rev) && /mon apprentissage/i.test(rev) && !/en retard/i.test(rev), 'Révisions : aujourd’hui, renforcement, apprentissage, à venir (aucun « retard »)');
await page.screenshot({ path: `${OUT}/07-revisions.png`, fullPage: true });

// ---------- Séance : travail sans interruption, évaluation finale, annulation ----------
await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Commencer ma séance' }).click();
await page.waitForURL('**/session');
await page.getByRole('heading', { name: 'Séance du jour' }).waitFor();
const items = await page.locator('main ol > li').count();
ok(items >= 3, `la séance affiche tout le programme (${items} éléments)`);
await page.locator('main ol > li button[aria-expanded]').first().click();
await page.getByRole('button', { name: /Ouvrir dans le Coran WIRD/ }).click();
await page.getByRole('dialog', { name: 'Coran numérique' }).waitFor();
await page.locator('.vm').first().waitFor();
ok(true, 'Coran WIRD ouvert depuis la séance (sans quitter la séance)');
await page.getByRole('button', { name: /Retour à la séance/ }).click();
await page.getByRole('button', { name: 'Interrompre' }).click();
await page.waitForURL(BASE + '/');
await page.locator('nav a', { hasText: 'Révisions' }).click();
await page.getByText('Activités inachevées').waitFor();
ok(true, 'séance interrompue → « Activités inachevées » dans Révisions');
await page.getByRole('button', { name: /Reprendre/ }).first().click();
await page.getByRole('heading', { name: 'Séance du jour' }).waitFor();
await page.getByRole('button', { name: 'Terminer la séance' }).click();
const groups = page.getByRole('radiogroup');
const n = await groups.count();
ok(await page.getByRole('button', { name: 'Valider le bilan' }).isDisabled(), 'validation impossible tant que tout n’est pas évalué');
const levels = ['Maîtrisé', 'Quelques hésitations', 'Difficile', 'Non maîtrisé'];
for (let i = 0; i < n; i++) await groups.nth(i).getByRole('radio', { name: levels[i % 4], exact: true }).click();
await groups.nth(0).getByRole('radio', { name: 'Non maîtrisé', exact: true }).click();
await page.screenshot({ path: `${OUT}/08-eval.png`, fullPage: true });
await page.getByRole('button', { name: 'Valider le bilan' }).click();
await page.waitForURL('**/session/bilan');
await page.getByText('Séance accomplie').waitFor();
ok(true, 'bilan de séance');
await page.getByRole('button', { name: 'Annuler la validation' }).click();
await page.waitForURL('**/session');
await page.getByRole('heading', { name: 'Bilan de la séance' }).waitFor();
ok((await page.getByRole('radiogroup').nth(0).getByRole('radio', { name: 'Non maîtrisé', exact: true }).getAttribute('aria-checked')) === 'true', 'annulation de la validation : évaluations retrouvées');
await page.goto(BASE + '/progression');
await page.getByText('Mes 114 sourates').waitFor();
await page.goto(BASE + '/session');
await page.getByRole('button', { name: 'Valider le bilan' }).click();
await page.waitForURL('**/session/bilan');
await settle(page);

// ---------- Progression ----------
await page.getByRole('link', { name: 'Retour à l’accueil' }).click();
await page.locator('nav a', { hasText: 'Progression' }).click();
await page.getByText('Mes 114 sourates').waitFor();
const cells = await page.locator('ol a[aria-label^="Sourate"]').count();
const states = await page.locator('ol a[aria-label^="Sourate"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').split(' : ')[1]));
const count = (x) => states.filter((s) => s === x).length;
ok(cells === 114 && count('apprise') + count('à renforcer') >= 37 && count('non commencée') > 50, `114 cases numérotées (apprises ${count('apprise')}, à renforcer ${count('à renforcer')}, en cours ${count('en cours')}, non commencées ${count('non commencée')})`);
ok((await page.locator('[role=group][aria-label="60 Hizb"] button').count()) === 60, 'Hizb : 60 cellules compactes');
ok((await page.getByText('Mes objectifs').count()) > 0 && /Ajouter un objectif/.test(await page.locator('body').innerText()), 'objectifs : section courte');
await page.screenshot({ path: `${OUT}/09-progress.png`, fullPage: true });

// ---------- Profil ----------
await page.locator('nav a', { hasText: 'Profil' }).click();
await page.getByText('Apprentissage et révision').waitFor();
ok(!(await page.getByText('Sens de révision').count()) || /Hizb par Hizb/.test(await page.locator('body').innerText()), 'Profil : plus de réglage du sens de révision');
await page.screenshot({ path: `${OUT}/10-profile.png`, fullPage: true });

// ---------- Rappels : états honnêtes + tableau de bord Cloudflare ----------
await page.goto(BASE + '/profil/notifications');
await page.getByRole('heading', { name: 'Rappels', exact: true }).waitFor();
await page.getByText('Tableau de bord de configuration').waitFor();
const notif = await page.locator('body').innerText();
ok(/quatre rappels indépendants/i.test(notif) && /rappel quotidien/i.test(notif) && /deuxième rappel/i.test(notif) && /travail inachevé/i.test(notif) && /message de retour/i.test(notif), 'quatre catégories indépendantes');
ok(/À faire/.test(notif) && /VITE_PUSH_API_URL/.test(notif) && /wrangler deploy/.test(notif), 'tableau de bord : actions Cloudflare listées précisément');
ok(!/Rappels activés/.test(notif), 'jamais « Rappels activés » sans abonnement réel');
await page.screenshot({ path: `${OUT}/11-notifs.png`, fullPage: true });

// ---------- Hors ligne ----------
await page.goto(BASE + '/');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
await page.getByText('Ma progression').first().waitFor({ timeout: 8000 });
ok(true, 'rechargement hors connexion OK (service worker)');
await page.goto(BASE + '/coran?p=3');
await page.getByText('Page 3 / 604').waitFor();
await page.locator('.vm').first().waitFor();
ok(true, 'Coran numérique hors connexion');
await ctx.setOffline(false);
ok(errors.length === 0, `aucune erreur console (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
done();
