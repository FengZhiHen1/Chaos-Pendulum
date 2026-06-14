/**
 * 模块: analyze.viewModel.hooks.useBifurcationData
 * 职责: 封装 BifurcationPlot 的数据加载与领域校验逻辑。
 * 边界:
 *   - 基于 SYS-03 usePrecomputeData 的 React 状态封装
 *   - 返回加载状态、数据、错误信息与重试函数
 */

import { useEffect, useMemo, useState } from "react";
import { usePrecomputeData } from "@/features/analyze/viewModel/hooks/usePrecomputeData";
import type { BifurcationData } from "../../types";

export interface BifurcationDataState {
  data: BifurcationData | null;
  loadStatus: "idle" | "loading" | "ready" | "error";
  loadError: string | null;
  precomputeErrorCode: string | null;
  retry: () => void;
}

export function useBifurcationData(dataPath: string): BifurcationDataState {
  const dataType = "bifurcation";
  const gridHash = (dataPath.match(/-([a-f0-9]+)\.json$/) ?? [])[1] ?? "";

  const precomputeState = usePrecomputeData<BifurcationData>({
    dataType,
    dataUrl: dataPath,
    expectedGridHash: gridHash,
    expectedType: dataType,
  });

  const domainValid = useMemo(() => {
    if (!precomputeState.data) return null;
    const { scannedParam } = precomputeState.data.metadata;
    return scannedParam.max > scannedParam.min ? precomputeState.data : null;
  }, [precomputeState.data]);

  const [data, setData] = useState<BifurcationData | null>(null);
  const [loadStatus, setLoadStatus] = useState<BifurcationDataState["loadStatus"]>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (precomputeState.status === "loading") {
      setLoadStatus("loading");
      setLoadError(null);
    } else if (precomputeState.status === "ready" && domainValid) {
      setData(domainValid);
      setLoadStatus("ready");
    } else if (precomputeState.status === "ready" && !domainValid) {
      setLoadError("扫描范围无效");
      setLoadStatus("error");
    } else if (precomputeState.status === "error") {
      setLoadError(precomputeState.errorMessage ?? "未知错误");
      setLoadStatus("error");
    }
  }, [precomputeState, domainValid]);

  return {
    data,
    loadStatus,
    loadError,
    precomputeErrorCode: precomputeState.errorCode,
    retry: precomputeState.retry,
  };
}
