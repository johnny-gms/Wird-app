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
await page.screenshot({ path: `${OUT}/01-welcome.png` });
await page.getByRole('button', { name: /^Commencer/ }).click();
await page.getByText('Quelles sourates connaissez-vous déjà').waitFor();
await page.getByRole('button', { name: /Juz/ }).click();
await page.getByText('37').first().waitFor();
ok((await page.locator('text=/^37$/').count()) > 0, 'sélection multiple : Juz ʿAmma → 37 sourates cochées (compteur)');
// décocher / cocher une sourate, recherche, plage
await page.getByRole('checkbox', { name: /Al-Fatihah/ }).click();
ok((await page.getByRole('checkbox', { name: /Al-Fatihah/ }).getAttribute('aria-checked')) === 'true', 'cocher une sourate');
await page.getByRole('checkbox', { name: /Al-Fatihah/ }).click();
ok((await page.getByRole('checkbox', { name: /Al-Fatihah/ }).getAttribute('aria-checked')) === 'false', 'décocher une sourate');
await page.getByLabel('De la sourate').fill('1');
await page.getByLabel('À la sourate').fill('3');
await page.getByRole('button', { name: 'Cocher', exact: true }).click();
await page.getByRole('button', { name: 'Tout décocher' }).click();
await page.getByRole('button', { name: /Juz/ }).click();
await page.screenshot({ path: `${OUT}/02-known.png` });
await page.getByRole('button', { name: 'Continuer' }).click();
// sens d'apprentissage : An-Nas → Al-Fatiha ; la prochaine sourate proposée est la 77
await page.getByRole('radio', { name: /De An-Nas vers Al-Fatiha/ }).click();
await page.getByText(/Prochaine sourate proposée : 77\./).waitFor();
ok(true, 'sens d’apprentissage inversé → prochaine sourate proposée : 77 (avant la 78)');
await page.getByRole('radio', { name: /De Al-Fatiha vers An-Nas/ }).click();
await page.getByText(/Prochaine sourate proposée : 1\. Al-Fatihah/).waitFor();
await page.getByRole('radio', { name: /De An-Nas vers Al-Fatiha/ }).click();
await page.getByRole('button', { name: 'Continuer' }).click();
// sens de révision : indépendant → An-Nas → Al-Fatiha pour la révision, Al-Fatiha → An-Nas pour l'apprentissage ?
await page.getByText('Dans quel sens réviser').waitFor();
await page.getByRole('radio', { name: /De An-Nas vers Al-Fatiha/ }).click();
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByText('Votre programme quotidien').waitFor();
await page.getByRole('button', { name: /Plus de pages à réviser/ }).click();
await page.getByRole('button', { name: /Plus de pages à apprendre/ }).click();
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByText('Tout est prêt').waitFor();
const recap = await page.locator('ul').first().innerText();
ok(/37 sourates/.test(recap) && /An-Nas → Al-Fatiha/.test(recap) && /1 page à apprendre/.test(recap) && /2,5 pages à réviser/.test(recap), 'récapitulatif fidèle à la configuration');
await page.getByRole('button', { name: 'Modifier' }).first().click(); // retour à l'étape 1 (correction possible)
await page.getByText('Quelles sourates connaissez-vous déjà').waitFor();
ok(true, 'retour arrière pour corriger ses choix');
for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByRole('button', { name: /Commencer à utiliser/ }).click();
await page.getByText('Programme du jour').first().waitFor();
await settle(page);
ok(true, 'fin du parcours → accueil');

