export function generateThumbnail(canvas: HTMLCanvasElement, size = 64): string {
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const ctx = offscreen.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, size, size);
  return offscreen.toDataURL("image/png");
}
