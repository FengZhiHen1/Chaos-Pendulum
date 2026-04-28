/**
 * 响应式断点阈值（单位：像素）。
 * 与 tailwind.config.ts 的 screens 配置严格同步。
 *
 * ⚠️ 修改此常量时，必须同步修改 tailwind.config.ts 的 screens 字段。
 */
export const BREAKPOINTS = {
  /** 桌面宽敞布局阈值（≥ 1920px）。完整三栏 + 全功能。 */
  DESKTOP_WIDE: 1920,
  /** 桌面紧凑布局阈值（≥ 1366px）。两栏 + 图表标签页切换。 */
  DESKTOP_COMPACT: 1366,
  /** 平板布局阈值（≥ 768px）。单栏 + 底部抽屉面板。 */
  TABLET: 768,
} as const;
