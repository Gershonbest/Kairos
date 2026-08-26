// Editorial service / listing row for public booking.

import { Clock } from "lucide-react";
import { MonogramThumb } from "./MonogramThumb";

type ServiceRowProps = {
  name: string;
  description?: string;
  meta?: string;
  durationLabel?: string;
  priceLabel?: string;
  depositLabel?: string;
  imageUrl?: string | null;
  selected?: boolean;
  onClick: () => void;
};

export function ServiceRow({
  name,
  description,
  meta,
  durationLabel,
  priceLabel,
  depositLabel,
  imageUrl,
  selected,
  onClick,
}: ServiceRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-start gap-4 rounded-2xl border px-4 py-4 text-left transition-colors duration-150 ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border/80 bg-card/70 hover:border-foreground/20 hover:bg-card"
      }`}
    >
      <MonogramThumb name={name} imageUrl={imageUrl} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-semibold tracking-tight text-foreground">{name}</p>
          {priceLabel && (
            <p className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">{priceLabel}</p>
          )}
        </div>
        {description && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        )}
        {meta && <p className="mt-1.5 text-xs text-muted-foreground">{meta}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {durationLabel && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {durationLabel}
            </span>
          )}
          {depositLabel && <span className="text-foreground/70">{depositLabel}</span>}
        </div>
      </div>
    </button>
  );
}
