/**
 * 模块: data.infrastructure.repositories.snapshotDb
 * 职责: ISnapshotRepository 的 IndexedDB 实现——完整 Snapshot 实体的持久化，
 *       含 LRU 驱逐策略、事务管理和错误恢复。
 * 依赖: shared/infrastructure/storage/indexed-db (openDB/putStore/getStore)
 */

import { openDB, getStore } from "@/shared/infrastructure/storage/indexed-db";
import type { ISnapshotRepository } from "../../contracts";
import type { Snapshot, SnapshotID, SnapshotMeta } from "../../contracts";
import {
  SnapshotNotFoundError,
  StorageError,
} from "../../contracts";
import {
  SNAPSHOT_DB_NAME,
  SNAPSHOT_DB_VERSION,
  SNAPSHOT_STORE_NAME,
  SNAPSHOT_MAX_COUNT,
} from "../../contracts";

// ─── 数据库升级函数 ─────────────────────────────────

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
    db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: "id" });
  }
}

// ─── 数据库连接管理（惰性单次连接） ────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION, upgrade);
  }
  return dbPromise;
}

/** 关闭数据库连接（用于测试/页面卸载） */
export function closeSnapshotDb(): void {
  dbPromise = null;
}

// ─── ISnapshotRepository 实现 ──────────────────────

/**
 * 快照持久化仓储的 IndexedDB 实现。
 *
 * 提供完整的 CRUD + LRU 驱逐 + 数量查询。
 */
class SnapshotRepositoryImpl implements ISnapshotRepository {
  /** 保存快照。通过 IndexedDB 事务保证 count 检查 + LRU 驱逐 + 写入原子性。 */
  async save(snapshot: Snapshot): Promise<void> {
    const db = await getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, "readwrite");
      const store = tx.objectStore(SNAPSHOT_STORE_NAME);

      // 在事务内原子执行：count → LRU 驱逐 → 写入
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const all = getAllReq.result as Snapshot[];
        if (all.length >= SNAPSHOT_MAX_COUNT) {
          // LRU: 按时间戳升序，删除最旧的
          all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          const oldest = all[0];
          if (oldest) {
            store.delete(oldest.id as string);
          }
        }
        store.put(snapshot);
      };
      getAllReq.onerror = () => {
        reject(new StorageError(
          `保存快照失败: ${snapshot.id}`,
          "SnapshotRepositoryImpl.save()",
          "put",
          SNAPSHOT_DB_NAME,
        ));
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new StorageError(
        `保存快照事务失败: ${snapshot.id}`,
        "SnapshotRepositoryImpl.save()",
        "put",
        SNAPSHOT_DB_NAME,
      ));
    });
  }

  /** 加载完整快照。若不存在则抛 SnapshotNotFoundError。 */
  async load(id: SnapshotID): Promise<Snapshot> {
    const db = await getDb();
    const snapshot = await getStore<Snapshot>(db, SNAPSHOT_STORE_NAME, id as string);
    if (!snapshot) {
      throw new SnapshotNotFoundError(
        `快照不存在: ${id}`,
        "SnapshotRepositoryImpl.load()",
        id as string,
      );
    }
    return snapshot;
  }

  /** 列出所有快照元数据（轻量视图），按时间戳降序排列。 */
  async list(): Promise<SnapshotMeta[]> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, "readonly");
      const req = tx.objectStore(SNAPSHOT_STORE_NAME).getAll();
      req.onsuccess = () => {
        const snapshots = req.result as Snapshot[];
        // 按时间戳降序排列
        snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const metas: SnapshotMeta[] = snapshots.map((s) => ({
          id: s.id as string,
          timestamp: s.timestamp,
          label: s.label,
          thumbnail: s.thumbnail,
          simTime: s.simTime,
          mode: s.mode,
        }));
        resolve(metas);
      };
      req.onerror = () => {
        reject(new StorageError(
          "列出快照失败",
          "SnapshotRepositoryImpl.list()",
          "getAll",
          SNAPSHOT_DB_NAME,
        ));
      };
    });
  }

  /** 删除指定快照。 */
  async delete(id: SnapshotID): Promise<void> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, "readwrite");
      const req = tx.objectStore(SNAPSHOT_STORE_NAME).delete(id as string);
      req.onsuccess = () => resolve();
      req.onerror = () => {
        reject(new StorageError(
          `删除快照失败: ${id}`,
          "SnapshotRepositoryImpl.delete()",
          "delete",
          SNAPSHOT_DB_NAME,
        ));
      };
    });
  }

  /** 当前存储数量。 */
  async count(): Promise<number> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, "readonly");
      const req = tx.objectStore(SNAPSHOT_STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        reject(new StorageError(
          "查询快照数量失败",
          "SnapshotRepositoryImpl.count()",
          "count",
          SNAPSHOT_DB_NAME,
        ));
      };
    });
  }

  /** 是否已达存储上限。 */
  async isFull(): Promise<boolean> {
    const c = await this.count();
    return c >= SNAPSHOT_MAX_COUNT;
  }

}

/** 全局单例仓储实例 */
export const snapshotRepository: ISnapshotRepository = new SnapshotRepositoryImpl();
