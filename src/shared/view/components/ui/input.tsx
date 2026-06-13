import { cn } from "@/shared/infrastructure/cn";
import { forwardRef, type InputHTMLAttributes } from "react";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-7 w-full rounded-lg bg-surface-container-low px-2 text-xs text-on-surface",
          "border border-on-surface-variant/10",
          "placeholder:text-on-surface-variant/50",
          "focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary-focus-glow",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-separation-alert/80 aria-[invalid=true]:animate-shake",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
