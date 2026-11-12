/** Texte de référence (Tanzil, uthmani). Chargé à la demande, précaché par le service worker pour le hors-ligne. */
export interface QuranData {
  s: string[][];
  bismillah: string;
  bismillahVariants: Record<string, string>;
}

let cache: QuranData | null = null;
let pending: Promise<QuranData | null> | null = null;

export function loadQuranText(): Promise<QuranData | null> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/data/quran-uthmani.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: QuranData) => (cache = j))
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}

/** La Basmala précède le verset 1 de chaque sourate, sauf Al-Fatiha (où elle est le verset 1) et At-Tawba (qui n'en a pas). */
export function basmalaFor(data: QuranData, surah: number): string | null {
  if (surah === 1 || surah === 9) return null;
  return data.bismillahVariants[String(surah)] ?? data.bismillah;
}
