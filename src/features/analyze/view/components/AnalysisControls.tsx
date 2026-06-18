/**
 * 模块: analyze.view.components.AnalysisControls
 * 职责: 分析模式左侧控制面板——严格对齐 Stitch 设计稿：
 *       面板标题、当前视图卡、图层切换、阻尼切片、图例、固定参数、状态 Footer。
 * 边界:
 *   - 纯展示组件，通过 Props 接收数据与回调
 *   - 不直接调用 API 或操作 store
 */

import { SlidersHorizontal, LayoutGrid, CheckCircle2, Eye, EyeOff } from "lucide-react";
import type { AnalysisView } from "../../viewModel/stores/analyzeSlice";
import type { LyapunovLayerType, LoadStatus } from "../../types";
import { SEMANTIC_GRADIENT } from "./colorTokens";
import type { EnergyLandscapeOverrides } from "./EnergyLandscape";

interface AnalysisControlsProps {
  activeView: AnalysisView;
  activeLayer: LyapunovLayerType;
  onLayerChange: (layer: LyapunovLayerType) => void;
  availableLayers: Set<LyapunovLayerType>;
  dampingSlices: Array<{ value: number; file: string; gridHash?: string }>;
  activeDamping: number;
  onDampingChange: (value: number) => void;
  loadStatus: LoadStatus;
  layerCacheStatus: Record<LyapunovLayerType, LoadStatus>;
  /** 能量景观覆盖参数 */
  landscapeOverrides?: EnergyLandscapeOverrides;
  onLandscapeOverridesChange?: (overrides: EnergyLandscapeOverrides) => void;
}

const LAYER_OPTIONS: Array<{ value: LyapunovLayerType; label: string }> = [
  { value: "lyapunov_max", label: "Max Lyapunov" },
  { value: "lyapunov_min", label: "Min Lyapunov" },
  { value: "energy_curvature", label: "Curvature" },
];

const VIEW_LABELS: Record<AnalysisView, string> = {
  lyapunov: "Lyapunov 指数热力图",
  bifurcation: "参数空间分岔图",
  poincare: "庞加莱截面",
  "energy-landscape": "能量景观地形图",
};

const FIXED_PARAMS = [
  { key: "m₁ (Mass 1)", value: "1.0 kg" },
  { key: "m₂ (Mass 2)", value: "1.0 kg" },
  { key: "g (Gravity)", value: "9.81 m/s²" },
  { key: "L (Length)", value: "0.5 m" },
] as const;

function statusDot(status: LoadStatus): string {
  switch (status) {
    case "ready":
      return "bg-lyapunov-neutral";
    case "loading":
      return "bg-primary";
    case "error":
      return "bg-separation-alert";
    default:
      return "bg-on-surface-variant/30";
  }
}

function statusText(status: LoadStatus): string {
  switch (status) {
    case "ready":
      return "数据就绪 (ANL-01)";
    case "loading":
      return "数据加载中…";
    case "error":
      return "数据错误";
    default:
      return "待机 (ANL-01)";
  }
}

