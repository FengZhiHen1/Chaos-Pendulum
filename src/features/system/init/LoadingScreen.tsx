import { useEffect, useState, useMemo } from "react";
import { CHAOS_QUOTES } from "@/shared/data/chaos-quotes";
import type { BootProgress } from "./types";

interface LoadingScreenProps {
  progress: BootProgress;
  showQuotes: boolean;
}

function formatEta(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return "";
  if (seconds < 60) return `预计剩余 ${Math.ceil(seconds)} 秒`;
  const mins = Math.ceil(seconds / 60);
  return `预计剩余 ${mins} 分钟`;
}

export function LoadingScreen({ progress, showQuotes }: LoadingScreenProps) {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);

  const quotes = useMemo(() => CHAOS_QUOTES, []);

  // 名言轮播：每 5 秒切换
  useEffect(() => {
    if (!showQuotes || quotes.length === 0) return;
    const timer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % quotes.length);
      setFadeKey((k) => k + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, [showQuotes, quotes.length]);

  const pct = Math.round(progress.overallProgress * 100);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0f] overflow-hidden select-none">
      {/* 微弱网格纹理 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative flex flex-col items-center gap-6 max-w-md px-6">
        {/* 双摆 Logo 动画 */}
        <div className="relative w-16 h-20">
          <svg viewBox="0 0 64 80" className="w-full h-full">
            {/* 上摆杆 */}
            <line
              x1="32"
              y1="8"
              x2="32"
              y2="32"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="2"
              className="origin-top animate-pendulum-upper"
            />
            {/* 上摆球 */}
            <circle
              cx="32"
              cy="32"
              r="5"
              fill="rgba(255,255,255,0.7)"
              className="origin-top animate-pendulum-upper"
            />
            {/* 下摆杆 */}
            <line
              x1="32"
              y1="32"
              x2="32"
              y2="56"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="1.5"
              className="origin-top animate-pendulum-lower"
            />
            {/* 下摆球 */}
            <circle
              cx="32"
              cy="56"
              r="4"
              fill="rgba(255,255,255,0.6)"
              className="origin-top animate-pendulum-lower"
            />
            {/* 支点 */}
            <circle cx="32" cy="8" r="2" fill="rgba(255,255,255,0.8)" />
          </svg>
        </div>

        {/* 标题 */}
        <div className="flex flex-col items-center gap-1 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-white tracking-[0.1em]">
            混沌实验室
          </h1>
          <p className="text-base font-light text-white/60">
            Chaos Pendulum Lab
          </p>
        </div>

        {/* 进度条 */}
        <div className="w-80 max-w-[80vw] flex flex-col gap-2">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/70 text-sm font-mono tabular-nums">
              {pct}%
            </span>
            <span className="text-white/50 text-sm">
              {progress.description}
            </span>
          </div>
          {progress.etaSeconds > 0 && (
            <span className="text-white/30 text-xs">
              {formatEta(progress.etaSeconds)}
            </span>
          )}
        </div>

        {/* 混沌名言 */}
        {showQuotes && quotes.length > 0 && (
          <div className="max-w-md text-center mt-2 min-h-[80px]">
            <div
              key={fadeKey}
              className="flex flex-col items-center animate-crossfade-in"
            >
              <p className="text-white/60 text-base italic leading-relaxed">
                &ldquo;{quotes[quoteIndex]!.quote}&rdquo;
              </p>
              <p className="text-white/30 text-sm mt-2">
                — {quotes[quoteIndex]!.author}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes pendulum-swing-upper {
          0%, 100% { transform: rotate(-12deg); }
          50% { transform: rotate(12deg); }
        }
        @keyframes pendulum-swing-lower {
          0%, 100% { transform: rotate(-24deg); }
          25% { transform: rotate(8deg); }
          50% { transform: rotate(24deg); }
          75% { transform: rotate(-8deg); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes crossfade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-pendulum-upper {
          animation: pendulum-swing-upper 2.5s ease-in-out infinite;
          transform-origin: 32px 8px;
        }
        .animate-pendulum-lower {
          animation: pendulum-swing-lower 1.25s ease-in-out infinite;
          transform-origin: 32px 32px;
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out both;
        }
        .animate-crossfade-in {
          animation: crossfade-in 0.5s ease-out both;
        }
      `}</style>
    </div>
  );
}
