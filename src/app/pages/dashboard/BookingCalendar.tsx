// Calendar view of tenant bookings with month/week/day layouts.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { Calendar as CalendarIcon, CalendarOff, CheckCircle2, ChevronLeft, ChevronRight, Clock, Mail, MapPin, Phone, Plus, Trash2, User, UserX, XCircle } from "lucide-react";
import { CalendarBlockDialog } from "../../components/bookings/CalendarBlockDialog";
import { ManualBookingDialog } from "../../components/bookings/ManualBookingDialog";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { RecordBalanceDialog } from "../../components/payments/RecordBalanceDialog";
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  PageShell,
  SectionCard,
  StatusBadge,
} from "../../components/dashboard-ui";
import { api, bookingClientLabel, type BookingListItem } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { statusBlockClass } from "../../../lib/bookings/status";

const ASSIGNEE_BORDERS = [
  "border-l-4 border-l-sky-500",
  "border-l-4 border-l-violet-500",
  "border-l-4 border-l-amber-500",
  "border-l-4 border-l-emerald-500",
  "border-l-4 border-l-rose-500",
  "border-l-4 border-l-cyan-500",
  "border-l-4 border-l-fuchsia-500",
  "border-l-4 border-l-orange-500",
];

const ASSIGNEE_DOTS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-orange-500",
];

function assigneeColorIndex(userId: string | null | undefined): number {
  if (!userId) return 0;
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return hash % ASSIGNEE_BORDERS.length;
}

type CalendarView = "month" | "week" | "day";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

