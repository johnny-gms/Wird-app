/** Astuces d'utilisation montrées une seule fois (animation du doigt) : on mémorise celles qui ont été vues. */
const KEY = 'wird-tips-seen';
const read = (): string[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { return []; }
};
export const tipSeen = (id: string): boolean => read().includes(id);
export function markTipSeen(id: string): void {
  try { localStorage.setItem(KEY, JSON.stringify([...new Set([...read(), id])])); } catch { /* stockage indisponible : l'astuce reviendra, sans gravité */ }
}
export function resetTips(): void {
  try { localStorage.removeItem(KEY); } catch { /* rien à faire */ }
}
