import { createRequire } from 'node:module';
export const { chromium, devices } = createRequire(process.env.PW_REQUIRE ?? import.meta.url)('playwright');
export const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
export const OUT = process.env.SHOTS ?? '.scratch';
let failures = 0;
export const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
export const done = (extra = '') => { console.log(failures ? `\n${failures} échec(s) ${extra}` : '\nTous les contrôles passent'); process.exit(failures ? 1 : 0); };
export const settle = (page, ms = 400) => page.waitForTimeout(ms); // laisse l'écriture IndexedDB se terminer avant un rechargement

/** Présentation (3 écrans) puis « Continuer sans compte » → écran du prénom. */
export async function intro(page) {
  await page.getByText('garde-le.').waitFor();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByRole('button', { name: /^Commencer/ }).click();
  await page.getByRole('button', { name: 'Continuer sans compte' }).click();
}

/** Premier lancement complet : prénom, genre, sourates connues, niveaux d'apprentissage et de révision. */
export async function onboard(page, { name = 'Test', known = 'none', learn = /Intermédiaire/, review = /Intermédiaire/, dir = null } = {}) {
  await page.goto(BASE);
  await intro(page);
  await page.getByPlaceholder('Ton prénom').fill(name);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: 'Photo de profil 1' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  if (known === 'juz') { await page.getByRole('button', { name: /Juz/ }).click(); await page.getByRole('button', { name: 'Continuer' }).click(); }
  else await page.getByRole('button', { name: 'Je n’en connais pas encore' }).click();
  await page.getByRole('radio', { name: learn }).click();
  if (dir) await page.getByRole('radio', { name: dir }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: review }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /C’est parti/ }).click();
  await page.getByText('Ma progression').first().waitFor();
  await settle(page, 800);
}

/** Choix du mode de séance (« Comment veux-tu travailler ? ») : 'mushaf' ou 'phone'. */
export async function chooseMode(page, mode = 'mushaf') {
  await page.getByRole('radio', { name: mode === 'mushaf' ? /Avec mon Mushaf/ : /Avec mon téléphone/ }).click();
}

/** Évalue chaque passage de la séance avec `level`, valide le bilan. Renvoie le nombre de passages. */
export async function gradeAll(page, level = 'Maîtrisé') {
  await page.getByRole('button', { name: 'Terminer ma séance' }).first().click();
  const groups = page.getByRole('radiogroup');
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).getByRole('radio', { name: level, exact: true }).click();
  await page.getByRole('button', { name: 'Valider le bilan' }).click();
  await page.waitForURL('**/session/bilan');
  await settle(page);
  return n;
}
