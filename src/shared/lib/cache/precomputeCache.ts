import { openDB, getStore, putStore } from "./indexed-db";
import type { LyapunovGrid, PrecomputeCacheEntry } from "@/features/analyze/types";

const DB_NAME = "chaos-pendulum";
const DB_VERSION = 1;
const STORE_NAME = "precompute";
const MAX_ENTRIES = 10;

let dbInstance: IDBDatabase | null = null;
let dbAvailable = true;

async function getDB(): Promise<IDBDatabase | null> {
  if (dbInstance) return dbInstance;
  if (!dbAvailable) return null;

  try {
    const db = await openDB(DB_NAME, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    });
    dbInstance = db;
    return db;
  } catch (e) {
    dbAvailable = false;
    console.warn("[precomputeCache] IndexedDB 不可用，将跳过缓存", e);
    return null;
  }
}

export async function getPrecomputeData(
  type: string,
  gridHash: string,
): Promise<LyapunovGrid | null> {
  const db = await getDB();
  if (!db) return null;

  const key = `${type}-${gridHash}`;
  try {
    const entry = await getStore<PrecomputeCacheEntry>(db, STORE_NAME, key);
    if (!entry) return null;
    return entry.data;
  } catch (e) {
    console.warn("[precomputeCache] 读取缓存失败", e);
    return null;
  }
}

export async function setPrecomputeData(
  type: string,
  gridHash: string,
  data: LyapunovGrid,
): Promise<void> {
  const db = await getDB();
  if (!db) return;

  const key = `${type}-${gridHash}`;
  const serialized = JSON.stringify(data);
  const entry: PrecomputeCacheEntry = {
    key,
    data,
    cachedAt: Date.now(),
    size: new TextEncoder().encode(serialized).length,
  };

  try {
    await putStore(db, STORE_NAME, entry);
    await evictLRU();
  } catch (e) {
    if (e instanceof Error && e.name === "QuotaExceededError") {
      console.warn("[precomputeCache] 存储配额已满，跳过写入");
    } else {
      console.warn("[precomputeCache] 写入缓存失败", e);
    }
  }
}

async function evictLRU(): Promise<void> {
  const db = await getDB();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const entries: PrecomputeCacheEntry[] = req.result;
      if (entries.length <= MAX_ENTRIES) {
        resolve();
        return;
      }

      // 按 cachedAt 升序，淘汰最旧的
      entries.sort((a, b) => a.cachedAt - b.cachedAt);
      const toDelete = entries.slice(0, entries.length - MAX_ENTRIES);

      const delTx = db.transaction(STORE_NAME, "readwrite");
      const delStore = delTx.objectStore(STORE_NAME);
      for (const entry of toDelete) {
        delStore.delete(entry.key);
      }

      delTx.oncomplete = () => resolve();
      delTx.onerror = () => reject(delTx.error);
    };

    req.onerror = () => reject(req.error);
  });
}
