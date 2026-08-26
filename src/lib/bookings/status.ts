// Single source of truth for booking and payment status presentation.

export type StatusTone =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "failed"
  | "partial"
  | "neutral";

type StatusPresentation = {
  label: string;
  tone: StatusTone;
  /** Filled pill, for badges and chips. */
  badgeClass: string;
  /** Bordered surface, for calendar cells. */
  blockClass: string;
};

const TONE_STYLES: Record<StatusTone, { badgeClass: string; blockClass: string }> = {
  pending: {
    badgeClass: "bg-[var(--status-pending-surface)] text-[var(--status-pending-on-surface)]",
    blockClass:
      "bg-[var(--status-pending-surface)] text-[var(--status-pending-on-surface)] border-[var(--status-pending-on-surface)]/25",
  },
  confirmed: {
    badgeClass: "bg-[var(--status-confirmed-surface)] text-[var(--status-confirmed-on-surface)]",
    blockClass:
      "bg-[var(--status-confirmed-surface)] text-[var(--status-confirmed-on-surface)] border-[var(--status-confirmed-on-surface)]/25",
  },
  completed: {
    badgeClass: "bg-[var(--status-completed-surface)] text-[var(--status-completed-on-surface)]",
    blockClass:
      "bg-[var(--status-completed-surface)] text-[var(--status-completed-on-surface)] border-[var(--status-completed-on-surface)]/25",
  },
  cancelled: {
    badgeClass: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled-on-surface)]",
    blockClass:
      "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled-on-surface)] border-border",
  },
  no_show: {
    badgeClass: "bg-[var(--status-no-show-surface)] text-[var(--status-no-show-on-surface)]",
    blockClass:
      "bg-[var(--status-no-show-surface)] text-[var(--status-no-show-on-surface)] border-[var(--status-no-show-on-surface)]/25",
  },
  failed: {
    badgeClass: "bg-[var(--status-failed-surface)] text-[var(--status-failed-on-surface)]",
    blockClass:
      "bg-[var(--status-failed-surface)] text-[var(--status-failed-on-surface)] border-[var(--status-failed-on-surface)]/25",
  },
  partial: {
    badgeClass: "bg-[var(--status-pending-surface)] text-[var(--status-pending-on-surface)]",
    blockClass:
      "bg-[var(--status-pending-surface)] text-[var(--status-pending-on-surface)] border-[var(--status-pending-on-surface)]/25",
  },
  neutral: {
    badgeClass: "bg-muted text-muted-foreground",
    blockClass: "bg-muted text-muted-foreground border-border",
  },
};

const LABELS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "pending" },
  confirmed: { label: "Confirmed", tone: "confirmed" },
  completed: { label: "Completed", tone: "completed" },
  cancelled: { label: "Cancelled", tone: "cancelled" },
  canceled: { label: "Cancelled", tone: "cancelled" },
  no_show: { label: "No-show", tone: "no_show" },
  failed: { label: "Failed", tone: "failed" },
  partial: { label: "Partial", tone: "partial" },
  paid: { label: "Paid", tone: "completed" },
  unpaid: { label: "Unpaid", tone: "pending" },
  refunded: { label: "Refunded", tone: "cancelled" },
  abandoned: { label: "Abandoned", tone: "cancelled" },
};

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function statusPresentation(status: string | null | undefined): StatusPresentation {
  const key = (status ?? "").toLowerCase();
  const known = LABELS[key];
  const tone = known?.tone ?? "neutral";
  return {
    label: known?.label ?? (key ? titleCase(key) : "Unknown"),
    tone,
    ...TONE_STYLES[tone],
  };
}

export function statusBadgeClass(status: string | null | undefined): string {
  return statusPresentation(status).badgeClass;
}

export function statusBlockClass(status: string | null | undefined): string {
  return statusPresentation(status).blockClass;
}

export function statusLabel(status: string | null | undefined): string {
  return statusPresentation(status).label;
}
