import { cn } from "@/shared/lib/cn";
import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn("w-full caption-bottom text-xs", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b border-white/5", className)} {...props} />;
}

function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-white/5 transition-colors hover:bg-surface-container-low/50 data-[state=selected]:bg-surface-container-low",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-8 px-2 text-left align-middle text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "px-2 py-1.5 align-middle text-xs text-on-surface [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
