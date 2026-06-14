import { cn } from "@/shared/lib/cn";
import type { HTMLAttributes } from "react";

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-surface-container",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
