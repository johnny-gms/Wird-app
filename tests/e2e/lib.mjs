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
export async function onboard(page, { name = 'Test', juz = true, learnDir = 'forward', reviewPlus = 0, worked = true } = {}) {
  await page.goto(BASE);
  await intro(page);
  await page.getByPlaceholder('Ton prénom').fill(name || 'Test');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /Homme/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  if (juz) await page.getByRole('button', { name: /Juz/ }).click();
  await page.getByRole('button', { name: /Continuer|Je n’en connais/ }).click();
  if (learnDir === 'backward') await page.getByRole('radio', { name: /De la fin du Coran/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  for (let i = 0; i < reviewPlus; i++) await page.getByRole('button', { name: /Plus de pages à réviser/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /C’est parti/ }).click();
  await page.getByText('Ma progression').first().waitFor();
  if (worked) await markWorked(page);
}

/** Simule des versets déjà travaillés dans WIRD (les sourates simplement déclarées « déjà apprises » restent hors rotation). */
export async function markWorked(page) {
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('wird', 1); r.onsuccess = () => res(r.result); r.onerror = rej; });
    const verses = await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get('verses'); q.onsuccess = () => res(q.result); });
    for (const k in verses) verses[k] = { ...verses[k], declared: false };
    await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(verses, 'verses'); t.oncomplete = res; });
  });
  await page.reload();
  await page.getByText('Ma progression').first().waitFor();
  await page.getByRole('button', { name: 'Recalculer' }).click();
  await page.waitForTimeout(300);
}

/** Ouvre la séance, évalue chaque élément avec pick(i, textes), valide. */
/** Choix du mode de séance (écran « Comment veux-tu travailler ? ») : 'mushaf' ou 'phone'. */
export async function chooseMode(page, mode = 'mushaf') {
  await page.getByRole('radio', { name: mode === 'mushaf' ? /Avec mon Mushaf/ : /Avec mon téléphone/ }).click();
}

export async function runSession(page, pick) {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: /(Commencer|Reprendre) ma séance/ }).first().click();
  await page.getByText(/Comment veux-tu travailler|Travail des passages/).first().waitFor();
  if (await page.getByText('Comment veux-tu travailler ?').isVisible().catch(() => false)) await chooseMode(page, 'mushaf');
  await page.getByRole('heading', { name: 'Travail des passages' }).waitFor();
  const ranges = await page.locator('main ol > li button[aria-expanded]').allInnerTexts();
  await page.getByRole('button', { name: 'Terminer ma séance' }).click();
  const groups = page.getByRole('radiogroup');
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).getByRole('radio', { name: pick(i, ranges), exact: true }).click();
  await page.getByRole('button', { name: 'Valider le bilan' }).click();
  await page.waitForURL('**/session/bilan');
  await settle(page);
  return { ranges, n };
}
