import { createRequire } from 'node:module';
export const { chromium, devices } = createRequire(process.env.PW_REQUIRE ?? import.meta.url)('playwright');
export const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
export const OUT = process.env.SHOTS ?? '.scratch';
let failures = 0;
export const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
export const done = (extra = '') => { console.log(failures ? `\n${failures} échec(s) ${extra}` : '\nTous les contrôles passent'); process.exit(failures ? 1 : 0); };
export const settle = (page, ms = 300) => page.waitForTimeout(ms); // laisse l'écriture IndexedDB se terminer avant un rechargement

/** Présentation (3 écrans) puis « Continuer sans compte » → écran du prénom. */
export async function intro(page) {
  await page.getByText('garde-le.').waitFor();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByRole('button', { name: /^Commencer/ }).click();
  await page.getByRole('button', { name: 'Continuer sans compte' }).click();
}

/** Parcours de premier lancement complet. */
export async function onboard(page, { name = 'Test', juz = true, learnDir = 'forward', reviewPlus = 0 } = {}) {
  await page.goto(BASE);
  await intro(page);
  await page.getByPlaceholder('Ton prénom').fill(name || 'Test');
  await page.getByRole('button', { name: 'Continuer' }).click();
  if (juz) await page.getByRole('button', { name: /Juz/ }).click();
  await page.getByRole('button', { name: /Continuer|Je n’en connais/ }).click();
  if (learnDir === 'backward') await page.getByRole('radio', { name: /An-Nas → Al-Fatiha/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  for (let i = 0; i < reviewPlus; i++) await page.getByRole('button', { name: /Plus de pages à réviser/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /C’est parti/ }).click();
  await page.getByText('Ma progression').first().waitFor();
}

/** Ouvre la séance, évalue chaque élément avec pick(i, textes), valide. */
export async function runSession(page, pick) {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: /(Commencer|Reprendre) ma séance/ }).first().click();
  await page.getByRole('heading', { name: 'Séance du jour' }).waitFor();
  const ranges = await page.locator('main ol > li button[aria-expanded]').allInnerTexts();
  await page.getByRole('button', { name: 'Terminer la séance' }).click();
  const groups = page.getByRole('radiogroup');
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).getByRole('radio', { name: pick(i, ranges), exact: true }).click();
  await page.getByRole('button', { name: 'Valider le bilan' }).click();
  await page.waitForURL('**/session/bilan');
  await settle(page);
  return { ranges, n };
}
