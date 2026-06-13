import { cn } from "@/shared/infrastructure/cn";
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
