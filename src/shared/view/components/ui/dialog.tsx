import { cn } from "@/shared/lib/cn";
import { useEffect, type ReactNode, type HTMLAttributes } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

function DialogOverlay({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm",
        "animate-in fade-in-0",
        className,
      )}
      onClick={onClick}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        "w-full max-w-lg rounded-xl bg-surface-container-high p-6",
        "shadow-[0_12px_32px_rgba(0,0,0,0.4)]",
        "animate-in fade-in-0 zoom-in-95",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <DialogOverlay onClick={onClose} />
      <DialogContent className={className}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            {title && (
              <h2 className="text-base font-semibold text-on-surface tracking-wide">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs text-on-surface-variant mt-1">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 h-8 w-8 inline-flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </DialogContent>
    </>
  );
}
