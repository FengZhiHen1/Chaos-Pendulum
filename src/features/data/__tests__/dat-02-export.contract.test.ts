/**
 * DAT-02 数据导出契约对抗测试
 *
 * 覆盖: ExportDataUseCase, validateCSVConfig, validateJSONConfig, validatePNGConfig
 * 策略: P0 (禁止行为) → P1 (边界值) → P2 (类型破坏) → P3 (行为链破坏)
 *
 * 约束: 仅依赖 contracts/ 和 shared/domain/valueObjects/ 暴露的契约定义。
 */

import { describe, it, expect, beforeEach } from "vitest";

// ─── 契约入口 ────────────────────────────────────
import {
  ExportDataUseCase,
  validateCSVConfig,
  validateJSONConfig,
  validatePNGConfig,
  DataExportError,

} from "@/features/data/contracts";

import type {
  IExporter,
  ExportFormat,
  CSVExportConfig,
  JSONExportConfig,
  PNGExportConfig,
} from "@/features/data/contracts";

import type { PendulumParams, StateVector } from "@/shared/domain/valueObjects";

// ============================================================================
// 共享测试数据
// ============================================================================

const VALID_PARAMS: PendulumParams = {
  m1: 1.0,
  m2: 1.0,
  L1: 1.0,
  L2: 1.0,
  g: 9.81,
  damping: 0,
};

const VALID_STATE_VECTOR: StateVector = {
  theta1: Math.PI / 2,
  omega1: 0,
  theta2: Math.PI / 2,
  omega2: 0,
};

// ============================================================================
// 最小化 IExporter 实现
// ============================================================================

/** No-op 导出器：不做真实下载，仅记录调用 */
class NoopExporter<TConfig> implements IExporter<TConfig> {
  readonly format: ExportFormat;
  private _validateFn: (config: TConfig) => void;
  private _exportFn: (config: TConfig) => Promise<void>;
  public exportCalled = false;
  public lastConfig: TConfig | null = null;

  constructor(
    format: ExportFormat,
    validateFn: (config: TConfig) => void = () => {},
    exportFn: (config: TConfig) => Promise<void> = async () => {},
  ) {
    this.format = format;
    this._validateFn = validateFn;
    this._exportFn = exportFn;
  }

  async export(config: TConfig): Promise<void> {
    this.exportCalled = true;
    this.lastConfig = config;
    await this._exportFn(config);
  }

  validateConfig(config: TConfig): void {
    this._validateFn(config);
  }

  setValidateFn(fn: (config: TConfig) => void) {
    this._validateFn = fn;
  }
}

// ─── 最小化 ExportDataUseCase 子类 ─────────────

class TestExportDataUseCase extends ExportDataUseCase {
  constructor(exporters: Map<ExportFormat, IExporter<unknown>>) {
    super(exporters);
  }

  protected async doExecute<TConfig>(
    exporter: IExporter<TConfig>,
    config: TConfig,
  ): Promise<void> {
    await exporter.export(config);
  }
}

// ============================================================================
// ExportDataUseCase 对抗测试
// ============================================================================

