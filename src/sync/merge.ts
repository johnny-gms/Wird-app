import type { SyncRecord } from './records';

/**
 * Règle de conflit : pour une même clé, la modification la plus récente (HLC) l'emporte, suppression comprise.
 * Cette fonction est commutative, associative et idempotente : l'ordre dans lequel les appareils se synchronisent
 * n'a aucune importance et le résultat final est identique partout (convergence).
 * Les évaluations (historique) sont des enregistrements distincts, uniques par identifiant : elles ne se perdent jamais,
 * même si l'état d'un verset modifié sur deux appareils est tranché par « dernier modifié ».
 */
export function winner(a: SyncRecord | undefined, b: SyncRecord | undefined): SyncRecord | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.hlc >= b.hlc ? a : b;
}

export function mergeRecordSets(a: Map<string, SyncRecord>, b: Map<string, SyncRecord>): Map<string, SyncRecord> {
  const out = new Map(a);
  for (const [k, r] of b) out.set(k, winner(out.get(k), r)!);
  return out;
}

/** Enregistrements distants à appliquer localement (strictement plus récents que la version locale connue). */
export function toApply(remote: SyncRecord[], localHlc: (key: string) => string | undefined): SyncRecord[] {
  return remote.filter((r) => {
    const l = localHlc(r.key);
    return !l || r.hlc > l;
  });
}

/** Nombre de conflits réels : même clé modifiée des deux côtés depuis la dernière synchronisation (valeurs différentes). */
export function countConflicts(local: SyncRecord[], remote: SyncRecord[]): number {
  const m = new Map(remote.map((r) => [r.key, r]));
  return local.filter((l) => {
    const r = m.get(l.key);
    return r && r.hlc !== l.hlc && JSON.stringify(r.value) !== JSON.stringify(l.value);
  }).length;
}
