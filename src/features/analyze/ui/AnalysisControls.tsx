import { BarChart3, Layers, Palette, SlidersHorizontal } from "lucide-react";

/**
 * 分析模式左侧控制面板 — 占位组件。
 *
 * 设计文档要求:
 * - 参数轴选择 (X 轴 / Y 轴下拉)
 * - 图层切换 (RadioGroup: λ_max / λ_min / 能量曲率)
 * - 固定参数只读显示
 * - 色阶图例 (垂直色条)
 *
 * 风格：Dark Room，卡片用 tonal shift 区分，无实线边框
 */
export function AnalysisControls() {
  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* 参数轴选择 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-on-surface-variant/60" />
          <h4 className="text-xs font-semibold text-on-surface">参数轴选择</h4>
        </div>
        <div className="space-y-2">
          <div className="space-y-1">
            <span className="text-[10px] text-on-surface-variant/60">X 轴参数</span>
            <div className="h-8 rounded-lg bg-surface-container border border-white/5 flex items-center px-3 text-xs text-on-surface/70">
              L₂/L₁ 长度比
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-on-surface-variant/60">Y 轴参数</span>
            <div className="h-8 rounded-lg bg-surface-container border border-white/5 flex items-center px-3 text-xs text-on-surface/70">
              θ₁ 初始角度
            </div>
          </div>
        </div>
      </div>

      {/* 图层切换 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-on-surface-variant/60" />
          <h4 className="text-xs font-semibold text-on-surface">图层切换</h4>
        </div>
        <div className="space-y-2">
          {[
            { label: "最大 Lyapunov 指数", active: true },
            { label: "最小 Lyapunov 指数", active: false },
            { label: "能量曲面曲率", active: false },
          ].map((layer) => (
            <label
              key={layer.label}
              className="flex items-center gap-2.5 text-xs text-on-surface-variant/70 cursor-pointer hover:text-on-surface/80 transition-colors duration-200 py-1"
            >
              <div className={`
                h-3.5 w-3.5 rounded-full border flex items-center justify-center transition-all duration-200
                ${layer.active ? "border-primary" : "border-white/10"}
              `}>
                {layer.active && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
              {layer.label}
            </label>
          ))}
        </div>
      </div>

      {/* 色阶图例 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-3.5 h-3.5 text-on-surface-variant/60" />
          <h4 className="text-xs font-semibold text-on-surface">色阶图例</h4>
        </div>
        <div className="space-y-2">
          <div
            className="w-full h-3 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, #1E3A5F, #2DD4BF, #F97316)",
            }}
          />
          <div className="flex justify-between text-[10px] text-on-surface-variant/50">
            <span>λ &lt; 0 (稳定)</span>
            <span>λ ≈ 0</span>
            <span>λ &gt; 0 (混沌)</span>
          </div>
        </div>
      </div>

      {/* 固定参数 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-on-surface-variant/60" />
          <h4 className="text-xs font-semibold text-on-surface">固定参数</h4>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs p-3 rounded-lg bg-surface-container-low border border-white/5">
          {[
            ["m₁", "1.0 kg"],
            ["m₂", "1.0 kg"],
            ["g", "9.81 m/s²"],
            ["阻尼", "扫描轴"],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between">
              <span className="text-on-surface-variant/50">{label}</span>
              <span className="font-mono text-on-surface/80">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-on-surface-variant/40 text-center mt-auto pt-4">
        分析控制面板 — 参数联动开发中
      </p>
    </div>
  );
}
