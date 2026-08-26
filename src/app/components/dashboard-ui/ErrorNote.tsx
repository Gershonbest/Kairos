// One consistent presentation for inline errors, warnings, and success notes.

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "../ui/utils";

type NoteTone = "error" | "warning" | "success" | "info";

type ErrorNoteProps = {
  children: ReactNode;
  tone?: NoteTone;
  className?: string;
};

const TONE_CLASSES: Record<NoteTone, string> = {
  error: "border-destructive/30 bg-destructive/8 text-destructive",
  warning:
    "border-[var(--warning-on-surface)]/30 bg-[var(--warning-surface)]/50 text-[var(--warning-on-surface)]",
  success: "border-primary/30 bg-primary/8 text-primary",
  info: "border-border bg-muted/50 text-muted-foreground",
};

const TONE_ICONS: Record<NoteTone, typeof AlertTriangle> = {
  error: AlertTriangle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

export function ErrorNote({ children, tone = "error", className }: ErrorNoteProps) {
  const Icon = TONE_ICONS[tone];
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
