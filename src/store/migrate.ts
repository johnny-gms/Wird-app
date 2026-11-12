import { DEFAULT_SETTINGS } from '@/engine/config';
import type { PersistedState, Settings } from '@/engine/types';

/**
 * Remet à niveau des données persistées par une version antérieure (V1, V1.1) ou importées.
 * Aucune donnée de progression n'est perdue : versets, historique, objectifs et rotation sont conservés tels quels.
 *  - Réglages : objectifs en verses → objectifs en pages ; sens d'apprentissage ajouté (par défaut : même sens que la révision).
 *  - Séance : l'ancien format (validation sourate par sourate) est abandonné ; son travail déjà validé est dans l'historique.
 *  - Programme : l'état « en cours » n'existe plus (le travail est évalué en fin de séance).
 */
export function migrateSettings(old: Record<string, unknown> | undefined | null): Settings {
  const o = (old ?? {}) as Record<string, unknown> & Partial<Settings> & { reviewVersesPerDay?: number; learningEnabled?: boolean; learningChunk?: number };
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    // Le sens de révision n'existe plus : la rotation suit toujours les Hizb du 1er au 60e. L'ancien sens d'apprentissage est conservé.
    learnDirection: o.learnDirection ?? (o as { direction?: 'forward' | 'backward' }).direction ?? DEFAULT_SETTINGS.learnDirection,
    haptics: o.haptics ?? DEFAULT_SETTINGS.haptics,
    reinforceVersesPerDay: o.reinforceVersesPerDay ?? DEFAULT_SETTINGS.reinforceVersesPerDay,
    theme: o.theme ?? DEFAULT_SETTINGS.theme,
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(o.notifications ?? {}) },
    reviewPagesPerDay: o.reviewPagesPerDay ?? DEFAULT_SETTINGS.reviewPagesPerDay,
    learnPagesPerDay: o.learnPagesPerDay ?? DEFAULT_SETTINGS.learnPagesPerDay,
  };
  if (o.reviewPagesPerDay === undefined && typeof o.reviewVersesPerDay === 'number') {
    // ≈ 15 versets par page ; arrondi à la demi-page
    settings.reviewPagesPerDay = Math.max(0.5, Math.min(20, Math.round((o.reviewVersesPerDay / 15) * 2) / 2));
  }
  if (o.learnPagesPerDay === undefined && o.learningEnabled === false) settings.learnPagesPerDay = 0;
  return settings;
}

export function normalizeState(stored: Partial<PersistedState> & Record<string, unknown>, base: PersistedState): PersistedState {
  const merged = { ...base, ...stored } as PersistedState;
  merged.trash = Array.isArray(stored.trash) ? (stored.trash as PersistedState['trash']) : [];
  merged.lastValidation = (stored.lastValidation as PersistedState['lastValidation']) ?? null;
  merged.settings = migrateSettings(stored.settings as unknown as Record<string, unknown>);
  const sess = stored.session as unknown as { scope?: unknown } | null | undefined;
  if (sess && !('scope' in sess)) merged.session = null;
  if (merged.plan) {
    merged.plan = {
      ...merged.plan,
      items: merged.plan.items.map((i) => ((i.status as string) === 'in_progress' ? { ...i, status: 'pending' as const } : i)),
    };
  }
  return merged;
}
