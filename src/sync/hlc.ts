/**
 * Horloge logique hybride (HLC) : ordonne les modifications de plusieurs appareils sans dépendre de la justesse de leur
 * horloge. Forme : « <ms sur 14 chiffres>.<compteur sur 4 chiffres>.<appareil> » — l'ordre alphabétique est l'ordre
 * chronologique, ce qui permet de la comparer comme une simple chaîne (aussi côté serveur, en SQL).
 */
export const parseHlc = (h: string): { ms: number; c: number; d: string } => {
  const [ms, c, ...d] = h.split('.');
  return { ms: Number(ms), c: Number(c), d: d.join('.') };
};
export const fmtHlc = (ms: number, c: number, d: string) => `${String(ms).padStart(14, '0')}.${String(c).padStart(4, '0')}.${d}`;

/** Prochaine valeur locale : toujours strictement supérieure à `prev` (même si l'horloge recule). */
export function tick(prev: string | null, nowMs: number, device: string): string {
  const p = prev ? parseHlc(prev) : { ms: 0, c: 0, d: '' };
  const ms = Math.max(nowMs, p.ms);
  const c = ms === p.ms ? p.c + 1 : 0;
  return fmtHlc(ms, c, device);
}

/** Intègre une valeur reçue : la prochaine valeur locale sera supérieure à celle-ci. */
export function observe(local: string | null, remote: string, nowMs: number, device: string): string {
  return tick(local && local > remote ? local : remote, nowMs, device);
}
