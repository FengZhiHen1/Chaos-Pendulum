/**
 * 模块: explore.hooks.useSonification
 * 职责: 声音化引擎 Hook——管理音频引擎生命周期，将仿真状态映射为实时音频。
 *       EXP-03 的核心交互：使混沌可听。
 * 边界:
 *   - 依赖: contracts (SonificationParams, ISonificationEngine, SONIFICATION_DEFAULTS)
 *           simulation (useSimulationStore, normalizeAngle)
 *           shared/infrastructure/audio (AudioContext, 引擎工厂)
 *   - 被依赖: SonificationToggle, ExplorePage
 * 禁止行为:
 *   - 禁止在移动端激活音频引擎——自动禁用
 *   - 禁止在无用户手势的情况下创建 AudioContext
 *   - 默认静音——声音化需用户主动开启
 */

import { useEffect, useRef, useCallback } from "react";
import { useSimulationStore, normalizeAngle } from "@/features/simulation";
import { useExploreStore } from "../store";
import { useAppStore } from "@/stores/useAppStore";
import { notify } from "@/shared/infrastructure/error-handling/notify";
import {
  getAudioContext,
  createSonificationEngine,
  resumeAudioContext,
  closeAudioContext,
} from "@/shared/infrastructure/audio";
import type { SonificationEngine } from "@/shared/infrastructure/audio";
import { SONIFICATION_DEFAULTS } from "../contracts";
import type { SonificationParams } from "../contracts";

// ─── Hook 返回类型 ─────────────────────────────────

export interface UseSonificationAPI {
  isActive: boolean;
  toggle: () => void;
}

/**
 * 声音化引擎 Hook。
 *
 * 管理音频引擎生命周期：
 * - 仅桌面端启用
 * - 惰性初始化（首次 toggle 时创建引擎）
 * - 每仿真帧更新音频参数
 * - 组件卸载时清理
 */
