/**
 * Command Bus — 轻量级事件总线
 * 用于解耦计算层（Scheduler / Worker）与状态管理层（Store）
 * 计算模块只负责 emit 事件，状态管理层负责订阅和更新状态
 */

export type CommandPayload =
  | { type: "worker:ready" }
  | {
      type: "worker:batchReady";
      buffer?: Float64Array;
      frameCount?: number;
      simTime?: number;
      poincarePoints?: import("@/shared/types").PoincarePoint[];
      forceData?: Float64Array;
      forceExtrema?: import("@/shared/types").ForceExtrema;
      energyCorrection?: number;
      lyapunovExponent?: number;
    }
  | { type: "worker:error"; code: import("@/shared/types").ErrorCode; message: string; simTime: number }
  | { type: "worker:crash"; event: ErrorEvent }
  | { type: "frame:consume"; buffer: Float64Array; frameIndex: number }
  | { type: "frame:consumed"; state: import("@/shared/types").StateVector }
  | { type: "history:push"; state: import("@/shared/types").StateVector }
  | { type: "history:clear" }
  | { type: "history:pause" }
  | { type: "history:resume" }
  | { type: "scheduler:started" }
  | { type: "scheduler:paused" }
  | { type: "scheduler:resumed" }
  | { type: "poincare:addPoints"; points: import("@/shared/types").PoincarePoint[] }
  | { type: "poincare:clear" }
  | { type: "lab:forceData"; data: Float64Array; extrema?: import("@/shared/types").ForceExtrema }
  | { type: "simulation:reset" }
  | { type: "simulation:runningChanged"; isRunning: boolean }
  | { type: "butterfly:frame"; side: "A" | "B"; state: import("@/shared/types").StateVector; energy: { kinetic: number; potential: number; total: number }; derived: { x1: number; y1: number; x2: number; y2: number }; simTime: number }
  | { type: "butterfly:workerReady"; side: "A" | "B"; ready: boolean }
  | { type: "butterfly:error"; side: "A" | "B"; simTime: number }
  | { type: "butterfly:crash"; side: "A" | "B" }
  | { type: "butterfly:play" }
  | { type: "butterfly:pause" }
  | { type: "engine:recovered"; message: string };

type CommandHandler = (payload: CommandPayload) => void;

class CommandBus {
  private handlers = new Map<string, Set<CommandHandler>>();

  on<T extends CommandPayload["type"]>(
    command: T,
    handler: (payload: Extract<CommandPayload, { type: T }>) => void,
  ): () => void {
    if (!this.handlers.has(command)) {
      this.handlers.set(command, new Set());
    }
    const set = this.handlers.get(command)!;
    const wrapped = handler as CommandHandler;
    set.add(wrapped);
    return () => set.delete(wrapped);
  }

  emit(payload: CommandPayload): void {
    const set = this.handlers.get(payload.type);
    if (set) {
      // 使用 Array.from 避免在回调中修改 Set 导致的问题
      Array.from(set).forEach((h) => h(payload));
    }
  }

  /** 一次性订阅，触发后自动取消 */
  once<T extends CommandPayload["type"]>(
    command: T,
    handler: (payload: Extract<CommandPayload, { type: T }>) => void,
  ): () => void {
    const unsubscribe = this.on(command, (payload) => {
      unsubscribe();
      handler(payload as Extract<CommandPayload, { type: T }>);
    });
    return unsubscribe;
  }
}

export const commandBus = new CommandBus();
