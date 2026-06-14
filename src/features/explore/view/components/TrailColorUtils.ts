/** TrailRenderer 颜色工具函数 —— 纯函数，无 React 依赖 */

export interface VelocityColorStop { position: number; color: string; }

export const DEFAULT_COLOR_STOPS: VelocityColorStop[] = [
  { position: 0.0, color: "#3B82F6" },
  { position: 1.0, color: "#EF4444" },
];

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0.5, g: 0.5, b: 0.5 };
  return { r: parseInt(result[1]!, 16) / 255, g: parseInt(result[2]!, 16) / 255, b: parseInt(result[3]!, 16) / 255 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return { r: hue2rgb(p, q, h + 1/3), g: hue2rgb(p, q, h), b: hue2rgb(p, q, h - 1/3) };
}

function lerpColorHsl(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }, t: number): { r: number; g: number; b: number } {
  const hsl1 = rgbToHsl(c1.r, c1.g, c1.b), hsl2 = rgbToHsl(c2.r, c2.g, c2.b);
  let dh = hsl2.h - hsl1.h; if (dh > 0.5) dh -= 1; if (dh < -0.5) dh += 1;
  return hslToRgb((hsl1.h + dh * t + 1) % 1, hsl1.s + (hsl2.s - hsl1.s) * t, hsl1.l + (hsl2.l - hsl1.l) * t);
}

export function velocityToColor(velocity: number, gradient: VelocityColorStop[], maxVelocityRef: { current: number }): { r: number; g: number; b: number } {
  if (isNaN(velocity)) return { r: 0.5, g: 0.5, b: 0.5 };
  if (velocity > maxVelocityRef.current) maxVelocityRef.current = velocity;
  const t = Math.max(0, Math.min(1, velocity / maxVelocityRef.current));
  for (let i = 0; i < gradient.length - 1; i++) {
    const s1 = gradient[i]!, s2 = gradient[i + 1]!;
    if (t >= s1.position && t <= s2.position) return lerpColorHsl(hexToRgb(s1.color), hexToRgb(s2.color), (t - s1.position) / (s2.position - s1.position));
  }
  return hexToRgb(gradient[gradient.length - 1]!.color);
}
