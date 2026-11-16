import { observe, tick } from './hlc';
import { countConflicts, toApply } from './merge';
import { diffRecords, readRecord, writeRecord, type SyncRecord } from './records';
import type { PersistedState } from '@/engine/types';

export type SyncSlice = Pick<PersistedState, 'verses' | 'goals' | 'personalGoals' | 'trash' | 'settings' | 'profile' | 'rotation' | 'history'>;

export interface Transport {
  push(records: SyncRecord[]): Promise<void>;
  /** Enregistrements plus récents que `since` (comparaison de HLC) et nouveau curseur. */
  pull(since: string): Promise<{ records: SyncRecord[]; cursor: string }>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  applied: number;
  /** Modifications des deux côtés sur le même enregistrement : tranchées par « dernier modifié gagne ». */
  conflicts: number;
}

/**
 * Moteur de synchronisation (indépendant de l'interface et du réseau, donc testable) :
 *  1. `track` : repère ce qui change localement et l'horodate (HLC) ;
 *  2. `sync`  : envoie les modifications locales, récupère les distantes, applique les plus récentes ;
 *  3. aucune boucle d'écho : ce qui vient d'être reçu n'est jamais renvoyé comme modification locale.
 * Programme du jour, séance en cours et journaux dérivés restent propres à chaque appareil.
 */
export class SyncEngine {
  meta = new Map<string, string>(); // clé → HLC de la dernière modification connue
  tombstones = new Set<string>(); // clés supprimées (pour envoyer la suppression)
  dirty = new Set<string>();
  cursor = '';
  private clock: string | null = null;
  private remoteApplied = new Map<string, string>();
  private prev: SyncSlice | null = null;

  constructor(private device: string, private now: () => number = Date.now) {}

  private next(): string {
    this.clock = tick(this.clock, this.now(), this.device);
    return this.clock;
  }

  /** Première activation : toutes les données existantes sont marquées comme modifiées « maintenant ». */
  seed(s: SyncSlice): void {
    const d = diffRecords(emptyLike(s), s);
    for (const k of d.changed) this.stamp(k, false);
    this.prev = s;
  }

  private stamp(key: string, del: boolean) {
    this.meta.set(key, this.next());
    del ? this.tombstones.add(key) : this.tombstones.delete(key);
    this.dirty.add(key);
  }

  /** À appeler après chaque changement d'état. */
  track(next: SyncSlice): void {
    if (!this.prev) {
      this.prev = next;
      return;
    }
    const d = diffRecords(this.prev, next);
    for (const k of d.changed) {
      const r = this.remoteApplied.get(k);
      if (r) {
        this.meta.set(k, r);
        this.remoteApplied.delete(k);
      } else this.stamp(k, false);
    }
    for (const k of d.deleted) {
      const r = this.remoteApplied.get(k);
      if (r) {
        this.meta.set(k, r);
        this.tombstones.add(k);
        this.remoteApplied.delete(k);
      } else this.stamp(k, true);
    }
    this.prev = next;
  }

  private collect(s: SyncSlice): SyncRecord[] {
    const out: SyncRecord[] = [];
    for (const key of this.dirty) {
      const hlc = this.meta.get(key)!;
      const del = this.tombstones.has(key);
      out.push({ key, hlc, del, value: del ? null : (readRecord(s, key) ?? null) });
    }
    return out;
  }

  /** Synchronise. `getState` lit l'état courant ; `apply` reçoit un état et renvoie le nouvel état à installer. */
  async sync(transport: Transport, getState: () => SyncSlice, setState: (s: SyncSlice) => void): Promise<SyncResult> {
    const local = this.collect(getState());
    if (local.length) {
      await transport.push(local);
      for (const r of local) if (this.meta.get(r.key) === r.hlc) this.dirty.delete(r.key);
    }
    const { records, cursor } = await transport.pull(this.cursor);
    const todo = toApply(records, (k) => this.meta.get(k));
    const conflicts = countConflicts(local, records);
    let s = getState();
    for (const r of todo) {
      s = writeRecord(s, r.key, r.value, r.del);
      this.remoteApplied.set(r.key, r.hlc);
      this.clock = observe(this.clock, r.hlc, this.now(), this.device);
      this.dirty.delete(r.key);
    }
    if (todo.length) {
      setState(s);
      this.track(s); // enregistre les clés reçues sans les réémettre
    }
    if (cursor > this.cursor) this.cursor = cursor;
    return { pushed: local.length, pulled: records.length, applied: todo.length, conflicts };
  }
}

function emptyLike(s: SyncSlice): SyncSlice {
  return { ...s, verses: {}, goals: [], personalGoals: [], trash: [], history: [] };
}