describe("ExportDataUseCase — 数据导出用例", () => {
  let csvExporter: NoopExporter<CSVExportConfig>;
  let jsonExporter: NoopExporter<JSONExportConfig>;
  let pngExporter: NoopExporter<PNGExportConfig>;
  let exporters: Map<ExportFormat, IExporter<unknown>>;
  let useCase: TestExportDataUseCase;

  beforeEach(() => {
    csvExporter = new NoopExporter<CSVExportConfig>("csv");
    jsonExporter = new NoopExporter<JSONExportConfig>("json");
    pngExporter = new NoopExporter<PNGExportConfig>("png");
    exporters = new Map<ExportFormat, IExporter<unknown>>();
    exporters.set("csv", csvExporter);
    exporters.set("json", jsonExporter);
    exporters.set("png", pngExporter);
    useCase = new TestExportDataUseCase(exporters);
  });

  // ── P0: validateFormat — 无效格式 ─────────────

  describe("P0: validateFormat — 无效格式", () => {
    it("格式为 'xml' 时应抛出 DataExportError", () => {
      expect(() =>
        useCase["validateFormat"]("xml" as ExportFormat),
      ).toThrow(DataExportError);
    });

    it("格式为 'pdf' 时应抛出 DataExportError", () => {
      expect(() =>
        useCase["validateFormat"]("pdf" as ExportFormat),
      ).toThrow(DataExportError);
    });

    it("格式为空字符串时应抛出 DataExportError", () => {
      expect(() =>
        useCase["validateFormat"]("" as ExportFormat),
      ).toThrow(DataExportError);
    });

    it("异常消息应列出支持的格式", () => {
      try {
        useCase["validateFormat"]("xlsx" as ExportFormat);
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(DataExportError);
        expect((err as DataExportError).message).toContain("csv");
        expect((err as DataExportError).message).toContain("json");
        expect((err as DataExportError).message).toContain("png");
      }
    });

    it("有效格式 'csv' — 格式识别通过 (jsdom 不支持 Blob 则触发浏览器不兼容)", () => {
      try {
        useCase["validateFormat"]("csv");
      } catch (err) {
        // jsdom 不支持 Blob/URL → 应抛出 browser_unsupported
        expect(err).toBeInstanceOf(DataExportError);
        expect((err as DataExportError).detail).toBe("browser_unsupported");
      }
    });

    it("有效格式 'json' — 格式识别通过 (jsdom 同上)", () => {
      try {
        useCase["validateFormat"]("json");
      } catch (err) {
        expect(err).toBeInstanceOf(DataExportError);
        expect((err as DataExportError).detail).toBe("browser_unsupported");
      }
    });

    it("有效格式 'png' — 格式识别通过 (jsdom 同上)", () => {
      try {
        useCase["validateFormat"]("png");
      } catch (err) {
        expect(err).toBeInstanceOf(DataExportError);
        expect((err as DataExportError).detail).toBe("browser_unsupported");
      }
    });
  });

  // ── P0: getExporter — 未注册格式 ──────────────

  describe("P0: getExporter — 未注册格式", () => {
    it("未注册 'xml' 格式时应抛出 DataExportError", () => {
      expect(() =>
        useCase["getExporter"]("xml" as ExportFormat),
      ).toThrow(DataExportError);
    });

    it("异常消息应包含未注册的格式名", () => {
      try {
        useCase["getExporter"]("webp" as ExportFormat);
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(DataExportError);
        expect((err as DataExportError).detail).toBe("exporter_not_registered");
        expect((err as DataExportError).format).toBe("webp");
      }
    });
  });

  // ── P1: isBrowserSupported ────────────────────

  describe("P1: isBrowserSupported — 浏览器兼容性检测", () => {
    it("返回 boolean (jsdom 环境可能不支持 Blob+URL)", () => {
      // jsdom 可能不完全支持 Blob/URL API
      // 契约要求 must check before export，此处仅验证方法可调用
      expect(typeof useCase.isBrowserSupported()).toBe("boolean");
    });
  });

  // ── P3: 行为链破坏 ────────────────────────────

  describe("P3: execute — 完整流程", () => {
    it("跳过格式校验直接调 doExecute 仍然能执行", async () => {
      // P3: 行为链破坏——直接调受保护的 doExecute
      const config: CSVExportConfig = {
        headers: ["t", "theta1"],
        rows: [[0, 1]],
        filename: "test",
      };
      await useCase["doExecute"](csvExporter, config);
      expect(csvExporter.exportCalled).toBe(true);
    });

    it("测试空注册表——不存在的格式", () => {
      const emptyUseCase = new TestExportDataUseCase(new Map());
      expect(() =>
        emptyUseCase["getExporter"]("csv"),
      ).toThrow(DataExportError);
    });
  });

  // ── P2: 类型破坏 — 传错 config 类型 ───────────

  describe("P2: 类型破坏 — 传错配置", () => {
    it("传入 null config 给 CSV exporter", () => {
      expect(() =>
        csvExporter.validateConfig(null as unknown as CSVExportConfig),
      ).not.toThrow(); // NoopExporter 的默认 validate 不检查
    });
  });
});

// ============================================================================
// validateCSVConfig 对抗测试
// ============================================================================