// ---------- Persistance : plus de parcours au relancement, réglages conservés ----------
await page.reload();
await page.getByText('Programme du jour').first().waitFor();
ok(true, 'relancement : arrivée directe sur l’accueil (parcours non rejoué)');
await page.goto(BASE + '/profil/wird');
await page.getByText('Pages à apprendre').waitFor();
ok(/1/.test(await page.getByRole('button', { name: /Moins de pages à apprendre/ }).locator('xpath=../div').innerText()), 'objectif d’apprentissage sauvegardé (1 page)');
ok((await page.getByRole('radio', { name: 'An-Nas → Al-Fatiha' }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked')))).join() === 'true,true', 'sens d’apprentissage et de révision sauvegardés');
await page.screenshot({ path: `${OUT}/03-settings.png` });
// indépendance : on remet la révision dans l'autre sens sans toucher à l'apprentissage
await page.getByRole('radio', { name: 'Al-Fatiha → An-Nas' }).nth(1).click();
const st = await page.getByRole('radio', { name: /Fatiha → An-Nas|An-Nas → Al-Fatiha/ }).evaluateAll((els) => els.map((e) => `${e.textContent}:${e.getAttribute('aria-checked')}`));
ok(st.join('|') === 'Al-Fatiha → An-Nas:false|An-Nas → Al-Fatiha:true|Al-Fatiha → An-Nas:true|An-Nas → Al-Fatiha:false', `sens d’apprentissage et de révision indépendants (${st.join(' | ')})`);
await settle(page);

// ---------- Accueil ----------
await page.goto(BASE + '/');
await page.getByText('Programme du jour').first().waitFor();
const home = await page.locator('main, body').first().innerText();
ok(/À apprendre/i.test(home) && /À réviser/i.test(home) && /Commencer la séance/.test(home), 'accueil : programme du jour (apprendre / réviser) + accès à la séance');
ok(/Régularité/.test(home) && /Où j’en suis/.test(home), 'accueil : progression + régularité');
await page.screenshot({ path: `${OUT}/04-home.png`, fullPage: true });
const tabs = await page.locator('nav[aria-label="Navigation principale"] a').allInnerTexts();
ok(tabs.map((t) => t.trim()).join('|') === 'Accueil|Mon Wird|Progression|Profil', 'navigation : 4 onglets');

// ---------- Tableau des 114 sourates ----------
await page.goto(BASE + '/wird/sourates');
await page.getByRole('region', { name: 'Progression globale' }).waitFor();
const cells = await page.locator('ol li a[aria-label^="Sourate"]').count();
ok(cells === 114, `tableau : ${cells} cases`);
const states = await page.locator('ol li a[aria-label^="Sourate"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').split(' : ')[1]));
const count = (s) => states.filter((x) => x === s).length;
ok(count('apprise') === 37 && count('en cours d’apprentissage') >= 1 && count('non commencée') > 60, `couleurs = états réels (apprises ${count('apprise')}, en cours ${count('en cours d’apprentissage')}, non commencées ${count('non commencée')})`);
ok(await page.getByRole('list', { name: 'Légende' }).isVisible(), 'légende affichée');
await page.screenshot({ path: `${OUT}/05-grid.png`, fullPage: true });
await page.getByRole('link', { name: /Sourate 114, An-Nas/ }).click();
await page.getByText('Choisir des versets').waitFor();
ok(page.url().endsWith('/wird/sourates/114'), 'case cliquable → détail de la sourate');

// ---------- Liste : hizb, recherche, défilement rapide ----------
await page.goto(BASE + '/wird/sourates');
await page.getByRole('tab', { name: 'Liste' }).or(page.getByRole('radio', { name: 'Liste' })).first().click();
await page.getByText('114 sourates').first().waitFor();
await page.getByRole('button', { name: 'Par hizb' }).click();
await page.getByRole('button', { name: '60', exact: true }).click();
await page.getByText(/dans le hizb 60/).waitFor();
const n60 = Number((await page.getByText(/sourates? dans le hizb 60/).innerText()).match(/(\d+) sourate/)[1]);
ok(n60 > 20 && n60 < 40, `filtre par hizb : le hizb 60 contient ${n60} sourates`);
await page.getByLabel('Retirer le filtre hizb').click();
await page.getByLabel('Rechercher une sourate').fill('ikhlas');
ok((await page.locator('ul li a[href^="/wird/sourates/"]').count()) === 1, 'recherche par nom');
await page.getByLabel('Rechercher une sourate').fill('36');
await page.getByText('Ya-Sin').or(page.getByText(/Y[aā]-?S[iī]n/i)).first().waitFor();
ok(true, 'recherche par numéro');
await page.getByLabel('Rechercher une sourate').fill('');
const slider = page.getByRole('slider', { name: 'Défilement rapide' });
await slider.waitFor();
const box = await slider.boundingBox();
const y0 = await page.evaluate(() => scrollY);
await page.mouse.move(box.x + box.width - 14, box.y + 30);
await page.mouse.down();
await page.mouse.move(box.x + box.width - 14, box.y + box.height - 20, { steps: 8 });
await page.screenshot({ path: `${OUT}/06-fastscroll.png` });
await page.mouse.up();
const y1 = await page.evaluate(() => scrollY);
ok(y1 > y0 + 2000, `barre de défilement rapide : curseur attrapé et déplacé (${Math.round(y0)} → ${Math.round(y1)} px)`);
await page.getByText('An-Nas').last().waitFor();

// ---------- Séance : programme complet → terminer → évaluation individuelle → bilan ----------
await page.goto(BASE + '/');
await page.getByRole('button', { name: /Commencer la séance/ }).click();
await page.waitForURL('**/session');
await page.getByRole('heading', { name: 'Séance du jour' }).waitFor();
const items = await page.locator('main ol > li').count();
ok(items >= 3, `la séance affiche tout le programme (${items} éléments)`);
await page.screenshot({ path: `${OUT}/07-session-program.png`, fullPage: true });
// texte de référence (Tanzil) + Basmala séparée du verset 1
await page.locator('main ol > li button[aria-expanded]').first().click();
await page.getByText(/﴿/).first().waitFor();
const ref = await page.getByLabel('Texte de référence').first().innerText();
ok(/﴿/.test(ref) && /Tanzil/.test(ref), 'texte de référence Tanzil affiché');
// interruption puis reprise : rien n'est perdu
await page.getByRole('button', { name: 'Interrompre' }).click();
await page.waitForURL(BASE + '/');
await page.getByRole('button', { name: /Reprendre la séance/ }).click();
await page.getByRole('heading', { name: 'Séance du jour' }).waitFor();
ok(true, 'interruption puis reprise');
await page.getByRole('button', { name: 'Terminer la séance' }).click();
await page.getByRole('heading', { name: 'Bilan de la séance' }).waitFor();
ok(await page.getByRole('button', { name: 'Valider le bilan' }).isDisabled(), 'validation impossible tant que tout n’est pas évalué');
await page.screenshot({ path: `${OUT}/08-session-eval.png`, fullPage: true });
// évaluation individuelle (4 niveaux existants) ; on modifie une évaluation ; retour arrière sans perte
const groups = page.getByRole('radiogroup');
const n = await groups.count();
const levels = ['Maîtrisé', 'Quelques hésitations', 'Difficile', 'Non maîtrisé'];
const labels = await page.getByRole('radio', { name: levels[0], exact: true }).first().innerText();
ok(labels.includes('Maîtrisé'), 'niveaux d’évaluation inchangés');
for (let i = 0; i < n; i++) await groups.nth(i).getByRole('radio', { name: levels[i % 4], exact: true }).click();
await groups.nth(0).getByRole('radio', { name: 'Non maîtrisé', exact: true }).click(); // modification avant validation
ok((await groups.nth(0).getByRole('radio', { name: 'Non maîtrisé', exact: true }).getAttribute('aria-checked')) === 'true', 'évaluation modifiable avant validation');
await page.getByRole('button', { name: /Retour au programme/ }).click();
await page.getByRole('heading', { name: 'Séance du jour' }).waitFor();
await page.getByRole('button', { name: 'Terminer la séance' }).click();
ok((await page.getByRole('radiogroup').nth(0).getByRole('radio', { name: 'Non maîtrisé', exact: true }).getAttribute('aria-checked')) === 'true', 'bouton retour : évaluations conservées');
await page.getByRole('button', { name: 'Valider le bilan' }).click();
await page.waitForURL('**/session/bilan');
await page.getByText('Séance accomplie').waitFor();
ok(true, 'bilan de séance affiché');
await page.screenshot({ path: `${OUT}/09-bilan.png`, fullPage: true });

// ---------- Persistance & hors ligne ----------
await settle(page);
await page.goto(BASE + '/progression/historique');
await page.getByText(/Non maîtrisé/).first().waitFor();
await page.reload();
await page.getByText(/Non maîtrisé/).first().waitFor();
ok(true, 'historique persistant après rechargement');
for (const [path, text, shot] of [['/progression/general', 'Progression générale', '10-progress'], ['/progression/hizb', 'Un hizb est', '11-hizb'], ['/profil', 'Apparence', '12-profile'], ['/profil/notifications', 'Nos règles', '13-notifs']]) {
  await page.goto(BASE + path);
  await page.getByText(text).first().waitFor();
  await page.screenshot({ path: `${OUT}/${shot}.png` });
}
await page.goto(BASE + '/');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
await page.getByText('Programme du jour').first().waitFor({ timeout: 8000 });
ok(true, 'rechargement hors connexion OK (service worker)');
await page.goto(BASE + '/wird/sourates');
await page.getByLabel('Rechercher une sourate').waitFor();
ok(true, 'liste des sourates hors connexion');
await ctx.setOffline(false);
ok(errors.length === 0, `aucune erreur console (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
done();
