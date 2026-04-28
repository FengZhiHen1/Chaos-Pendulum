export function exportPNG(canvas: HTMLCanvasElement, filename: string, resolution = 1): void {
  const out = document.createElement("canvas");
  out.width = canvas.width * resolution;
  out.height = canvas.height * resolution;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);

  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