const LEGEND_STATUSES = ["confirmed", "pending", "completed", "no_show", "cancelled"] as const;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`;
}

function durationMinutes(startIso: string, endIso: string): number {
  return Math.max(15, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
}

function isAllDayBooking(booking: BookingListItem): boolean {
  return Boolean(booking.is_all_day) || booking.scheduling_mode === "all_day";
}

function bookingWhenLabel(booking: BookingListItem): string {
  if (isAllDayBooking(booking)) return "All day";
  if (booking.scheduling_mode === "flexible") {
    return `${formatTime(booking.start_at)} · Typical ~${booking.service_duration_minutes ?? durationMinutes(booking.start_at, booking.end_at)} min`;
  }
  return `${formatTime(booking.start_at)} · ${durationMinutes(booking.start_at, booking.end_at)} min`;
}

function isLikelyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function BookingCalendar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<BookingListItem | null>(null);
  const [manualBookingOpen, setManualBookingOpen] = useState(false);
  const [manualBookingStart, setManualBookingStart] = useState<Date | null>(null);
  const [manualBookingClientId, setManualBookingClientId] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockInitialDate, setBlockInitialDate] = useState<Date | null>(null);
  const [outcomeUpdating, setOutcomeUpdating] = useState<string | null>(null);
  const [balanceTarget, setBalanceTarget] = useState<{
    bookingId: string;
    clientName: string;
    serviceName: string;
    balanceDue: number;
  } | null>(null);
  const [outcomeError, setOutcomeError] = useState("");
  const [staffFilter, setStaffFilter] = useState<string>("all");

  const { data: me } = useQuery({ queryKey: queryKeys.me, queryFn: () => api.me() });
  const { data: team } = useQuery({ queryKey: queryKeys.team, queryFn: () => api.getTeam() });
  const canSeeAll = Boolean(me?.permissions?.includes("calendar:all"));
  const canReassign = Boolean(me?.permissions?.includes("bookings:reassign"));

  const { data: bookings = [], isPending: bookingsLoading } = useQuery({
    queryKey: queryKeys.bookings,
    queryFn: () => api.listBookings(),
  });
  const { data: calendarBlocks = [] } = useQuery({
    queryKey: queryKeys.calendarBlocks,
    queryFn: () => api.listCalendarBlocks(),
  });

  useEffect(() => {
    const bookingId = searchParams.get("booking");
    if (!bookingId || bookings.length === 0) return;
    const match = bookings.find((row) => row.id === bookingId);
    if (match) {
      setSelectedBooking(match);
      setCurrentDate(new Date(match.start_at));
      setView("day");
    }
  }, [searchParams, bookings]);

  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (!dateParam) return;
    const parsed = new Date(`${dateParam}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setCurrentDate(parsed);
    setView("day");
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const dateParam = searchParams.get("date");
    const startParam = searchParams.get("start");
    const parsed = startParam
      ? new Date(startParam)
      : dateParam
        ? new Date(`${dateParam}T09:00:00`)
        : new Date();
    setManualBookingStart(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
    setManualBookingClientId(searchParams.get("client"));
    setManualBookingOpen(true);
  }, [searchParams]);

  // Entry point for the command palette's "Block time off" action.
  useEffect(() => {
    if (searchParams.get("block") !== "1") return;
    setBlockInitialDate(new Date());
    setBlockDialogOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!me) return;
    if (!canSeeAll) setStaffFilter("me");
  }, [me, canSeeAll]);

  const visibleBookings = useMemo(() => {
    if (staffFilter === "all" || !canSeeAll) return bookings;
    if (staffFilter === "me") return bookings.filter((row) => row.assigned_user_id === me?.id);
    return bookings.filter((row) => row.assigned_user_id === staffFilter);
  }, [bookings, staffFilter, canSeeAll, me?.id]);

  const bookingsByDate = useMemo(() => {
    const mapped: Record<string, BookingListItem[]> = {};
    for (const row of visibleBookings) {
      const key = localDateKey(new Date(row.start_at));
      if (!mapped[key]) mapped[key] = [];
      mapped[key].push(row);
    }
    for (const key of Object.keys(mapped)) {
      mapped[key].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return mapped;
  }, [visibleBookings]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const monthCells = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [currentDate]);

  const dayBookings = bookingsByDate[localDateKey(currentDate)] ?? [];
  const blocksForDate = (date: Date) => {
    const key = localDateKey(date);
    return calendarBlocks.filter((block) => block.start_date <= key && block.end_date >= key);
  };

  const headerLabel = useMemo(() => {
    if (view === "day") {
      return currentDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    if (view === "week") {
      const end = addDays(startOfWeek(currentDate), 6);
      return `${startOfWeek(currentDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [currentDate, view]);

  const shiftDate = (direction: -1 | 1) => {
    if (view === "month") setCurrentDate(addMonths(currentDate, direction));
    else if (view === "week") setCurrentDate(addDays(currentDate, direction * 7));
    else setCurrentDate(addDays(currentDate, direction));
  };

  const openBooking = (booking: BookingListItem) => {
    setSelectedBooking(booking);
    const next = new URLSearchParams(searchParams);
    next.set("booking", booking.id);
    setSearchParams(next, { replace: true });
  };

  const closeBooking = () => {
    setSelectedBooking(null);
    setOutcomeError("");
    const next = new URLSearchParams(searchParams);
    next.delete("booking");
    setSearchParams(next, { replace: true });
  };

  const openManualBooking = (start?: Date) => {
    setManualBookingStart(start ?? currentDate);
    setManualBookingClientId(null);
    setManualBookingOpen(true);
  };

  const closeManualBooking = () => {
    setManualBookingOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.delete("client");
    next.delete("start");
    setSearchParams(next, { replace: true });
  };

  const openBlockDialog = (date = currentDate) => {
    setBlockInitialDate(date);
    setBlockDialogOpen(true);
  };

  const deleteBlock = async (blockId: string) => {
    try {
      await api.deleteCalendarBlock(blockId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.calendarBlocks });
    } catch (err) {
      setOutcomeError(err instanceof Error ? err.message : "Unable to remove calendar block.");
    }
  };

  const updateOutcomeMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "completed" | "no_show" | "cancelled" | "confirmed" }) =>
      api.updateBookingStatus(id, status),
    onSuccess: (updated) => {
      queryClient.setQueryData<BookingListItem[]>(queryKeys.bookings, (rows) =>
        (rows ?? []).map((row) => (row.id === updated.id ? updated : row))
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.balanceTracking });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
      setSelectedBooking(updated);
    },
  });

  const updateOutcome = async (status: "completed" | "no_show" | "cancelled" | "confirmed") => {
    if (!selectedBooking) return;
    setOutcomeError("");
    setOutcomeUpdating(status);
    try {
      const updated = await updateOutcomeMutation.mutateAsync({ id: selectedBooking.id, status });
      if (
        status === "completed" &&
        updated.payment &&
        updated.payment.balance_due > 0 &&
        updated.payment.payment_state === "deposit_paid"
      ) {
        setBalanceTarget({
          bookingId: updated.id,
          clientName: bookingClientLabel(updated),
          serviceName: updated.service_name,
          balanceDue: updated.payment.balance_due,
        });
      }
    } catch (err) {
      setOutcomeError(err instanceof Error ? err.message : "Unable to update appointment outcome.");
    } finally {
      setOutcomeUpdating(null);
    }
  };

  const bookingChip = (booking: BookingListItem, compact = false) => (
    <button
      key={booking.id}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openBooking(booking);
      }}
      className={`w-full rounded-lg border text-left transition-shadow hover:shadow-sm ${statusBlockClass(
        booking.status,
      )} ${ASSIGNEE_BORDERS[assigneeColorIndex(booking.assigned_user_id)]} ${compact ? "mb-1 px-2 py-1.5" : "mb-2 p-2.5"}`}
    >
      <div className="flex items-center gap-1.5">
        <User className={compact ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
        <span className="truncate text-xs font-semibold">{bookingClientLabel(booking)}</span>
      </div>
      {compact ? (
        <div className="mt-0.5 truncate text-xs opacity-80">
          {isAllDayBooking(booking) ? "All day" : formatTime(booking.start_at)} · {booking.service_name}
          {canSeeAll && booking.assigned_name ? ` · ${booking.assigned_name}` : ""}
        </div>
      ) : (
        <>
          <div className="mt-1 truncate text-xs opacity-90">{booking.service_name}</div>
          {booking.listing_name && (
            <div className="truncate text-xs opacity-70">{booking.listing_name}</div>
          )}
          {canSeeAll && booking.assigned_name ? (
            <div className="truncate text-xs opacity-70">{booking.assigned_name}</div>
          ) : null}
          <div className="mt-1 flex items-center gap-1 text-xs opacity-80">
            <Clock className="h-3 w-3 shrink-0" />
            {bookingWhenLabel(booking)}
          </div>
        </>
      )}
    </button>
  );

  const agendaDays = useMemo(() => {
    if (view === "day") return [currentDate];
    if (view === "week") return weekDays;
    return monthCells.filter((day) => day.getMonth() === currentDate.getMonth());
  }, [view, currentDate, weekDays, monthCells]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description="Everything booked, blocked, and open — across the month, week, or day."
        actions={
          <>
            {canSeeAll && (team?.members?.length ?? 0) > 1 && (
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={staffFilter}
                onChange={(event) => setStaffFilter(event.target.value)}
              >
                <option value="all">All staff</option>
                <option value="me">Me</option>
                {(team?.members ?? [])
                  .filter((member) => member.is_active)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name}
                    </option>
                  ))}
              </select>
            )}
            <Button onClick={() => openManualBooking(new Date())}>
              <Plus className="mr-2 h-4 w-4" />
              New booking
            </Button>
            <Button variant="outline" onClick={() => openBlockDialog(new Date())}>
              <CalendarOff className="mr-2 h-4 w-4" />
              Block time
            </Button>
            <Button variant="outline" onClick={() => navigate("/dashboard/availability")}>
              <Clock className="mr-2 h-4 w-4" />
              Availability
            </Button>
          </>
        }
      />

      {canSeeAll && (team?.members?.length ?? 0) > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {(team?.members ?? [])
            .filter((member) => member.is_active)
            .map((member) => (
              <span key={member.id} className="inline-flex items-center gap-1.5">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${ASSIGNEE_DOTS[assigneeColorIndex(member.id)]}`}
                />
                {member.full_name}
              </span>
            ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftDate(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shiftDate(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <div className="flex min-w-0 items-center gap-2 pl-1">
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-semibold text-foreground">{headerLabel}</span>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["month", "week", "day"] as CalendarView[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                view === mode
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {bookingsLoading ? (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Phones get a scannable agenda list instead of a horizontally scrolling grid. */}
          <div className="rounded-xl border border-border bg-card lg:hidden">
            {agendaDays.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={CalendarIcon} title="Nothing in this range" />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {agendaDays.map((day) => {
                  const key = localDateKey(day);
                  const items = bookingsByDate[key] ?? [];
                  const dayBlocks = blocksForDate(day);
                  const isToday = key === localDateKey(new Date());
                  if (items.length === 0 && dayBlocks.length === 0 && view === "month") return null;
                  return (
                    <div key={key} className="p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p
                          className={`text-sm font-semibold ${
                            isToday ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {day.toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                          {isToday ? " · Today" : ""}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const start = new Date(day);
                            start.setHours(9, 0, 0, 0);
                            openManualBooking(start);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {dayBlocks.map((block) => (
                        <div
                          key={block.id}
                          className="mb-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs font-medium text-destructive"
                        >
                          Blocked{block.reason ? ` · ${block.reason}` : ""}
                        </div>
                      ))}
                      {items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing booked.</p>
                      ) : (
                        items.map((booking) => bookingChip(booking))
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hidden lg:block">
      {view === "month" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 border-b border-border bg-muted/40">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                  <div key={label} className="p-3 text-center text-sm font-medium text-muted-foreground border-r border-border last:border-r-0">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthCells.map((day) => {
                  const key = localDateKey(day);
                  const inMonth = day.getMonth() === currentDate.getMonth();
                  const isToday = key === localDateKey(new Date());
                  const dayItems = bookingsByDate[key] ?? [];
                  const dayBlocks = blocksForDate(day);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setCurrentDate(day);
                        setView("day");
                      }}
                      className={`min-h-[112px] border-b border-r border-border p-2 text-left align-top transition-colors hover:bg-muted/40 ${
                        dayBlocks.length > 0
                          ? "bg-destructive/6"
                          : inMonth
                            ? "bg-card"
                            : "bg-muted/25"
                      } ${isToday ? "ring-1 ring-inset ring-primary/40" : ""}`}
                    >
                      <div
                        className={`mb-1 text-sm tabular-nums ${
                          inMonth ? "text-foreground" : "text-muted-foreground/60"
                        } ${isToday ? "font-semibold text-primary" : ""}`}
                      >
                        {day.getDate()}
                      </div>
                      {dayBlocks.length > 0 && (
                        <p className="mb-1 truncate rounded bg-destructive/12 px-1.5 py-1 text-xs font-medium text-destructive">
                          Blocked{dayBlocks[0].reason ? ` · ${dayBlocks[0].reason}` : ""}
                        </p>
                      )}
                      <div className="space-y-0.5">
                        {dayItems.slice(0, 2).map((booking) => bookingChip(booking, true))}
                        {dayItems.length > 2 && (
                          <p className="px-1 text-xs font-medium text-muted-foreground">
                            +{dayItems.length - 2} more
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="workspace-scroll overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-8 border-b border-border">
                  <div className="border-r border-border bg-muted/40 p-4">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Time
                    </span>
                  </div>
                  {weekDays.map((day) => {
                    const key = localDateKey(day);
                    const isToday = key === localDateKey(new Date());
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setCurrentDate(day);
                          setView("day");
                        }}
                        className={`border-r border-border p-4 text-center transition-colors hover:bg-muted/60 ${
                          isToday ? "bg-primary/10" : "bg-muted/40"
                        }`}
                      >
                        <div className={`text-sm font-medium ${isToday ? "text-primary" : ""}`}>
                          {day.toLocaleDateString("en-US", { weekday: "short" })} {day.getDate()}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-8 border-b border-border bg-[var(--warning-surface)]/25">
                  <div className="border-r border-border bg-[var(--warning-surface)]/60 p-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-[var(--warning-on-surface)]">
                      All day
                    </span>
                  </div>
                  {weekDays.map((day) => {
                    const key = localDateKey(day);
                    const allDayItems = (bookingsByDate[key] ?? []).filter(isAllDayBooking);
                    const dayBlocks = blocksForDate(day);
                    return (
                      <div key={`allday-${key}`} className="min-h-[56px] border-r border-border p-2">
                        {dayBlocks.map((block) => (
                          <div
                            key={block.id}
                            className="mb-1 truncate rounded border border-destructive/30 bg-destructive/8 px-2 py-1 text-xs font-medium text-destructive"
                          >
                            Blocked{block.reason ? ` · ${block.reason}` : ""}
                          </div>
                        ))}
                        {allDayItems.map((booking) => bookingChip(booking, true))}
                      </div>
                    );
                  })}
                </div>
                {HOURS.map((hour) => (
                  <div key={hour} className="grid grid-cols-8 border-b border-border">
                    <div className="border-r border-border bg-muted/40 p-4">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {String(hour).padStart(2, "0")}:00
                      </span>
                    </div>
                    {weekDays.map((day) => {
                      const key = localDateKey(day);
                      const blocked = blocksForDate(day).length > 0;
                      const hourBookings = (bookingsByDate[key] ?? []).filter(
                        (booking) =>
                          !isAllDayBooking(booking) && new Date(booking.start_at).getHours() === hour
                      );
                      return (
                        <div
                          key={`${key}-${hour}`}
                          className={`min-h-[80px] border-r border-border p-2 ${
                            blocked ? "bg-destructive/5" : "cursor-pointer hover:bg-muted/30"
                          }`}
                          onClick={() => {
                            if (blocked) return;
                            const start = new Date(day);
                            start.setHours(hour, 0, 0, 0);
                            openManualBooking(start);
                          }}
                        >
                          {hourBookings.map((booking) => bookingChip(booking))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
      )}

      {view === "day" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="divide-y divide-border">
              <div className="grid min-h-[72px] grid-cols-[88px_1fr] bg-[var(--warning-surface)]/25">
                <div className="border-r border-border bg-[var(--warning-surface)]/60 p-4">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--warning-on-surface)]">
                    All day
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  {blocksForDate(currentDate).map((block) => (
                    <div
                      key={block.id}
                      className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm font-medium text-destructive"
                    >
                      Calendar blocked{block.reason ? ` · ${block.reason}` : ""}
                    </div>
                  ))}
                  {dayBookings.filter(isAllDayBooking).length === 0 &&
                  blocksForDate(currentDate).length === 0 ? (
                    <div className="h-full min-h-[40px] rounded-lg border border-dashed border-[var(--warning-on-surface)]/25" />
                  ) : (
                    dayBookings.filter(isAllDayBooking).map((booking) => bookingChip(booking))
                  )}
                </div>
              </div>
              {HOURS.map((hour) => {
                const blocked = blocksForDate(currentDate).length > 0;
                const hourBookings = dayBookings.filter(
                  (booking) =>
                    !isAllDayBooking(booking) && new Date(booking.start_at).getHours() === hour
                );
                return (
                  <div key={hour} className="grid min-h-[88px] grid-cols-[88px_1fr]">
                    <div className="border-r border-border bg-muted/40 p-4">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {String(hour).padStart(2, "0")}:00
                      </span>
                    </div>
                    <div
                      className={`space-y-2 p-3 ${
                        blocked ? "bg-destructive/5" : "cursor-pointer hover:bg-muted/30"
                      }`}
                      onClick={() => {
                        if (blocked) return;
                        const start = new Date(currentDate);
                        start.setHours(hour, 0, 0, 0);
                        openManualBooking(start);
                      }}
                    >
                      {hourBookings.length === 0 ? (
                        <div className="h-full min-h-[56px] rounded-lg border border-dashed border-border" />
                      ) : (
                        hourBookings.map((booking) => bookingChip(booking))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      )}
          </div>
        </>
      )}

      {outcomeError && <ErrorNote>{outcomeError}</ErrorNote>}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Status key
        </span>
        {LEGEND_STATUSES.map((status) => (
          <div key={status} className="flex items-center gap-2">
            <span className={`h-3.5 w-3.5 rounded border ${statusBlockClass(status)}`} />
            <StatusBadge status={status} className="bg-transparent px-0 text-foreground" />
          </div>
        ))}
      </div>

      {calendarBlocks.length > 0 && (
        <SectionCard
          title="Blocked dates"
          description="Remove a block when you're ready to accept bookings again."
          contentClassName="space-y-2"
        >
          {calendarBlocks.map((block) => (
            <div
              key={block.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {new Date(`${block.start_date}T00:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {block.end_date !== block.start_date &&
                    ` – ${new Date(`${block.end_date}T00:00:00`).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}`}
                </p>
                {block.reason && <p className="text-sm text-muted-foreground">{block.reason}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove calendar block"
                onClick={() => void deleteBlock(block.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </SectionCard>
      )}

      <Sheet open={Boolean(selectedBooking)} onOpenChange={(open) => !open && closeBooking()}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          {selectedBooking && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedBooking.service_name}</SheetTitle>
                <SheetDescription>Appointment details</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {selectedBooking.status === "no_show" ? "No-show" : selectedBooking.status}
                  </Badge>
                  {selectedBooking.appointment_format && (
                    <Badge variant="outline" className="capitalize">
                      {selectedBooking.appointment_format === "online" ? "Online" : "In person"}
                    </Badge>
                  )}
                  {selectedBooking.booking_source === "dashboard" && (
                    <Badge variant="outline">Staff-created</Badge>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">When</p>
                  <p className="text-sm font-medium text-foreground">
                    {new Date(selectedBooking.start_at).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-sm text-foreground/80">
                    {isAllDayBooking(selectedBooking)
                      ? "All day"
                      : selectedBooking.scheduling_mode === "flexible"
                        ? `${formatRange(selectedBooking.start_at, selectedBooking.end_at)} · Typical ~${
                            selectedBooking.service_duration_minutes ??
                            durationMinutes(selectedBooking.start_at, selectedBooking.end_at)
                          } min`
                        : `${formatRange(selectedBooking.start_at, selectedBooking.end_at)} · ${durationMinutes(
                            selectedBooking.start_at,
                            selectedBooking.end_at
                          )} min`}
                  </p>
                </div>

                {selectedBooking.listing_name && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Product</p>
                    <p className="text-sm font-medium text-foreground">{selectedBooking.listing_name}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Client</p>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <User className="w-4 h-4 text-muted-foreground" />
                    {bookingClientLabel(selectedBooking)}
                  </div>
                  {selectedBooking.client_email && (
                    <div className="flex items-center gap-2 text-sm text-foreground/80">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      {selectedBooking.client_email}
                    </div>
                  )}
                  {selectedBooking.client_phone && (
                    <div className="flex items-center gap-2 text-sm text-foreground/80">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      {selectedBooking.client_phone}
                    </div>
                  )}
                </div>

                {(selectedBooking.host_name || selectedBooking.location) && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Appointment</p>
                    {selectedBooking.host_name && (
                      <p className="text-sm text-foreground/90">
                        Host: {selectedBooking.host_name}
                        {selectedBooking.host_title ? ` (${selectedBooking.host_title})` : ""}
                      </p>
                    )}
                    {canReassign && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Reassign</p>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={selectedBooking.assigned_user_id || ""}
                          onChange={async (event) => {
                            const nextId = event.target.value;
                            if (!nextId) return;
                            const updated = await api.reassignBooking(selectedBooking.id, nextId);
                            setSelectedBooking(updated);
                            await queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
                          }}
                        >
                          {(team?.members ?? [])
                            .filter((member) => member.is_active && member.is_bookable)
                            .map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.full_name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    {selectedBooking.location && (
                      <div className="flex items-start gap-2 text-sm text-foreground/80">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        {isLikelyUrl(selectedBooking.location) ? (
                          <a
                            href={selectedBooking.location}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline break-all"
                          >
                            {selectedBooking.location}
                          </a>
                        ) : (
                          <span>{selectedBooking.location}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {selectedBooking.notes && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedBooking.notes}</p>
                  </div>
                )}

                {selectedBooking.payment && selectedBooking.payment.deposit_amount > 0 && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Service total</p>
                        <p className="font-medium">₦{selectedBooking.payment.service_price.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Collected</p>
                        <p className="font-medium">₦{selectedBooking.payment.collected_total.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Balance due</p>
                        <p className="font-medium">₦{selectedBooking.payment.balance_due.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Status</p>
                        <p className="font-medium capitalize">
                          {selectedBooking.payment.payment_state.replace("_", " ")}
                        </p>
                      </div>
                    </div>
                    {selectedBooking.payment.balance_due > 0 &&
                      selectedBooking.payment.payment_state === "deposit_paid" && (
                        <Button
                          size="sm"
                          className="mt-1"
                          onClick={() =>
                            setBalanceTarget({
                              bookingId: selectedBooking.id,
                              clientName: bookingClientLabel(selectedBooking),
                              serviceName: selectedBooking.service_name,
                              balanceDue: selectedBooking.payment!.balance_due,
                            })
                          }
                        >
                          Record balance payment
                        </Button>
                      )}
                  </div>
                )}

                <div className="space-y-3 pt-2 border-t border-border">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Appointment outcome</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Mark whether the client attended, missed, or cancelled this appointment.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant={selectedBooking.status === "completed" ? "default" : "outline"}
                      loading={outcomeUpdating === "completed"}
                      loadingLabel="Saving..."
                      disabled={outcomeUpdating !== null}
                      onClick={() => void updateOutcome("completed")}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Mark completed
                    </Button>
                    <Button
                      variant={selectedBooking.status === "no_show" ? "default" : "outline"}
                      loading={outcomeUpdating === "no_show"}
                      loadingLabel="Saving..."
                      disabled={outcomeUpdating !== null}
                      onClick={() => void updateOutcome("no_show")}
                    >
                      <UserX className="w-4 h-4 mr-2" />
                      Mark no-show
                    </Button>
                    <Button
                      variant={selectedBooking.status === "cancelled" ? "default" : "outline"}
                      loading={outcomeUpdating === "cancelled"}
                      loadingLabel="Saving..."
                      disabled={outcomeUpdating !== null}
                      onClick={() => void updateOutcome("cancelled")}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Mark cancelled
                    </Button>
                    {(selectedBooking.status === "completed" ||
                      selectedBooking.status === "no_show" ||
                      selectedBooking.status === "cancelled") && (
                      <Button
                        variant="ghost"
                        loading={outcomeUpdating === "confirmed"}
                        loadingLabel="Saving..."
                        disabled={outcomeUpdating !== null}
                        onClick={() => void updateOutcome("confirmed")}
                      >
                        Reopen as confirmed
                      </Button>
                    )}
                  </div>
                  {outcomeError && <ErrorNote>{outcomeError}</ErrorNote>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <RecordBalanceDialog
        open={balanceTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBalanceTarget(null);
        }}
        bookingId={balanceTarget?.bookingId ?? ""}
        clientName={balanceTarget?.clientName ?? ""}
        serviceName={balanceTarget?.serviceName ?? ""}
        balanceDue={balanceTarget?.balanceDue ?? 0}
        onSubmit={async (payload) => {
          if (!balanceTarget) return;
          const updated = await api.recordBookingBalance(balanceTarget.bookingId, payload);
          queryClient.setQueryData<BookingListItem[]>(queryKeys.bookings, (rows) =>
            (rows ?? []).map((row) => (row.id === updated.id ? updated : row)),
          );
          setSelectedBooking(updated);
          void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
          void queryClient.invalidateQueries({ queryKey: queryKeys.balanceTracking });
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
        }}
      />

      <ManualBookingDialog
        open={manualBookingOpen}
        onOpenChange={(open) => {
          if (!open) closeManualBooking();
          else setManualBookingOpen(true);
        }}
        initialClientId={manualBookingClientId}
        initialStart={manualBookingStart}
        onCreated={(created) => {
          queryClient.setQueryData<BookingListItem[]>(queryKeys.bookings, (rows) => [
            ...(rows ?? []),
            created,
          ]);
          void queryClient.invalidateQueries({ queryKey: queryKeys.clients });
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardHomeStats });
          setCurrentDate(new Date(created.start_at));
          setView("day");
        }}
      />
      <CalendarBlockDialog
        open={blockDialogOpen}
        onOpenChange={setBlockDialogOpen}
        initialDate={blockInitialDate}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.calendarBlocks });
        }}
      />
    </PageShell>
  );
}
