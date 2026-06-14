/**
 * 模块: analyze.infrastructure
 * 职责: Infrastructure 层接线出口——导出实现了 Application 端口的实例。
 * 边界:
 *   - 禁止导出 View / ViewModel 层代码
 *   - 仅导出 Repository / Mapper / Storage 实现
 */

import { PrecomputeDataRepo } from "./repositories/PrecomputeDataRepo";

export const precomputeDataRepo = new PrecomputeDataRepo();

export { PrecomputeDataRepo } from "./repositories/PrecomputeDataRepo";
