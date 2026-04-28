import { rk4Integrate } from "../engine/rk4";
import type { PhysicsParams, StateVector } from "@/shared/types";

interface WorkerMessage {
  params: PhysicsParams;
  state: StateVector;
  dt: number;
  steps: number;
  buf: Float64Array;
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { params, state, dt, steps, buf } = e.data;
  const trajectory = rk4Integrate(state, params, dt, steps);

  for (let i = 0; i < trajectory.length; i++) {
    const s = trajectory[i]!;
    const offset = i * 4;
    buf[offset] = s.theta1;
    buf[offset + 1] = s.omega1;
    buf[offset + 2] = s.theta2;
    buf[offset + 3] = s.omega2;
  }

  (self.postMessage as (message: unknown, transfer: Transferable[]) => void)(
    { cmd: "result", buf },
    [buf.buffer as ArrayBuffer],
  );
};
