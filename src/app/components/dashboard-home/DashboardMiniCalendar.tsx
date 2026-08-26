// Lightweight month calendar with booking day indicators.

import { useMemo } from "react";
import { useNavigate } from "react-router";
import { CalendarDays } from "lucide-react";
import { SectionCard } from "../dashboard-ui/SectionCard";
import type { BookingListItem } from "../../../lib/api/client";

type DashboardMiniCalendarProps = {
  bookings: BookingListItem[];
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfGrid(date: Date): Date {
  const start = startOfMonth(date);
  const day = start.getDay();
  const offset = day;
  const next = new Date(start);
  next.setDate(start.getDate() - offset);
  return next;
}

export function DashboardMiniCalendar({ bookings }: DashboardMiniCalendarProps) {
  const navigate = useNavigate();
  const today = new Date();
  const monthDate = new Date(today.getFullYear(), today.getMonth(), 1);

  const bookingMap = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const booking of bookings) {
      const date = parseDate(booking.start_at);
      if (!date) continue;
      const key = toDateKey(date);
      byDate[key] = (byDate[key] ?? 0) + 1;
    }
    return byDate;
  }, [bookings]);

  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const gridStart = startOfGrid(monthDate);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
  const todayKey = toDateKey(today);

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {monthLabel}
        </span>
      }
      actions={<span className="text-xs text-muted-foreground">Tap a day to open it</span>}
    >
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
          <div key={`${label}-${index}`} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const key = toDateKey(day);
          const inMonth = day.getMonth() === monthDate.getMonth();
          const isToday = key === todayKey;
          const count = bookingMap[key] ?? 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(`/dashboard/calendar?date=${encodeURIComponent(key)}`)}
              aria-label={`${day.toDateString()}${count > 0 ? `, ${count} booking${count === 1 ? "" : "s"}` : ""}`}
              className={`relative rounded-lg py-2 text-sm tabular-nums transition-colors ${
                isToday
                  ? "bg-primary font-semibold text-primary-foreground"
                  : inMonth
                    ? "text-foreground hover:bg-muted"
                    : "text-muted-foreground/45 hover:bg-muted/60"
              }`}
            >
              {day.getDate()}
              {count > 0 && (
                <span
                  className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isToday ? "bg-primary-foreground" : "bg-primary"
                  }`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}
