// Standard titled panel used across dashboard pages and settings sections.

import type { FormEventHandler, ReactNode } from "react";
import { cn } from "../ui/utils";

type SectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Renders as a <form> so settings sections keep native submit behaviour. */
  as?: "div" | "form";
  onSubmit?: FormEventHandler<HTMLFormElement>;
  tone?: "default" | "danger";
};

export function SectionCard({
  title,
  description,
  actions,
  footer,
  children,
  className,
  contentClassName,
  as = "div",
  onSubmit,
  tone = "default",
}: SectionCardProps) {
  const classes = cn(
    "overflow-hidden rounded-xl border bg-card text-card-foreground",
    tone === "danger" ? "border-destructive/35" : "border-border",
    className,
  );

  const inner = (
    <>
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("px-5 py-5", contentClassName)}>{children}</div>
      {footer && <div className="border-t border-border px-5 py-4">{footer}</div>}
    </>
  );

  if (as === "form") {
    return (
      <form onSubmit={onSubmit} className={classes}>
        {inner}
      </form>
    );
  }

  return <div className={classes}>{inner}</div>;
}
