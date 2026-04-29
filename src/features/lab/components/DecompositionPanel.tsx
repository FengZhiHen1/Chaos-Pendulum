import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/shared/components/ui/table";
import { useLabStore } from "@/features/lab/store";
import { useSimulationStore } from "@/features/simulation/store";
import { FORCE_STRIDE, ForceField } from "@/shared/types";

type CoordSys = "cartesian" | "polar" | "natural";

const COORD_OPTIONS: { value: CoordSys; label: string }[] = [
  { value: "cartesian", label: "笛卡尔 (Fx, Fy)" },
  { value: "polar", label: "极坐标 (|F|, θ)" },
  { value: "natural", label: "自然坐标 (Ft, Fn)" },
];

interface ForceRowData {
  name: string;
  magnitude: number;
  comp1: number;
  comp2: number;
  color: string;
}

const FORCE_NAMES = ["重力", "张力", "切向惯性力", "法向惯性力"];
const FORCE_COLORS = ["#27ae60", "#e74c3c", "#3498db", "#3498db"];

/** 读取力数据中的指定字段 */
function readForce(data: Float64Array, idx: 1 | 2, kind: "g" | "t" | "i_t" | "i_n"): number {
  if (idx === 1) {
    switch (kind) {
      case "g": return data[ForceField.FG1_MAG]!;
      case "t": return data[ForceField.T1_MAG]!;
      case "i_t": return data[ForceField.FI1_T_MAG]!;
      case "i_n": return data[ForceField.FI1_N_MAG]!;
    }
  } else {
    switch (kind) {
      case "g": return data[ForceField.FG2_MAG]!;
      case "t": return data[ForceField.T2_MAG]!;
      case "i_t": return data[ForceField.FI2_T_MAG]!;
      case "i_n": return data[ForceField.FI2_N_MAG]!;
    }
  }
}

/** 读取力角度 */
function readAngle(data: Float64Array, idx: 1 | 2, kind: "g" | "t" | "i_t" | "i_n"): number {
  if (idx === 1) {
    switch (kind) {
      case "g": return data[ForceField.FG1_ANGLE]!;
      case "t": return data[ForceField.T1_ANGLE]!;
      case "i_t": return data[ForceField.FI1_T_ANGLE]!;
      case "i_n": return data[ForceField.FI1_N_ANGLE]!;
    }
  } else {
    // 质量 2 力角度从 theta2 推导（Worker 不传输质量 2 的角度）
    const sim = useSimulationStore.getState();
    const t2 = sim.theta2;
    const a2 = sim.alpha2;
    switch (kind) {
      case "g": return -Math.PI / 2;
      case "t": return t2 + Math.PI;
      case "i_t": return t2 + Math.sign(a2 || 1) * Math.PI / 2;
      case "i_n": return t2 + Math.PI;
    }
  }
}

function decompose(magnitude: number, angle: number, sys: CoordSys, theta: number): { c1: number; c2: number } {
  switch (sys) {
    case "cartesian": {
      return { c1: magnitude * Math.cos(angle), c2: magnitude * Math.sin(angle) };
    }
    case "polar": {
      return { c1: magnitude, c2: (angle * 180) / Math.PI };
    }
    case "natural": {
      const Fx = magnitude * Math.cos(angle);
      const Fy = magnitude * Math.sin(angle);
      const Ft = Fx * Math.cos(theta) + Fy * Math.sin(theta);
      const Fn = Fx * Math.sin(theta) - Fy * Math.cos(theta);
      return { c1: Ft, c2: Fn };
    }
  }
}

