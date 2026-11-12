import { createRequire } from 'node:module';
export const { chromium, devices } = createRequire(process.env.PW_REQUIRE ?? import.meta.url)('playwright');
export const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
export const OUT = process.env.SHOTS ?? '.scratch';
let failures = 0;
export const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
export const done = (extra = '') => { console.log(failures ? `\n${failures} échec(s) ${extra}` : '\nTous les contrôles passent'); process.exit(failures ? 1 : 0); };
export const settle = (page, ms = 250) => page.waitForTimeout(ms); // laisse l'écriture IndexedDB se terminer avant un rechargement

/** Parcours de premier lancement complet. */
export async function onboard(page, { name = '', juz = true, learnDir = 'forward', reviewDir = 'forward', reviewPlus = 0 } = {}) {
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'WIRD' }).waitFor();
  if (name) await page.getByPlaceholder(/salutation/).fill(name);
  await page.getByRole('button', { name: /^Commencer/ }).click();
  if (juz) await page.getByRole('button', { name: /Juz/ }).click();
  await page.getByRole('button', { name: /Continuer|Je n’en connais/ }).click();
  if (learnDir === 'backward') await page.getByRole('radio', { name: /De An-Nas vers Al-Fatiha/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  if (reviewDir === 'backward') await page.getByRole('radio', { name: /De An-Nas vers Al-Fatiha/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  for (let i = 0; i < reviewPlus; i++) await page.getByRole('button', { name: /Plus de pages à réviser/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /Commencer à utiliser/ }).click();
  await page.getByText('Programme du jour').first().waitFor();
}
