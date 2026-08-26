// Status pill backed by the shared status token map.

import { statusPresentation } from "../../../lib/bookings/status";
import { cn } from "../ui/utils";

type StatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, badgeClass } = statusPresentation(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeClass,
        className,
      )}
    >
      {label}
    </span>
  );
}
