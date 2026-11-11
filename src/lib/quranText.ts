/** Texte de référence (uthmani). Chargé à la demande, précaché par le service worker pour le hors-ligne. */
let cache: string[][] | null = null;
let pending: Promise<string[][] | null> | null = null;

export function loadQuranText(): Promise<string[][] | null> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/data/quran-uthmani.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { s: string[][] }) => (cache = j.s))
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}
