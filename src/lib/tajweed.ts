/** Annotations de tajwid (positions sur le texte Tanzil, voir scripts/build-tajweed.mjs). Chargées à la demande. */
export interface TajweedData {
  families: string[];
  spans: Record<string, number[]>;
}

let cache: TajweedData | null = null;
let pending: Promise<TajweedData | null> | null = null;

export function loadTajweed(): Promise<TajweedData | null> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/data/tajweed.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: TajweedData) => (cache = j))
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}

/** Découpe un verset en morceaux [texte, famille | null]. Le texte n'est jamais modifié : seuls des morceaux sont créés. */
export function tajweedParts(text: string, spans: number[] | undefined, families: string[]): [string, string | null][] {
  if (!spans?.length) return [[text, null]];
  const cp = [...text];
  const out: [string, string | null][] = [];
  let at = 0;
  for (let i = 0; i < spans.length; i += 3) {
    const [s, e, f] = [spans[i], spans[i + 1], spans[i + 2]];
    if (s > at) out.push([cp.slice(at, s).join(''), null]);
    out.push([cp.slice(s, e).join(''), families[f]]);
    at = e;
  }
  if (at < cp.length) out.push([cp.slice(at).join(''), null]);
  return out;
}

export const TAJWEED_LEGEND: { family: string; label: string }[] = [
  { family: 'madd-6', label: 'Madd 4 à 6' },
  { family: 'madd-jaiz', label: 'Madd 2, 4 ou 6' },
  { family: 'madd-2', label: 'Madd 2' },
  { family: 'ghunna', label: 'Ghunna, ikhfa' },
  { family: 'silent', label: 'Non prononcé' },
  { family: 'qalqala', label: 'Qalqala' },
  { family: 'tafkhim', label: 'Tafkhim' },
];
