/** Petit wrapper IndexedDB (clé/valeur). Toutes les données utilisateur restent sur l'appareil. */
const DB_NAME = 'wird';
const STORE = 'kv';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const kvGetAll = async (): Promise<Record<string, unknown>> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out: Record<string, unknown> = {};
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        out[String(c.key)] = c.value;
        c.continue();
      } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
};

export const kvGet = <T>(key: string) => tx<T>('readonly', (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => tx('readwrite', (s) => void s.put(value, key));
export const kvSetMany = (entries: [string, unknown][]) =>
  tx('readwrite', (s) => {
    for (const [k, v] of entries) s.put(v, k);
  });
export const kvClear = () => tx('readwrite', (s) => void s.clear());

/** Demande au navigateur de ne pas purger les données (utile surtout sur Safari/iOS). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
