// Lightweight month calendar with booking day indicators.

import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { CalendarDays } from "lucide-react";
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

  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long" });
  const gridStart = startOfGrid(monthDate);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
  const todayKey = toDateKey(today);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>{monthLabel}</span>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-7 text-center text-xs text-muted-foreground mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day) => {
            const key = toDateKey(day);
            const inMonth = day.getMonth() === monthDate.getMonth();
            const isToday = key === todayKey;
            const hasBookings = (bookingMap[key] ?? 0) > 0;

            return (
              <button
                key={key}
                type="button"
                onClick={() => navigate(`/dashboard/calendar?date=${encodeURIComponent(key)}`)}
                className={`relative rounded-md py-2 text-sm transition-colors ${
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : inMonth
                      ? "hover:bg-accent hover:text-accent-foreground"
                      : "text-muted-foreground/50 hover:bg-accent/60"
                }`}
              >
                {day.getDate()}
                {hasBookings && (
                  <span
                    className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                      isToday ? "bg-primary-foreground" : "bg-accent"
                    }`}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
