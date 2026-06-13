import { openDB, putStore, getStore } from "@/shared/infrastructure/storage/indexed-db";

const DB_NAME = "chaos-pendulum-snapshots";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";

export interface Snapshot {
  id: string;
  timestamp: string;
  params: Record<string, number>;
  stateVector: number[];
  trail: number[];
  thumbnail: string;
  mode: string;
  label?: string;
}

function upgrade(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: "id" });
  }
}

export async function openSnapshotDB(): Promise<IDBDatabase> {
  return openDB(DB_NAME, DB_VERSION, upgrade);
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const db = await openSnapshotDB();
  return putStore(db, STORE_NAME, snapshot);
}

export async function loadSnapshot(id: string): Promise<Snapshot | undefined> {
  const db = await openSnapshotDB();
  return getStore<Snapshot>(db, STORE_NAME, id);
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const db = await openSnapshotDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
