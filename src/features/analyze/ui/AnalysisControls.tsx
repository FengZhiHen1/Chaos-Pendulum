import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

/**
 * 分析模式左侧控制面板 — 占位组件。
 *
 * 设计文档要求:
 * - 参数轴选择 (X 轴 / Y 轴下拉)
 * - 图层切换 (RadioGroup: λ_max / λ_min / 能量曲率)
 * - 固定参数只读显示
 * - 色阶图例 (垂直色条)
 */
export function AnalysisControls() {
  return (
    <div className="flex flex-col h-full bg-surface-container-low p-3 gap-3">
      <Card>
        <CardHeader className="px-3 pt-3 pb-1">
          <CardTitle className="text-xs">参数轴选择</CardTitle>
        </CardHeader>
        <CardContent className="px-3 py-2 space-y-2">
          <div className="space-y-1">
            <span className="text-[10px] text-on-surface-variant">X 轴参数</span>
            <div className="h-7 rounded-lg bg-surface-container border border-white/5 flex items-center px-2 text-xs text-on-surface-variant">
              L₂/L₁ 长度比
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-on-surface-variant">Y 轴参数</span>
            <div className="h-7 rounded-lg bg-surface-container border border-white/5 flex items-center px-2 text-xs text-on-surface-variant">
              θ₁ 初始角度
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-3 pt-3 pb-1">
          <CardTitle className="text-xs">图层切换</CardTitle>
        </CardHeader>
        <CardContent className="px-3 py-2 space-y-1.5">
          {["最大 Lyapunov 指数", "最小 Lyapunov 指数", "能量曲面曲率"].map(
            (layer) => (
              <label
                key={layer}
                className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer hover:text-on-surface transition-colors"
              >
                <div className="h-3.5 w-3.5 rounded-full border border-white/10 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-transparent" />
                </div>
                {layer}
              </label>
            ),
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-3 pt-3 pb-1">
          <CardTitle className="text-xs">色阶图例</CardTitle>
        </CardHeader>
        <CardContent className="px-3 py-2">
          <div
            className="w-full h-4 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, #1E3A5F, #2DD4BF, #F97316)",
            }}
          />
          <div className="flex justify-between text-[10px] text-on-surface-variant mt-1">
            <span>λ &lt; 0 (稳定)</span>
            <span>λ ≈ 0</span>
            <span>λ &gt; 0 (混沌)</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-3 pt-3 pb-1">
          <CardTitle className="text-xs">固定参数</CardTitle>
        </CardHeader>
        <CardContent className="px-3 py-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {[
              ["m₁", "1.0 kg"],
              ["m₂", "1.0 kg"],
              ["g", "9.81 m/s²"],
              ["阻尼", "0"],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-on-surface-variant">{label}</span>
                <span className="font-mono text-on-surface">{val}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-on-surface-variant/60 text-center mt-auto">
        分析控制面板 — 参数联动开发中
      </p>
    </div>
  );
}
