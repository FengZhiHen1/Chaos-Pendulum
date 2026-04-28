import { cn } from "@/shared/lib/cn";
import { forwardRef, type InputHTMLAttributes } from "react";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-7 w-full rounded-md border border-lab-border bg-lab-dark px-2 text-xs text-white",
          "placeholder:text-lab-border/50",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lab-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
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
