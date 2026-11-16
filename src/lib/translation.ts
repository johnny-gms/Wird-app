/** Traduction française des versets (Hamidullah, source Tanzil). Chargée à la demande, précachée pour le hors-ligne. */
export interface TranslationData {
  s: string[][];
}

let cache: TranslationData | null = null;
let pending: Promise<TranslationData | null> | null = null;

export function loadTranslation(): Promise<TranslationData | null> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/data/translation-fr.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: TranslationData) => (cache = j))
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}
