import type { LearningGoal, PersistedState, PersonalGoal, Settings, TrashItem, VerseState } from '@/engine/types';
import type { HistoryEntry } from '@/engine/types';

/**
 * Enregistrement synchronisable : une clé stable, une valeur (ou une suppression) et l'horloge de sa dernière modification.
 * Synchronisé : versets, objectifs d'apprentissage et personnels, corbeille, réglages, prénom, position de rotation, historique.
 * Propre à chaque appareil (recalculé ou local) : programme du jour, séance en cours, journaux dérivés.
 */
export interface SyncRecord {
  key: string;
  hlc: string;
  del: boolean;
  value: unknown;
}

const SETTINGS: (keyof Settings)[] = ['learnDirection', 'learnMode', 'learnPagesPerWeek', 'reviewPagesPerDay', 'reinforceVersesPerDay', 'theme', 'haptics', 'notifications'];

type Slice = Pick<PersistedState, 'verses' | 'goals' | 'personalGoals' | 'trash' | 'settings' | 'profile' | 'rotation' | 'history'>;

/** Valeur courante d'un enregistrement dans l'état (undefined = absent). */
export function readRecord(s: Slice, key: string): unknown {
  const [k, id] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)];
  switch (k) {
    case 'v': return s.verses[Number(id)];
    case 'g': return s.goals.find((g) => g.id === id);
    case 'pg': return s.personalGoals.find((g) => g.id === id);
    case 't': return s.trash.find((t) => t.id === id);
    case 'h': return s.history.find((h) => h.id === id);
    case 's': return s.settings[id as keyof Settings];
    case 'p': return (s.profile as unknown as Record<string, unknown>)[id] ?? null;
    case 'r': return s.rotation;
    default: return undefined;
  }
}

/** Écrit (ou supprime) un enregistrement dans l'état, sans muter l'original. */
export function writeRecord<T extends Slice>(s: T, key: string, value: unknown, del: boolean): T {
  const k = key.split(':')[0];
  const id = key.slice(key.indexOf(':') + 1);
  const upsert = <X extends { id: string }>(list: X[]): X[] => {
    const rest = list.filter((x) => x.id !== id);
    return del ? rest : [...rest, value as X];
  };
  switch (k) {
    case 'v': {
      const verses: Record<number, VerseState> = { ...s.verses };
      if (del) delete verses[Number(id)];
      else verses[Number(id)] = value as VerseState;
      return { ...s, verses };
    }
    case 'g': return { ...s, goals: upsert<LearningGoal>(s.goals) };
    case 'pg': return { ...s, personalGoals: upsert<PersonalGoal>(s.personalGoals) };
    case 't': return { ...s, trash: upsert<TrashItem>(s.trash) };
    case 'h': {
      const rest = s.history.filter((h) => h.id !== id);
      return { ...s, history: del ? rest : [...rest, value as HistoryEntry].sort((a, b) => a.ts.localeCompare(b.ts)) };
    }
    case 's': return del ? s : { ...s, settings: { ...s.settings, [id]: value } };
    case 'p': return del ? s : { ...s, profile: { ...s.profile, [id]: value } };
    case 'r': return del ? s : { ...s, rotation: value as Slice['rotation'] };
    default: return s;
  }
}

/** Clés d'enregistrements présentes dans l'état (pour détecter créations / modifications / suppressions). */
export function listKeys(s: Slice): Set<string> {
  const out = new Set<string>();
  for (const id in s.verses) out.add('v:' + id);
  s.goals.forEach((g) => out.add('g:' + g.id));
  s.personalGoals.forEach((g) => out.add('pg:' + g.id));
  s.trash.forEach((t) => out.add('t:' + t.id));
  s.history.forEach((h) => out.add('h:' + h.id));
  SETTINGS.forEach((k) => out.add('s:' + k));
  out.add('p:name');
  out.add('p:age');
  out.add('p:gender');
  out.add('r');
  return out;
}

/** Différences entre deux états : clés créées/modifiées et clés supprimées. */
export function diffRecords(prev: Slice, next: Slice): { changed: string[]; deleted: string[] } {
  const a = listKeys(prev);
  const b = listKeys(next);
  const changed: string[] = [];
  const deleted: string[] = [];
  for (const k of b) {
    if (!a.has(k)) changed.push(k);
    else {
      const x = readRecord(prev, k);
      const y = readRecord(next, k);
      if (x !== y && JSON.stringify(x) !== JSON.stringify(y)) changed.push(k);
    }
  }
  for (const k of a) if (!b.has(k)) deleted.push(k);
  return { changed, deleted };
}
