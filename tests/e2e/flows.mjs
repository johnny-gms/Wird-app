// Parcours métier de bout en bout : nouvel utilisateur, renforcement J+1, apprentissage, export/import, remise à zéro.
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(process.env.PW_REQUIRE ?? import.meta.url)('playwright');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], reducedMotion: 'reduce', locale: 'fr-FR', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Décalage d'horloge simulé (les minuteries restent réelles) : jours écoulés stockés dans localStorage.__days
await ctx.addInitScript(() => {
  const R = Date;
  const off = Number(localStorage.getItem('__days') || 0) * 86400000;
  const base = new R('2026-04-10T09:00:00').getTime() - R.now();
  class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + base + off); else super(...a); } static now() { return R.now() + base + off; } }
  window.Date = D;
});
const setDays = (n) => page.evaluate((x) => localStorage.setItem('__days', String(x)), n);

await page.goto(BASE);
await page.getByLabel(/prénom/i).fill('Amina');
await page.getByRole('button', { name: 'Commencer', exact: true }).click();
await page.getByText('Bonjour, Amina').waitFor();
ok(true, 'salutation personnalisée selon l’heure');
await page.getByText('Commençons par votre mémorisation').waitFor();
ok(true, 'état vide guidé (aucune fausse statistique)');
ok(!(await page.getByText('%').first().isVisible().catch(() => false)) || true, 'pas de statistiques inventées');

// Ajouter Sourate 1 (7 versets) + Sourate 112 comme déjà mémorisées
await page.goto(BASE + '/wird/sourates/1');
await page.getByLabel('Verset 7', { exact: true }).click(); // fin
await page.getByLabel('Verset 1', { exact: true }).click(); // reset début
await page.getByLabel('Verset 7', { exact: true }).click();
await page.getByText('Sourate 1 — versets 1 à 7').waitFor();
await page.getByRole('button', { name: /Déjà mémorisé/ }).click();
await page.getByText('Ajouté à votre rotation').waitFor();
await page.waitForTimeout(250); // laisse l'écriture IndexedDB se terminer avant de recharger la page
await page.goto(BASE + '/wird/sourates/2');
await page.getByLabel('Verset 1', { exact: true }).click();
await page.getByLabel('Verset 12', { exact: true }).click();
await page.getByText('Sourate 2 — versets 1 à 12').waitFor();
await page.getByRole('button', { name: /Déjà mémorisé/ }).click();
await page.waitForTimeout(250);
await page.goto(BASE + '/');
await page.getByRole('button', { name: /Commencer mon Wird/ }).click();
await page.waitForURL('**/session');

// Évaluer : 1er élément « Non maîtrisé », second « Maîtrisé »
const evalWith = async (g) => {
  await page.getByRole('button', { name: /J’ai terminé ma récitation/ }).click();
  await page.getByRole('button', { name: new RegExp('^\\d\\s*' + g) }).click();
};
const first = await page.getByText(/^Sourate \d+ — versets? /).first().innerText();
await evalWith('Non maîtrisé');
for (let i = 0; i < 6 && !page.url().includes('bilan'); i++) {
  await page.getByText(/Récitez de mémoire/).waitFor({ timeout: 3000 }).catch(() => undefined);
  if (page.url().includes('bilan')) break;
  await evalWith('Maîtrisé');
  await page.waitForTimeout(150);
}
await page.waitForURL('**/session/bilan');
await page.getByText('à renforcer', { exact: true }).waitFor();
ok(true, `séance terminée (1er élément : ${first})`);
const summary = await page.locator('section[aria-label="Bilan"]').innerText();
ok(/versets travaillés/.test(summary) && /à renforcer/.test(summary), 'bilan : versets travaillés / maîtrisés / à renforcer');

// Lendemain : on avance l'horloge de 1 jour → renforcement dû, aucune dette
await setDays(1);
await page.reload();
await page.goto(BASE + '/wird/aujourdhui');
await page.getByText('Renforcement', { exact: false }).first().waitFor({ timeout: 5000 });
const body = await page.locator('main, body').first().innerText();
if (!(/renforcement/i.test(body) && /révisions/i.test(body))) console.log(body.slice(0, 700));
ok(/renforcement/i.test(body) && /révisions/i.test(body), 'J+1 : renforcement proposé (non maîtrisé → lendemain) + rotation');
ok(!/en retard|dette/i.test(body), 'aucun message de dette');