function MassTable({ massIdx, data, sys, theta }: { massIdx: 1 | 2; data: Float64Array; sys: CoordSys; theta: number }) {
  const rows: ForceRowData[] = useMemo(() => {
    const kinds: Array<"g" | "t" | "i_t" | "i_n"> = ["g", "t", "i_t", "i_n"];
    return kinds.map((kind, i) => {
      const mag = readForce(data, massIdx, kind);
      const angle = readAngle(data, massIdx, kind);
      const { c1, c2 } = decompose(mag, angle, sys, theta);
      return {
        name: FORCE_NAMES[i]!,
        magnitude: mag,
        comp1: c1,
        comp2: c2,
        color: FORCE_COLORS[i]!,
      };
    });
  }, [data, massIdx, sys, theta]);

  const colLabels = sys === "cartesian" ? ["Fx (N)", "Fy (N)"]
    : sys === "polar" ? ["|F| (N)", "θ (°)"]
    : ["Ft (N)", "Fn (N)"];

  return (
    <div className="mb-3">
      <h5 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
        {massIdx === 1 ? "上摆 m₁" : "下摆 m₂"}
      </h5>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">力</TableHead>
            <TableHead className="text-right w-16">大小 (N)</TableHead>
            <TableHead className="text-right">{colLabels[0]}</TableHead>
            <TableHead className="text-right">{colLabels[1]}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.name}>
              <TableCell>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                  {r.name}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.magnitude.toFixed(3)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.comp1.toFixed(2)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.comp2.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── 极值 Badge ──────────────────────────────

function ExtremaBadges() {
  const extrema = useLabStore((s) => s.forceDecomposition.extrema);
  if (!extrema) return null;

  const items = [
    { label: "杆 1 最大张力", data: extrema.T1_max, suffix: "" },
    { label: "杆 1 最小张力", data: extrema.T1_min, suffix: extrema.T1_min.value < 0.05 ? "（接近失重）" : "" },
    { label: "杆 2 最大张力", data: extrema.T2_max, suffix: "" },
    { label: "杆 2 最小张力", data: extrema.T2_min, suffix: extrema.T2_min.value < 0.05 ? "（接近失重）" : "" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((item) => (
        <Badge key={item.label} variant="outline" className="text-[10px] gap-1">
          <span className="text-on-surface-variant">{item.label}:</span>
          <span className="text-on-surface font-medium tabular-nums">
            {item.data.value.toFixed(2)} N
          </span>
          <span className="text-on-surface-variant">@ t={item.data.time.toFixed(1)}s</span>
          {item.suffix && (
            <span className="text-yellow-400">{item.suffix}</span>
          )}
        </Badge>
      ))}
    </div>
  );
}

// ─── 主面板 ──────────────────────────────────

export function DecompositionPanel() {
  const active = useLabStore((s) => s.forceDecomposition.active);
  const lastForceData = useLabStore((s) => s.forceDecomposition.lastForceData);
  const coordinateSystem = useLabStore((s) => s.coordinateSystem);
  const setCoordinateSystem = useLabStore((s) => s.setCoordinateSystem);
  const theta1 = useSimulationStore((s) => s.theta1);
  const theta2 = useSimulationStore((s) => s.theta2);
  const consumedFrameIndex = useSimulationStore((s) => s.consumedFrameIndex);

  if (!active) return null;

  const isLoading = !lastForceData;

  // 从力缓冲中提取当前帧的 Float64Array 视图（零拷贝）
  const currentFrameData = useMemo(() => {
    if (!lastForceData || lastForceData.length < FORCE_STRIDE) return null;
    const offset = consumedFrameIndex * FORCE_STRIDE;
    if (offset + FORCE_STRIDE > lastForceData.length) return null;
    return new Float64Array(lastForceData.buffer, lastForceData.byteOffset + offset * Float64Array.BYTES_PER_ELEMENT, FORCE_STRIDE);
  }, [lastForceData, consumedFrameIndex]);

  const hasData = currentFrameData !== null;

  return (
    <div className="w-80 shrink-0 border-l border-white/5 bg-surface-container-lowest/80 backdrop-blur flex flex-col h-full">
      {/* 页头 */}
      <div className="px-3 py-2.5 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-on-surface">受力拆解</h4>
          <Select
            value={coordinateSystem}
            onValueChange={(v) => setCoordinateSystem(v as CoordSys)}
          >
            <SelectTrigger className="h-6 text-[10px] w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COORD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[10px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 表格区 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : hasData ? (
          <>
            <MassTable massIdx={1} data={currentFrameData} sys={coordinateSystem} theta={theta1} />
            <MassTable massIdx={2} data={currentFrameData} sys={coordinateSystem} theta={theta2} />
            <ExtremaBadges />
          </>
        ) : (
          <p className="text-[11px] text-on-surface-variant py-4 text-center">
            力数据暂不可用
          </p>
        )}
      </div>
    </div>
  );
}
