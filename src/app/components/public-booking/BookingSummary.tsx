// Sticky booking summary rail (desktop) / compact strip content (mobile).

import { AnimatePresence, motion } from "motion/react";
import { MonogramThumb } from "./MonogramThumb";

export type BookingSummaryProps = {
  businessName: string;
  serviceName?: string | null;
  serviceImage?: string | null;
  listingName?: string | null;
  dateLabel?: string | null;
  timeLabel?: string | null;
  durationLabel?: string | null;
  formatLabel?: string | null;
  hostLabel?: string | null;
  contactName?: string | null;
  totalLabel?: string | null;
  dueTodayLabel?: string | null;
  balanceLabel?: string | null;
  compact?: boolean;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start justify-between gap-3 text-[13px]"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right font-medium text-foreground">{value}</span>
    </motion.div>
  );
}

export function BookingSummary({
  businessName,
  serviceName,
  serviceImage,
  listingName,
  dateLabel,
  timeLabel,
  durationLabel,
  formatLabel,
  hostLabel,
  contactName,
  totalLabel,
  dueTodayLabel,
  balanceLabel,
  compact = false,
}: BookingSummaryProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {serviceName ? (
          <>
            <MonogramThumb name={serviceName} imageUrl={serviceImage} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{serviceName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[dateLabel, timeLabel].filter(Boolean).join(" · ") || "Continue booking"}
              </p>
            </div>
            {dueTodayLabel && (
              <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{dueTodayLabel}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Choose a service to begin</p>
        )}
      </div>
    );
  }

  return (
    <div className="booking-summary sticky top-8 rounded-2xl border border-border/80 bg-card/80 p-5 backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Your booking
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{businessName}</p>

      <div className="mt-5 space-y-3">
        <AnimatePresence mode="popLayout">
          {!serviceName && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[13px] leading-relaxed text-muted-foreground"
            >
              Choose a service to see your summary here.
            </motion.p>
          )}
          {serviceName && (
            <motion.div
              key="service"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 border-b border-border/70 pb-4"
            >
              <MonogramThumb name={serviceName} imageUrl={serviceImage} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{serviceName}</p>
                {durationLabel && (
                  <p className="text-xs text-muted-foreground">{durationLabel}</p>
                )}
              </div>
            </motion.div>
          )}
          {listingName && <Row label="Product" value={listingName} />}
          {formatLabel && <Row label="Format" value={formatLabel} />}
          {hostLabel && <Row label="With" value={hostLabel} />}
          {dateLabel && <Row label="Date" value={dateLabel} />}
          {timeLabel && <Row label="Time" value={timeLabel} />}
          {contactName && <Row label="Guest" value={contactName} />}
        </AnimatePresence>
      </div>

      {(totalLabel || dueTodayLabel) && (
        <div className="mt-5 space-y-2 border-t border-border/70 pt-4">
          {totalLabel && <Row label="Total" value={totalLabel} />}
          {dueTodayLabel && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Due today</span>
              <span className="font-semibold tabular-nums text-primary">{dueTodayLabel}</span>
            </div>
          )}
          {balanceLabel && (
            <p className="text-xs text-muted-foreground">Balance at appointment: {balanceLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}