export function AnalysisControls({
  activeView,
  activeLayer,
  onLayerChange,
  availableLayers,
  dampingSlices,
  activeDamping,
  onDampingChange,
  loadStatus,
  landscapeOverrides,
  onLandscapeOverridesChange,
}: AnalysisControlsProps) {
  const showLayerControls = activeView === "lyapunov";
  const showDamping = showLayerControls && dampingSlices.length > 1;
  const showLandscapeControls = activeView === "energy-landscape";

  const dampingMin = dampingSlices[0]?.value ?? 0;
  const dampingMax = dampingSlices[dampingSlices.length - 1]?.value ?? 0;
  const activeIndex = Math.max(
    0,
    dampingSlices.findIndex((s) => s.value === activeDamping),
  );

  return (
    <div className="flex flex-col h-full p-5 gap-6">
      {/* Panel Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
          <SlidersHorizontal className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-label-md font-bold text-on-surface">控制面板</h2>
          <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">
            Control Panel
          </span>
        </div>
      </div>

      {/* Current View Card */}
      <div className="bg-surface-container rounded-lg p-3">
        <span className="text-label-md text-on-surface-variant block mb-1">当前视图</span>
        <div className="flex items-center justify-between">
          <span className="text-body-md text-on-surface font-medium">{VIEW_LABELS[activeView]}</span>
          <LayoutGrid className="w-4 h-4 text-primary" />
        </div>
      </div>

      {/* Layer Selector */}
      {showLayerControls && (
        <div className="flex flex-col gap-2">
          <span className="text-label-md text-on-surface-variant">分析图层</span>
          <div className="flex flex-col gap-1">
            {LAYER_OPTIONS.map((layer) => {
              const isActive = activeLayer === layer.value;
              const isDisabled = !availableLayers.has(layer.value);
              return (
                <button
                  key={layer.value}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onLayerChange(layer.value)}
                  className={`
                    flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium
                    transition-all duration-quick
                    ${isActive
                      ? "bg-primary text-on-primary shadow-sm cursor-default"
                      : "text-on-surface hover:bg-surface-container cursor-pointer"
                    }
                    ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}
                  `}
                >
                  <span>{layer.label}</span>
                  {isActive && <CheckCircle2 className="w-4 h-4" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Damping Slider */}
      {showDamping && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-end">
            <span className="text-label-md text-on-surface-variant">阻尼切片 (Damping)</span>
            <span className="font-mono text-xs text-primary font-medium">
              {activeDamping.toFixed(3)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={dampingSlices.length - 1}
            step={1}
            value={activeIndex}
            onChange={(e) => {
              const idx = parseInt(e.target.value, 10);
              const slice = dampingSlices[idx];
              if (slice) onDampingChange(slice.value);
            }}
            className="w-full h-1 bg-surface-container-high rounded-full appearance-none outline-none accent-primary cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer
              [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-on-surface-variant/60">
            <span>{dampingMin.toFixed(2)}</span>
            <span>{dampingMax.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* ── Energy Landscape Controls ── */}
      {showLandscapeControls && landscapeOverrides && onLandscapeOverridesChange && (
        <div className="flex flex-col gap-4">
          <span className="text-label-md text-on-surface-variant">曲面设置</span>

          {/* 透明度滑块 */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-end">
              <span className="text-[11px] text-on-surface-variant/70">透明度</span>
              <span className="font-mono text-xs text-primary font-medium">
                {(landscapeOverrides.opacity ?? 0.6).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.25}
              max={1}
              step={0.05}
              value={landscapeOverrides.opacity ?? 0.6}
              onChange={(e) => onLandscapeOverridesChange({
                ...landscapeOverrides,
                opacity: parseFloat(e.target.value),
              })}
              className="w-full h-1 bg-surface-container-high rounded-full appearance-none outline-none accent-primary cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer"
            />
          </div>

          {/* 等高线 / 实时光点 开关 */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onLandscapeOverridesChange({
                ...landscapeOverrides,
                showContours: !landscapeOverrides.showContours,
              })}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-quick
                ${landscapeOverrides.showContours !== false
                  ? "bg-primary/15 text-primary"
                  : "text-on-surface-variant hover:bg-surface-container"
                }`}
            >
              <span className="flex items-center gap-2">
                {landscapeOverrides.showContours !== false ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                等高线投影
              </span>
            </button>
            <button
              type="button"
              onClick={() => onLandscapeOverridesChange({
                ...landscapeOverrides,
                showCurrentPoint: !landscapeOverrides.showCurrentPoint,
              })}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-quick
                ${landscapeOverrides.showCurrentPoint !== false
                  ? "bg-primary/15 text-primary"
                  : "text-on-surface-variant hover:bg-surface-container"
                }`}
            >
              <span className="flex items-center gap-2">
                {landscapeOverrides.showCurrentPoint !== false ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                实时光点
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Color Legend */}
      {(showLayerControls || showLandscapeControls) && (
        <div className="flex flex-col gap-2">
          <span className="text-label-md text-on-surface-variant">图例 (Legend)</span>
          <div
            className="h-2 w-full rounded-full"
            style={{
              background: `linear-gradient(to right, ${SEMANTIC_GRADIENT.join(", ")})`,
            }}
          />
          <div className="flex justify-between text-[10px] text-on-surface-variant mt-1">
            <span>Stable</span>
            <span>Chaotic</span>
          </div>
        </div>
      )}

      {/* Fixed Params Grid */}
      <div className="flex flex-col gap-2">
        <span className="text-label-md text-on-surface-variant">边界条件 (Fixed Params)</span>
        <div className="grid grid-cols-2 gap-2">
          {FIXED_PARAMS.map(({ key, value }) => (
            <div key={key} className="bg-surface-container rounded p-2 flex flex-col">
              <span className="text-[10px] text-on-surface-variant/70 mb-1 font-mono">{key}</span>
              <span className="font-mono text-xs text-on-surface">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Status Footer */}
      <div className="mt-auto pt-5 flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full ${statusDot(loadStatus)} ${loadStatus === "loading" ? "animate-pulse" : ""}`} />
        <span className="text-label-md text-on-surface-variant">{statusText(loadStatus)}</span>
      </div>
    </div>
  );
}
