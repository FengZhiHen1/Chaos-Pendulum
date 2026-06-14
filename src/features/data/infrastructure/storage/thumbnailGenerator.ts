/**
 * 模块: data.infrastructure.storage.thumbnailGenerator
 * 职责: IThumbnailGenerator 的实现——从 3D Canvas 生成 64px 缩略图。
 * 依赖: Canvas 2D API
 */

import type { IThumbnailGenerator } from "../../contracts";
import { SnapshotInvalidError } from "../../contracts";
import { THUMBNAIL_SIZE } from "../../contracts";

/**
 * 缩略图生成器实现。
 *
 * 从 3D Canvas 生成指定尺寸的 PNG Data URL。
 */
class ThumbnailGeneratorImpl implements IThumbnailGenerator {
  /**
   * 生成缩略图。
   * @param canvas 已渲染的 3D Canvas
   * @param size 缩略图尺寸 (px)，默认 64
   * @returns base64 编码的 PNG Data URL
   * @throws SnapshotInvalidError — canvas 为 null 或尺寸无效
   */
  generate(canvas: HTMLCanvasElement, size: number = THUMBNAIL_SIZE): string {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new SnapshotInvalidError(
        "Canvas 为 null 或无效——无法生成缩略图",
        "ThumbnailGeneratorImpl.generate()",
        "canvas",
      );
    }
    if (!Number.isInteger(size) || size <= 0) {
      throw new SnapshotInvalidError(
        `缩略图尺寸无效: ${size}`,
        "ThumbnailGeneratorImpl.generate()",
        "thumbnailSize",
      );
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0, size, size);
    return offscreen.toDataURL("image/png");
  }
}

/** 全局单例缩略图生成器 */
export const thumbnailGenerator: IThumbnailGenerator = new ThumbnailGeneratorImpl();

/** @deprecated 使用 thumbnailGenerator.generate() 代替。保留用于向后兼容。 */
export function generateThumbnail(canvas: HTMLCanvasElement, size: number = THUMBNAIL_SIZE): string {
  return thumbnailGenerator.generate(canvas, size);
}
