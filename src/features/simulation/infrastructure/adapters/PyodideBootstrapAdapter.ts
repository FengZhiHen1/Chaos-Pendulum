import type { IPyodideBootstrap } from "../../contracts/boot-dependencies.contract";
import {
  cleanupStalePyodideCache,
  checkLocalPyodideFile,
  getCachedPyodide,
  validatePyodideCache,
  buildPyodideCdnUrl,
  downloadPyodideResource,
  cachePyodideResource,
} from "@/features/lab/infrastructure/pyodideCache";

export class PyodideBootstrapAdapter implements IPyodideBootstrap {
  cleanupStale(): Promise<void> {
    return cleanupStalePyodideCache();
  }
  checkLocalFile(path: string): Promise<boolean> {
    return checkLocalPyodideFile(path);
  }
  getCached(key: string) {
    return getCachedPyodide(key);
  }
  validateCache(entry: { data: ArrayBuffer; version: string }): Promise<boolean> {
    return validatePyodideCache(entry as Parameters<typeof validatePyodideCache>[0]);
  }
  buildCdnUrl(filename: string): string {
    return buildPyodideCdnUrl(filename);
  }
  download(
    url: string,
    onProgress: (downloaded: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    return downloadPyodideResource(url, onProgress, signal);
  }
  cache(entry: {
    resourceKey: string;
    data: ArrayBuffer;
    size: number;
    cachedAt: string;
    version: string;
    mimeType: string;
  }): Promise<void> {
    return cachePyodideResource(entry);
  }
}
