import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { IntegratorMethod } from "@/shared/types";
import { useSimulationStore } from "../store";

const METHOD_OPTIONS: {
  value: IntegratorMethod;
  label: string;
  description: string;
}[] = [
  { value: "RK4", label: "RK4（4 阶龙格-库塔）", description: "默认，精度与速度平衡" },
  { value: "VelocityVerlet", label: "Velocity Verlet", description: "辛积分器，长时间能量守恒佳" },
  { value: "Euler", label: "Euler（1 阶）", description: "教育用途，展示数值误差" },
];

export function MethodSelector() {
  const method = useSimulationStore((s) => s.method);
  const setMethod = useSimulationStore((s) => s.setMethod);

  return (
    <Select value={method} onValueChange={(v) => setMethod(v as IntegratorMethod)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {METHOD_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <div className="flex flex-col">
              <span className="text-xs">{opt.label}</span>
              <span className="text-[10px] text-lab-border">{opt.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