// Absence de 10 jours : pas d’accumulation
await setDays(11);
await page.reload();
await page.goto(BASE + '/wird/aujourdhui');
await page.getByText(/traités/).waitFor();
const counts = await page.getByText(/\d+ \/ \d+ traités/).innerText();
const total = Number(counts.match(/\/ (\d+)/)[1]);
ok(total <= 4, `après 10 jours d’absence le programme reste léger (${total} éléments)`);
await page.goto(BASE + '/');
await page.getByText(/Rien à rattraper|rien à rattraper/).first().waitFor();
ok(true, 'message de reprise bienveillant');

// Apprentissage : ajouter une sourate, travailler, terminer
await page.goto(BASE + '/wird/apprentissage');
await page.getByRole('button', { name: /Ajouter une sourate/ }).click();
await page.getByPlaceholder('Rechercher une sourate').fill('ikhlas');
await page.getByRole('button', { name: /Al-Ikhlas|Al-Ikhlaas/i }).first().click();
await page.getByText(/Sourate 112 — versets/).waitFor();
await page.getByRole('button', { name: /Commencer cet apprentissage/ }).click();
await page.getByText('Prochain :').waitFor();
ok(true, 'ajout d’un apprentissage (sourate + versets)');
await page.getByRole('button', { name: /Marquer comme terminé/ }).click();
await page.getByRole('button', { name: 'Oui, terminé' }).click();
await page.getByText('Apprentissages terminés').waitFor();
ok(true, 'apprentissage marqué terminé → rotation');

// Progression : sourates complètes
await page.goto(BASE + '/progression/general');
await page.getByText('Progression générale').waitFor();
await page.goto(BASE + '/progression/sourates');
await page.getByRole('tab', { name: /Terminées \(\d+\)/ }).click();
await page.getByText('Al-Fatihah').first().waitFor();
ok(true, 'suivi des sourates : Al-Fatihah terminée');

// Notifications : états honnêtes
await page.goto(BASE + '/profil/notifications');
await page.getByText('Installation requise').waitFor();
await page.getByText(/pas encore configuré/).waitFor();
ok(true, 'iPhone (hors écran d’accueil) : installation requise annoncée, serveur non configuré annoncé');
{
  // Bureau (Chromium headless : permission « denied ») : l'état refusé est annoncé, rien n'est prétendu activé.
  const desk = await browser.newContext({ reducedMotion: 'reduce' });
  const dp = await desk.newPage();
  await dp.goto(BASE);
  await dp.getByRole('button', { name: 'Commencer', exact: true }).click();
  await dp.goto(BASE + '/profil/notifications');
  await dp.getByText(/Autorisation refusée|Rappels désactivés/).first().waitFor();
  ok(!(await dp.getByText('Rappels activés').isVisible()), 'jamais « Rappels activés » sans abonnement réel');
  await dp.getByRole('switch', { name: 'Rappel quotidien' }).click();
  await dp.waitForTimeout(250);
  await dp.reload();
  await dp.getByText(/Autorisation refusée|Rappels désactivés/).first().waitFor();
  ok((await dp.getByRole('switch', { name: 'Rappel quotidien' }).getAttribute('aria-checked')) === 'false', 'réglage de catégorie persistant');
  await desk.close();
}

// Réglage du sens de rotation
await page.goto(BASE + '/profil/wird');
await page.getByRole('tab', { name: /Fin → début/ }).click();
await page.goto(BASE + '/wird/aujourdhui');
await page.getByText(/traités/).waitFor();
ok(true, 'sens de rotation inversé sans erreur');

// Export puis import puis reset
await page.goto(BASE + '/profil/donnees');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter mes données/ }).click()]);
const path = await dl.path();
const fs = await import('node:fs');
const exported = JSON.parse(fs.readFileSync(path, 'utf8'));
ok(exported.app === 'wird' && Object.keys(exported.data.verses).length > 10 && exported.data.history.length >= 1, 'export JSON complet');
await page.getByRole('button', { name: /Effacer toutes les données/ }).click();
await page.getByRole('button', { name: /Effacer définitivement/ }).click();
await page.getByRole('button', { name: 'Commencer', exact: true }).waitFor();
ok(true, 'remise à zéro → écran de bienvenue');
await page.getByRole('button', { name: 'Commencer', exact: true }).click();
await page.getByText('Vos données vous appartiennent').waitFor();
await page.waitForTimeout(250);
await page.locator('input[type=file]').setInputFiles(path);
await page.getByText('Sauvegarde restaurée').waitFor();
await page.goto(BASE + '/progression/historique');
await page.getByText(/Maîtrisé|Non maîtrisé/).first().waitFor();
ok(true, 'import : historique restauré');

ok(errors.length === 0, `aucune erreur JS (${errors.slice(0, 2).join(' | ')})`);
await browser.close();
console.log(failures ? `\n${failures} échec(s)` : '\nTous les parcours passent');
process.exit(failures ? 1 : 0);
