import type { BootError } from "./types";

interface ErrorScreenProps {
  error: BootError;
  onRetry: () => void;
  onOffline: () => void;
}

export function ErrorScreen({ error, onRetry, onOffline }: ErrorScreenProps) {
  const showOffline = error.type !== "worker";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0f] overflow-hidden">
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
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-400"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" x2="12" y1="9" y2="13" />
            <line x1="12" x2="12.01" y1="17" y2="17" />
          </svg>
        </div>

        <h2 className="text-2xl font-semibold text-white">应用启动失败</h2>

        <p className="text-white/60 text-sm text-center">{error.message}</p>

        <div className="flex gap-4 mt-2">
          <button
            onClick={onRetry}
            className="px-5 py-2.5 bg-white text-[#0a0a0f] rounded-md font-medium text-sm hover:bg-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            重试
          </button>
          {showOffline && (
            <button
              onClick={onOffline}
              className="px-5 py-2.5 border border-white/30 text-white rounded-md font-medium text-sm hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              离线模式
            </button>
          )}
        </div>

        {showOffline && (
          <p className="text-white/30 text-xs text-center mt-4">
            离线模式下 Python 沙箱不可用，但 3D 实时仿真与分析模式仍可正常运行
          </p>
        )}
      </div>
    </div>
  );
}
