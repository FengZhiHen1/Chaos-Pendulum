import type { BootError } from "@/features/simulation/types.boot";

interface ErrorScreenProps {
  error: BootError;
  onRetry: () => void;
  onOffline: () => void;
}

export function ErrorScreen({ error, onRetry, onOffline }: ErrorScreenProps) {
  const showOffline = error.type !== "worker";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface overflow-hidden">
      {/* 微弱网格纹理 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative flex flex-col items-center gap-5 max-w-sm px-6">
        {/* 警告图标 */}
        <div className="w-16 h-16 rounded-full bg-separation-alert/20 flex items-center justify-center">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-separation-alert"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" x2="12" y1="9" y2="13" />
            <line x1="12" x2="12.01" y1="17" y2="17" />
          </svg>
        </div>

        <h2 className="text-2xl font-semibold text-on-surface">应用启动失败</h2>

        <p className="text-on-surface-variant text-sm text-center">{error.message}</p>

        <div className="flex gap-4 mt-2">
          {/* 重试按钮：Primary 样式 */}
          <button
            type="button"
            onClick={onRetry}
            disabled={!error.retryable}
            className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-medium text-sm
                       hover:bg-primary-hover active:scale-95 transition-all duration-200
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            重试
          </button>
          {/* 离线模式按钮：Outline 样式 */}
          {showOffline && (
            <button
              type="button"
              onClick={onOffline}
              className="px-5 py-2.5 rounded-lg border border-on-surface-variant/20
                         text-on-surface font-medium text-sm
                         hover:bg-surface-container-low hover:border-on-surface-variant/40
                         active:scale-95 transition-all duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow"
            >
              离线模式
            </button>
          )}
        </div>

        {showOffline && (
          <p className="text-on-surface-variant/[0.5] text-xs text-center mt-4">
            离线模式下 Python 沙箱不可用，但 3D 实时仿真与分析模式仍可正常运行
          </p>
        )}
      </div>
    </div>
  );
}
