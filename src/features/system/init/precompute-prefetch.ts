/**
 * 后台预取预计算 JSON 数据（ANL-01/ANL-02）。
 * 非阻塞——不等待完成，不阻塞启动流程。
 * v2: 动态从 manifest 读取，自动覆盖阻尼切片。
 */

const MANIFEST_URL = "/assets/layer_manifest.json";

interface LayerManifest {
  lyapunov_max?: string;
  lyapunov_min?: string;
  energy_curvature?: string;
  bifurcation?: string;
  lyapunov_max_dampingSlices?: { file: string }[];
  lyapunov_min_dampingSlices?: { file: string }[];
  energy_curvature_dampingSlices?: { file: string }[];
}

/**
 * 在后台静默预取预计算数据。
 * 先从 manifest 获取完整文件列表（含阻尼切片），再逐个 prefetch。
 * 失败时静默忽略，由 ANL-01/ANL-02 在首次访问时自行加载。
 */
export async function prefetchPrecomputeData(): Promise<void> {
  try {
    const mResp = await fetch(MANIFEST_URL);
    if (!mResp.ok) return;
    const manifest: LayerManifest = await mResp.json();

    // 收集所有需要预取的文件名
    const files = new Set<string>();
    for (const key of ["lyapunov_max", "lyapunov_min", "energy_curvature", "bifurcation"] as const) {
      const val = manifest[key];
      if (val) files.add(val);
    }
    for (const sliceKey of [
      "lyapunov_max_dampingSlices",
      "lyapunov_min_dampingSlices",
      "energy_curvature_dampingSlices",
    ] as const) {
      const slices = manifest[sliceKey] as { file: string }[] | undefined;
      if (slices) {
        for (const s of slices) files.add(s.file);
      }
    }

    const urls = Array.from(files).map((f) => `/assets/${f}`);

    await Promise.all(
      urls.map(async (url) => {
        try {
          const response = await fetch(url);
          if (!response.ok) return;
          await response.text();
        } catch {
          /* 静默忽略 */
        }
      }),
    );
  } catch {
    /* manifest 不可用时静默忽略 */
  }
}
