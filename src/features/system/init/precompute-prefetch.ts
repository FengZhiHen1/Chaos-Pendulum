/**
 * 后台预取预计算 JSON 数据（ANL-01/ANL-02）。
 * 非阻塞——不等待完成，不阻塞启动流程。
 */

const PRECOMPUTE_URLS = [
  "/assets/lyapunov_max-18a7e25c8db5e979.json",
  "/assets/energy_curvature-a1b3f2e8.json",
  "/assets/bifurcation-f5770d24521b59de.json",
];

/**
 * 在后台静默预取预计算数据。
 * 失败时静默忽略，由 ANL-01/ANL-02 在首次访问时自行加载。
 */
export function prefetchPrecomputeData(): Promise<void> {
  return Promise.all(
    PRECOMPUTE_URLS.map(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        // 读取并丢弃——让浏览器 HTTP 缓存生效
        await response.text();
      } catch {
        // 静默忽略单个文件失败
      }
    }),
  ).then(() => undefined);
}
