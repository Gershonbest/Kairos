// Metric tile with loading skeleton and optional emphasis.

import type { ComponentType, ReactNode } from "react";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../ui/utils";

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  loading?: boolean;
  /** Draws attention when a metric needs action, e.g. pending confirmations. */
  emphasis?: boolean;
  className?: string;
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading = false,
  emphasis = false,
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "gap-0 p-5",
        emphasis && "border-[var(--warning-on-surface)]/35 bg-[var(--warning-surface)]/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              emphasis ? "text-[var(--warning-on-surface)]" : "text-muted-foreground",
            )}
          />
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p
          className={cn(
            "mt-2 text-2xl font-semibold tracking-tight tabular-nums",
            emphasis ? "text-[var(--warning-on-surface)]" : "text-foreground",
          )}
        >
          {value}
        </p>
      )}
      {hint && !loading && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
