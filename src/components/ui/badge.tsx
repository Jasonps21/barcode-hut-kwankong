import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "destructive" | "success" | "warning";

const variants: Record<Variant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "text-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
  success: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
