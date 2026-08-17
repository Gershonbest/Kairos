// Today's bookings timeline widget with live next-booking countdown.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarClock, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { bookingClientLabel, type BookingListItem } from "../../../lib/api/client";

type DashboardTodayTimelineProps = {
  bookings: BookingListItem[];
  loading?: boolean;
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusClasses(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-primary/10 text-primary";
    case "pending":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100";
    case "completed":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    case "no_show":
      return "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-100";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatTime(iso: string): string {
  const parsed = parseDate(iso);
  if (!parsed) return "Unknown time";
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function DashboardTodayTimeline({ bookings, loading = false }: DashboardTodayTimelineProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayKey = localDateKey(now);
  const todayRows = useMemo(
    () =>
      bookings
        .filter((booking) => {
          const date = parseDate(booking.start_at);
          return date ? localDateKey(date) === todayKey : false;
        })
        .sort((a, b) => {
          const left = parseDate(a.start_at)?.getTime() ?? 0;
          const right = parseDate(b.start_at)?.getTime() ?? 0;
          return left - right;
        }),
    [bookings, todayKey]
  );

  const nextUpcoming = useMemo(
    () =>
      todayRows.find(
        (row) =>
          ["pending", "confirmed"].includes(row.status) &&
          (parseDate(row.start_at)?.getTime() ?? -1) >= now.getTime()
      ) ?? null,
    [todayRows, now]
  );

  const nextInMinutes =
    nextUpcoming
      ? Math.max(
          0,
          Math.ceil(((parseDate(nextUpcoming.start_at)?.getTime() ?? now.getTime()) - now.getTime()) / 60_000)
        )
      : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Today&apos;s bookings
          </CardTitle>
          {nextUpcoming && (
            <span className="text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
              {nextInMinutes === 0 ? "Next booking now" : `Next booking in ${nextInMinutes} min`}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading today&apos;s bookings…</p>
        ) : todayRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-5">
            <p className="text-sm text-muted-foreground">No bookings yet for today.</p>
            <Button className="mt-3" size="sm" asChild>
              <Link to="/dashboard/calendar?new=1">
                <Plus className="h-4 w-4 mr-1.5" />
                New booking
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {todayRows.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div>
                  <p className="font-medium">{bookingClientLabel(row)}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.service_name}
                    {row.listing_name ? " · Product-based" : " · General"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatTime(row.start_at)}</p>
                  <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs capitalize ${statusClasses(row.status)}`}>
                    {row.status === "no_show" ? "No-show" : row.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