describe("validateCSVConfig — CSV 配置校验器", () => {
  const validConfig: CSVExportConfig = {
    headers: ["t", "theta1", "omega1"],
    rows: [[0, 1, 2]],
    filename: "simulation-data",
  };

  // ── P0: 禁止行为 ──────────────────────────────

  describe("P0: headers 为空", () => {
    it("headers 为空数组 [] 应抛出 DataExportError", () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, headers: [] }),
      ).toThrow(DataExportError);
    });

    it("headers 为 null 应抛出 DataExportError", () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, headers: null as unknown as string[] }),
      ).toThrow(DataExportError);
    });

    it("headers 为 undefined 应抛出 DataExportError", () => {
      const incomplete = { rows: validConfig.rows, filename: validConfig.filename } as CSVExportConfig;
      expect(() =>
        validateCSVConfig(incomplete),
      ).toThrow(DataExportError);
    });
  });

  describe("P0: rows 为空", () => {
    it("rows 为空数组 [] 应抛出 DataExportError", () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, rows: [] }),
      ).toThrow(DataExportError);
    });

    it("rows 为 null 应抛出 DataExportError", () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, rows: null as unknown as number[][] }),
      ).toThrow(DataExportError);
    });
  });

  describe("P0: filename 为空", () => {
    it('filename 为空字符串 \'\' 应抛出 DataExportError', () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, filename: "" }),
      ).toThrow(DataExportError);
    });

    it('filename 为纯空格 "   " 应抛出 DataExportError', () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, filename: "   " }),
      ).toThrow(DataExportError);
    });

    it("filename 含 tab/newline → trim 后长度 0 应触发", () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, filename: "\t\n" }),
      ).toThrow(DataExportError);
    });
  });

  // ── P1: 边界值 ─────────────────────────────────

  describe("P1: 边界值", () => {
    it("单字符文件名 'a' 应通过", () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, filename: "a" }),
      ).not.toThrow();
    });

    it("极大 headers 数量 (1000 字段) 应通过", () => {
      const hugeHeaders = Array.from({ length: 1000 }, (_, i) => `col_${i}`);
      expect(() =>
        validateCSVConfig({ ...validConfig, headers: hugeHeaders }),
      ).not.toThrow();
    });

    it("单行空数组 [[], []] 应通过 (rows 非空)", () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, rows: [[], []] }),
      ).not.toThrow();
    });
  });

  // ── P2: 类型破坏 ──────────────────────────────

  describe("P2: 类型破坏", () => {
    it("filename 为 number → trim() 调用失败", () => {
      expect(() =>
        validateCSVConfig({ ...validConfig, filename: 123 as unknown as string }),
      ).toThrow();
    });
  });

  // ── P3: 正常通过 ──────────────────────────────

  describe("P3: 正常通过", () => {
    it("完整有效配置应通过", () => {
      expect(() =>
        validateCSVConfig(validConfig),
      ).not.toThrow();
    });
  });
});

// ============================================================================
// validateJSONConfig 对抗测试
// ============================================================================

describe("validateJSONConfig — JSON 配置校验器", () => {
  const validConfig: JSONExportConfig = {
    params: { ...VALID_PARAMS },
    trajectory: [{ ...VALID_STATE_VECTOR }],
    metadata: {
      exportedAt: new Date().toISOString(),
      version: "1.0.0",
      simTime: 10.5,
    },
    filename: "scene-export",
  };

  // ── P0: 禁止行为 ──────────────────────────────

  describe("P0: params 为空", () => {
    it("params 为空对象 {} 应抛出 DataExportError", () => {
      expect(() =>
        validateJSONConfig({ ...validConfig, params: {} as PendulumParams }),
      ).toThrow(DataExportError);
    });

    it("params 为 null 应抛出 DataExportError", () => {
      expect(() =>
        validateJSONConfig({ ...validConfig, params: null as unknown as PendulumParams }),
      ).toThrow(DataExportError);
    });
  });

  describe("P0: trajectory 为空", () => {
    it("trajectory 为空数组 [] 应抛出 DataExportError", () => {
      expect(() =>
        validateJSONConfig({ ...validConfig, trajectory: [] }),
      ).toThrow(DataExportError);
    });

    it("trajectory 为 null 应抛出 DataExportError", () => {
      expect(() =>
        validateJSONConfig({ ...validConfig, trajectory: null as unknown as StateVector[] }),
      ).toThrow(DataExportError);
    });
  });

  describe("P0: filename 为空", () => {
    it("filename 为空字符串应抛出 DataExportError", () => {
      expect(() =>
        validateJSONConfig({ ...validConfig, filename: "" }),
      ).toThrow(DataExportError);
    });
  });

  // ── P1: 边界值 ─────────────────────────────────

  describe("P1: 边界值", () => {
    it("trajectory 仅含 1 个元素 → 应通过", () => {
      expect(() =>
        validateJSONConfig(validConfig),
      ).not.toThrow();
    });

    it("trajectory 含大量元素 (10000) → 应通过", () => {
      const bigTraj = Array.from({ length: 10000 }, () => ({ ...VALID_STATE_VECTOR }));
      expect(() =>
        validateJSONConfig({ ...validConfig, trajectory: bigTraj }),
      ).not.toThrow();
    });
  });

  // ── P2: 类型破坏 ──────────────────────────────

  describe("P2: 类型破坏", () => {
    it("params 为 number → Object.keys(l) 类型错误", () => {
      expect(() =>
        validateJSONConfig({ ...validConfig, params: 42 as unknown as PendulumParams }),
      ).toThrow();
    });

    it("trajectory 含 null 元素 → 不额外检测", () => {
      expect(() =>
        validateJSONConfig({
          ...validConfig,
          trajectory: [null as unknown as StateVector],
        }),
      ).not.toThrow();
    });
  });
});

