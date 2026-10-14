// Minimal async key-value interface over named stores. IndexedDB implements it for the
// app; an in-memory Map implements it for tests and for browsers where IndexedDB is blocked.

export type StoreName = 'sessions' | 'contours' | 'audio';
export const STORE_NAMES: StoreName[] = ['sessions', 'contours', 'audio'];

export interface KVBackend {
  /** False when data will not survive a reload (in-memory fallback). */
  readonly persistent: boolean;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
  clear(store: StoreName): Promise<void>;
}

export class MemoryBackend implements KVBackend {
  readonly persistent = false;
  private data = new Map<StoreName, Map<string, unknown>>();

  private store(name: StoreName): Map<string, unknown> {
    let s = this.data.get(name);
    if (!s) this.data.set(name, (s = new Map()));
    return s;
  }
  async get<T>(store: StoreName, key: string) {
    return this.store(store).get(key) as T | undefined;
  }
  async put(store: StoreName, key: string, value: unknown) {
    this.store(store).set(key, value);
  }
  async delete(store: StoreName, key: string) {
    this.store(store).delete(key);
  }
  async getAll<T>(store: StoreName) {
    return [...this.store(store).values()] as T[];
  }
  async clear(store: StoreName) {
    this.store(store).clear();
  }
}

const DB_NAME = 'seeyourvoice';
const DB_VERSION = 1;

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbBackend implements KVBackend {
  readonly persistent = true;
  private constructor(private readonly db: IDBDatabase) {}

  static open(): Promise<IndexedDbBackend> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        // Future schema changes: branch on event.oldVersion here. Never drop existing stores.
        for (const name of STORE_NAMES) {
          if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
        }
      };
      req.onsuccess = () => resolve(new IndexedDbBackend(req.result));
      req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
  }

  private tx(store: StoreName, mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(store, mode).objectStore(store);
  }
  get<T>(store: StoreName, key: string) {
    return wrap<T | undefined>(this.tx(store, 'readonly').get(key));
  }
  async put(store: StoreName, key: string, value: unknown) {
    await wrap(this.tx(store, 'readwrite').put(value, key));
  }
  async delete(store: StoreName, key: string) {
    await wrap(this.tx(store, 'readwrite').delete(key));
  }
  getAll<T>(store: StoreName) {
    return wrap<T[]>(this.tx(store, 'readonly').getAll());
  }
  async clear(store: StoreName) {
    await wrap(this.tx(store, 'readwrite').clear());
  }
}