export function useSonification(): UseSonificationAPI {
  const deviceType = useAppStore((s) => s.deviceType);
  const sonificationEnabled = useExploreStore((s) => s.sonificationEnabled);
  const setSonificationEnabled = useExploreStore((s) => s.setSonificationEnabled);

  const engineRef = useRef<SonificationEngine | null>(null);
  const maxObservedEnergyRef = useRef<number>(SONIFICATION_DEFAULTS.maxEnergyMin);
  const initializedRef = useRef(false);
  const rebuildCountRef = useRef(0);

  // ── 惰性初始化引擎 ──
  const initEngine = useCallback(() => {
    if (initializedRef.current && engineRef.current) return;
    try {
      engineRef.current = createSonificationEngine();
      initializedRef.current = true;
      rebuildCountRef.current = 0;
    } catch (err) {
      console.error("EXP-03: Failed to create sonification engine", err);
    }
  }, []);

  // ── 开关切换 ──
  const toggle = useCallback(() => {
    if (deviceType !== "desktop") return;

    if (!sonificationEnabled) {
      // 开启：恢复 AudioContext + 初始化/启用引擎
      resumeAudioContext()
        .then(() => {
          const ctx = getAudioContext();
          if (ctx.state === "suspended") {
            console.warn("EXP-03: AudioContext blocked by browser autoplay policy");
            notify({
              title: "浏览器阻止了音频播放",
              description: "请再次点击按钮",
              variant: "warning",
              durationMs: 3000,
            });
            return;
          }
          initEngine();
          const newEngine = engineRef.current;
          if (newEngine) {
            newEngine.setEnabled(true);
          }
          setSonificationEnabled(true);
        })
        .catch(() => {
          console.warn("EXP-03: AudioContext blocked by browser autoplay policy");
          notify({
            title: "浏览器阻止了音频播放",
            description: "请点击页面后再试",
            variant: "warning",
            durationMs: 3000,
          });
        });
    } else {
      // 关闭：静音但不销毁引擎
      if (engineRef.current) {
        engineRef.current.setEnabled(false);
      }
      setSonificationEnabled(false);
    }
  }, [deviceType, sonificationEnabled, setSonificationEnabled, initEngine]);

  // ── 每帧音频参数更新（订阅仿真时间变化） ──
  const simTime = useSimulationStore((s) => s.t);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const prevSimTimeRef = useRef(simTime);
  const wasRunningRef = useRef(isRunning);

  // ── 暂停时同步静音 / 恢复时恢复 ──
  useEffect(() => {
    if (!sonificationEnabled || !engineRef.current) return;
    if (isRunning === wasRunningRef.current) return;
    wasRunningRef.current = isRunning;
    engineRef.current.setEnabled(isRunning);
  }, [isRunning, sonificationEnabled]);

  useEffect(() => {
    if (!sonificationEnabled || !engineRef.current || deviceType !== "desktop") return;

    // 仿真时间未变化则跳过（防止重复更新）
    if (simTime === prevSimTimeRef.current) return;
    prevSimTimeRef.current = simTime;

    const store = useSimulationStore.getState();

    // 仿真暂停时不再更新音频参数
    if (!store.isRunning) return;

    const { state, kineticEnergy } = store;
    const angleBetween = Math.abs(normalizeAngle(state.theta2 - state.theta1));

    // 更新 maxObservedEnergy（EMA 衰减，使用契约默认值）
    const alpha = SONIFICATION_DEFAULTS.maxEnergyEmaAlpha;
    const minEnergy = SONIFICATION_DEFAULTS.maxEnergyMin;
    maxObservedEnergyRef.current = Math.max(
      maxObservedEnergyRef.current * (1 - alpha) + kineticEnergy * alpha,
      kineticEnergy,
      minEnergy,
    );

    // 混沌检测：从 store 读取（由 useChaosUpdater 统一计算）
    const variance = useExploreStore.getState().chaosVariance;

    // 构建符合契约的 SonificationParams（类型约束增强）
    const audioParams: SonificationParams = {
      theta2Dot: state.omega2,
      armAngle: angleBetween,
      totalEnergy: kineticEnergy,
      lyapunovExponent: variance,
    };

    // 更新引擎（带 InvalidStateError 捕获与自动重建）
    try {
      engineRef.current.update({
        omega2: audioParams.theta2Dot,
        angleBetween: audioParams.armAngle,
        kineticEnergy: audioParams.totalEnergy,
        omega2Variance: audioParams.lyapunovExponent,
        maxObservedEnergy: maxObservedEnergyRef.current,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "InvalidStateError") {
        console.error("EXP-03: Oscillator stopped unexpectedly, reinitializing engine");
        const engine = engineRef.current;
        const maxRebuilds = SONIFICATION_DEFAULTS.maxEngineRebuilds;
        if (rebuildCountRef.current >= maxRebuilds) {
          engine?.setEnabled(false);
          setSonificationEnabled(false);
          notify({
            title: "音频引擎故障",
            description: "请刷新页面后重试",
            variant: "error",
            durationMs: 3000,
          });
          return;
        }
        try {
          engine?.dispose();
          engineRef.current = null;
          initializedRef.current = false;
          rebuildCountRef.current++;
          initEngine();
          const rebuiltEngine = engineRef.current as SonificationEngine | null;
          if (rebuiltEngine) {
            rebuiltEngine.setEnabled(true);
          }
        } catch (rebuildErr) {
          console.error("EXP-03: Engine rebuild failed", rebuildErr);
          setSonificationEnabled(false);
        }
      } else {
        throw err;
      }
    }
  }, [simTime, sonificationEnabled, deviceType, initEngine, setSonificationEnabled]);

  // ── 卸载清理 ──
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
        initializedRef.current = false;
      }
      closeAudioContext();
    };
  }, []);

  return {
    isActive: sonificationEnabled,
    toggle,
  };
}