// ============================================================================
// validatePNGConfig 对抗测试
// ============================================================================

describe("validatePNGConfig — PNG 配置校验器", () => {
  /** 创建有效的 PNG 配置（使用 jsdom 提供的真实 canvas） */
  function createValidPNGConfig(overrides: Partial<PNGExportConfig> = {}): PNGExportConfig {
    return {
      canvas: document.createElement("canvas"),
      filename: "screenshot",
      resolution: 1,
      ...overrides,
    };
  }

  const validConfig = createValidPNGConfig();

  // ── P0: canvas 无效 ────────────────────────────

  describe("P0: canvas 无效", () => {
    it("canvas 为 null 应抛出 DataExportError", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, canvas: null as unknown as HTMLCanvasElement }),
      ).toThrow(DataExportError);
    });

    it("canvas 为 undefined 应抛出 DataExportError", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, canvas: undefined as unknown as HTMLCanvasElement }),
      ).toThrow(DataExportError);
    });

    it("canvas 为普通对象 (非 HTMLCanvasElement 实例) 应抛出 DataExportError", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, canvas: {} as HTMLCanvasElement }),
      ).toThrow(DataExportError);
    });

    it("canvas 为字符串 → instanceOf 检查失败", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, canvas: "not-a-canvas" as unknown as HTMLCanvasElement }),
      ).toThrow(DataExportError);
    });
  });

  // ── P0: resolution 超限 ───────────────────────

  describe("P0: resolution 无效", () => {
    it("resolution = 0 应抛出 DataExportError (小于 1)", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: 0 }),
      ).toThrow(DataExportError);
    });

    it("resolution = 5 应抛出 DataExportError (超过 PNG_MAX_RESOLUTION=4)", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: 5 }),
      ).toThrow(DataExportError);
    });

    it("resolution = -1 应抛出 DataExportError (负数)", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: -1 }),
      ).toThrow(DataExportError);
    });

    it("resolution = NaN 应抛出 DataExportError", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: NaN }),
      ).toThrow(DataExportError);
    });

    it("resolution = Infinity 应抛出 DataExportError", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: Infinity }),
      ).toThrow(DataExportError);
    });

    it("resolution = 1.5 应抛出 DataExportError (非整数)", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: 1.5 }),
      ).toThrow(DataExportError);
    });
  });

  // ── P0: filename 为空 ─────────────────────────

  describe("P0: filename 为空", () => {
    it("filename 为空字符串应抛出 DataExportError", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, filename: "" }),
      ).toThrow(DataExportError);
    });
  });

  // ── P1: 边界值 ─────────────────────────────────

  describe("P1: resolution 边界值", () => {
    it("resolution = 1 → 应通过 (最小值)", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: 1 }),
      ).not.toThrow();
    });

    it("resolution = 4 → 应通过 (最大值 PNG_MAX_RESOLUTION)", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: 4 }),
      ).not.toThrow();
    });

    it("resolution = 2 → 应通过 (中间值)", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: 2 }),
      ).not.toThrow();
    });

    it("resolution = 3 → 应通过", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: 3 }),
      ).not.toThrow();
    });
  });

  // ── P2: 类型破坏 ──────────────────────────────

  describe("P2: 类型破坏", () => {
    it("resolution 为字符串 '2' → Number.isInteger 返回 false", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, resolution: "2" as unknown as number }),
      ).toThrow(DataExportError);
    });

    it("filename 为 null → trim() 调用失败", () => {
      expect(() =>
        validatePNGConfig({ ...validConfig, filename: null as unknown as string }),
      ).toThrow();
    });
  });
});
