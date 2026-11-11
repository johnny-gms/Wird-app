/** Dates « jour calendaire local » au format AAAA-MM-JJ. */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Nombre de jours (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);
}

/** Lundi de la semaine contenant `key`. */
export function startOfWeek(key: string): string {
  const d = parseKey(key);
  const dow = (d.getDay() + 6) % 7; // lundi = 0
  return addDays(key, -dow);
}

export function startOfMonth(key: string): string {
  return key.slice(0, 8) + '01';
}

export function endOfMonth(key: string): string {
  const d = parseKey(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}
