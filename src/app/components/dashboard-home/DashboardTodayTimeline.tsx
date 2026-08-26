// Today's bookings timeline widget with live next-booking countdown.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { bookingClientLabel, type BookingListItem } from "../../../lib/api/client";
import { EmptyState } from "../dashboard-ui/EmptyState";
import { ListRow } from "../dashboard-ui/ListRow";
import { ListSkeleton } from "../dashboard-ui/skeletons";
import { SectionCard } from "../dashboard-ui/SectionCard";
import { StatusBadge } from "../dashboard-ui/StatusBadge";

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
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Today&apos;s bookings
        </span>
      }
      actions={
        nextUpcoming ? (
          <span className="text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
            {nextInMinutes === 0 ? "Next booking now" : `Next booking in ${nextInMinutes} min`}
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <ListSkeleton rows={3} />
      ) : todayRows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing booked for today"
          description="Your day is clear. Add a booking manually or share your booking link to fill it."
          action={
            <Button size="sm" asChild>
              <Link to="/dashboard/calendar?new=1">
                <Plus className="mr-1.5 h-4 w-4" />
                New booking
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {todayRows.map((row) => (
            <ListRow key={row.id} to={`/dashboard/calendar?booking=${row.id}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{bookingClientLabel(row)}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {row.service_name}
                  {row.listing_name ? ` · ${row.listing_name}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatTime(row.start_at)}
                </p>
                <StatusBadge status={row.status} className="mt-1" />
              </div>
            </ListRow>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
