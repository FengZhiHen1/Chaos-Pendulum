import { openDB, getStore, putStore } from "@/shared/infrastructure/storage/indexed-db";
import {
  PYODIDE_CACHE_DB_NAME,
  PYODIDE_CACHE_DB_VERSION,
  PYODIDE_CACHE_STORE,
  PYODIDE_VERSION,
} from "@/features/simulation/types.boot";
import type { PyodideCacheEntry } from "@/features/simulation/types.boot";

function upgradePyodideCache(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(PYODIDE_CACHE_STORE)) {
    db.createObjectStore(PYODIDE_CACHE_STORE, { keyPath: "resourceKey" });
  }
}

async function getPyodideDB(): Promise<IDBDatabase> {
  return openDB(PYODIDE_CACHE_DB_NAME, PYODIDE_CACHE_DB_VERSION, upgradePyodideCache);
}

/**
 * 从 IndexedDB 读取 Pyodide 缓存条目。
 */
export async function getCachedPyodide(resourceKey: string): Promise<PyodideCacheEntry | undefined> {
  const db = await getPyodideDB();
  return getStore<PyodideCacheEntry>(db, PYODIDE_CACHE_STORE, resourceKey);
}

/**
 * 将 Pyodide 资源写入 IndexedDB 缓存（两阶段提交）。
 *
 * 阶段 1：写入临时键 `{resourceKey}-tmp`
 * 阶段 2：验证后重命名为正式键
 */
export async function cachePyodideResource(entry: PyodideCacheEntry): Promise<void> {
  const db = await getPyodideDB();
  const tmpKey = `${entry.resourceKey}-tmp`;

  // 阶段 1：写入临时键
  const tmpEntry: PyodideCacheEntry = { ...entry, resourceKey: tmpKey };
  await putStore(db, PYODIDE_CACHE_STORE, tmpEntry);

  // 阶段 2：验证 + 重命名（删除旧键 → 写入正式键 → 删除临时键）
  const verify = await getStore<PyodideCacheEntry>(db, PYODIDE_CACHE_STORE, tmpKey);
  if (!verify || verify.data.byteLength !== entry.size) {
    // 验证失败，清理临时键
    const tx = db.transaction(PYODIDE_CACHE_STORE, "readwrite");
    tx.objectStore(PYODIDE_CACHE_STORE).delete(tmpKey);
    throw new Error("Pyodide 缓存写入验证失败");
  }

  const tx = db.transaction(PYODIDE_CACHE_STORE, "readwrite");
  const store = tx.objectStore(PYODIDE_CACHE_STORE);
  store.delete(entry.resourceKey);
  store.put(entry);
  store.delete(tmpKey);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 检查是否存在上次中断留下的临时缓存键，若有则清理。
 */
export async function cleanupStalePyodideCache(): Promise<void> {
  const db = await getPyodideDB();
  const tx = db.transaction(PYODIDE_CACHE_STORE, "readwrite");
  const store = tx.objectStore(PYODIDE_CACHE_STORE);

  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const key of keys) {
    if (typeof key === "string" && key.endsWith("-tmp")) {
      store.delete(key);
    }
  }
}

/**
 * 验证缓存条目完整性。若损坏则删除并返回 false。
 */
export async function validatePyodideCache(entry: PyodideCacheEntry): Promise<boolean> {
  if (entry.data.byteLength !== entry.size) {
    const db = await getPyodideDB();
    const tx = db.transaction(PYODIDE_CACHE_STORE, "readwrite");
    tx.objectStore(PYODIDE_CACHE_STORE).delete(entry.resourceKey);
    return false;
  }
  return true;
}

/**
 * 流式下载 Pyodide 资源，支持进度回调。
 */
export async function downloadPyodideResource(
  url: string,
  onProgress: (downloaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("响应体不可读");
  }

  const contentLength = parseInt(response.headers.get("Content-Length") || "0", 10);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloaded += value.length;
    onProgress(downloaded, contentLength);
  }

  // 合并 chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

/**
 * 检查本地文件系统是否存在 Pyodide 资源。
 */
export async function checkLocalPyodideFile(path: string): Promise<boolean> {
  try {
    const response = await fetch(path, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 构建 Pyodide CDN URL。
 */
export function buildPyodideCdnUrl(filename: string): string {
  return `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/${filename}`;
}
