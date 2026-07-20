// Calendar view of tenant bookings with month/week/day layouts.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Calendar as CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight, Clock, Mail, MapPin, Phone, User, UserX, XCircle } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { api, type BookingListItem } from "../../../lib/api/client";

type CalendarView = "month" | "week" | "day";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-primary/10 border-primary/30 text-primary dark:bg-primary/20 dark:border-primary/40 dark:text-primary-foreground",
  pending: "bg-blue-100 border-blue-300 text-blue-900 dark:bg-blue-500/20 dark:border-blue-400/40 dark:text-blue-100",
  completed: "bg-green-100 border-green-300 text-green-900 dark:bg-green-500/20 dark:border-green-400/40 dark:text-green-100",
  cancelled: "bg-muted border-border text-muted-foreground",
  no_show: "bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-500/20 dark:border-amber-400/40 dark:text-amber-100",
};

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<BookingListItem | null>(null);
  const [outcomeUpdating, setOutcomeUpdating] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState("");

  useEffect(() => {
    api
      .listBookings()
      .then((rows) => setBookings(rows))
      .catch(() => setBookings([]));
  }, []);

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

  const bookingsByDate = useMemo(() => {
    const mapped: Record<string, BookingListItem[]> = {};
    for (const row of bookings) {
      const key = localDateKey(new Date(row.start_at));
      if (!mapped[key]) mapped[key] = [];
      mapped[key].push(row);
    }
    for (const key of Object.keys(mapped)) {
      mapped[key].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return mapped;
  }, [bookings]);

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

  const updateOutcome = async (status: "completed" | "no_show" | "cancelled" | "confirmed") => {
    if (!selectedBooking) return;
    setOutcomeError("");
    setOutcomeUpdating(status);
    try {
      const updated = await api.updateBookingStatus(selectedBooking.id, status);
      setBookings((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setSelectedBooking(updated);
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
      className={`w-full text-left border rounded-lg hover:shadow-md transition-shadow ${
        STATUS_STYLES[booking.status] ?? STATUS_STYLES.pending
      } ${compact ? "px-1.5 py-1 mb-1" : "p-2 mb-2"}`}
    >
      <div className="flex items-center gap-1">
        <User className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        <span className={`${compact ? "text-[10px]" : "text-xs"} font-medium truncate`}>
          {booking.client_name}
        </span>
      </div>
      {!compact && (
        <>
          <div className="text-xs truncate mt-0.5">{booking.service_name}</div>
          <div className="flex items-center gap-1 mt-1 text-xs">
            <Clock className="w-3 h-3" />
            {bookingWhenLabel(booking)}
          </div>
        </>
      )}
      {compact && (
        <div className="text-[10px] truncate">
          {isAllDayBooking(booking) ? "All day" : formatTime(booking.start_at)} · {booking.service_name}
        </div>
      )}
    </button>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Booking Calendar</h1>
          <p className="text-muted-foreground mt-1">Manage your appointments and schedule</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/dashboard/availability")}>
          <Clock className="w-4 h-4 mr-2" />
          Edit availability
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" size="icon" onClick={() => shiftDate(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-0">
                <CalendarIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{headerLabel}</span>
              </div>
              <Button variant="outline" size="icon" onClick={() => shiftDate(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
            </div>

            <div className="flex gap-2">
              {(["month", "week", "day"] as CalendarView[]).map((mode) => (
                <Button
                  key={mode}
                  variant={view === mode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setView(mode)}
                  className={view === mode ? "bg-primary hover:bg-primary/90 capitalize" : "capitalize"}
                >
                  {mode}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {view === "month" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
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
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setCurrentDate(day);
                        setView("day");
                      }}
                      className={`min-h-[110px] p-2 border-r border-b border-border text-left align-top hover:bg-muted/40 ${
                        inMonth ? "bg-card" : "bg-muted/30"
                      } ${isToday ? "ring-1 ring-inset ring-primary/40" : ""}`}
                    >
                      <div className={`text-sm mb-1 ${inMonth ? "text-foreground" : "text-muted-foreground"} ${isToday ? "font-semibold text-primary" : ""}`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dayItems.slice(0, 3).map((booking) => bookingChip(booking, true))}
                        {dayItems.length > 3 && (
                          <p className="text-[10px] text-muted-foreground px-1">+{dayItems.length - 3} more</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "week" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-8 border-b border-border">
                  <div className="p-4 bg-muted/40 border-r border-border">
                    <span className="text-sm font-medium text-muted-foreground">Time</span>
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
                        className={`p-4 text-center border-r border-border hover:bg-muted/60 ${
                          isToday ? "bg-primary/10" : "bg-muted/40"
                        }`}
                      >
                        <div className="text-sm font-medium">
                          {day.toLocaleDateString("en-US", { weekday: "short" })} {day.getDate()}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-8 border-b border-border bg-amber-100/40 dark:bg-amber-500/10">
                  <div className="p-3 bg-amber-100 dark:bg-amber-500/20 border-r border-border">
                    <span className="text-xs font-medium text-amber-900 dark:text-amber-100">All day</span>
                  </div>
                  {weekDays.map((day) => {
                    const key = localDateKey(day);
                    const allDayItems = (bookingsByDate[key] ?? []).filter(isAllDayBooking);
                    return (
                      <div key={`allday-${key}`} className="p-2 border-r border-border min-h-[56px]">
                        {allDayItems.map((booking) => bookingChip(booking, true))}
                      </div>
                    );
                  })}
                </div>
                {HOURS.map((hour) => (
                  <div key={hour} className="grid grid-cols-8 border-b border-border">
                    <div className="p-4 bg-muted/40 border-r border-border">
                      <span className="text-sm text-muted-foreground">{String(hour).padStart(2, "0")}:00</span>
                    </div>
                    {weekDays.map((day) => {
                      const key = localDateKey(day);
                      const hourBookings = (bookingsByDate[key] ?? []).filter(
                        (booking) =>
                          !isAllDayBooking(booking) && new Date(booking.start_at).getHours() === hour
                      );
                      return (
                        <div key={`${key}-${hour}`} className="p-2 border-r border-border min-h-[80px]">
                          {hourBookings.map((booking) => bookingChip(booking))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "day" && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              <div className="grid grid-cols-[88px_1fr] min-h-[72px] bg-amber-100/40 dark:bg-amber-500/10">
                <div className="p-4 bg-amber-100 dark:bg-amber-500/20 border-r border-border">
                  <span className="text-xs font-medium text-amber-900 dark:text-amber-100">All day</span>
                </div>
                <div className="p-3 space-y-2">
                  {dayBookings.filter(isAllDayBooking).length === 0 ? (
                    <div className="h-full min-h-[40px] rounded-lg border border-dashed border-amber-300/70 dark:border-amber-400/30" />
                  ) : (
                    dayBookings.filter(isAllDayBooking).map((booking) => bookingChip(booking))
                  )}
                </div>
              </div>
              {HOURS.map((hour) => {
                const hourBookings = dayBookings.filter(
                  (booking) =>
                    !isAllDayBooking(booking) && new Date(booking.start_at).getHours() === hour
                );
                return (
                  <div key={hour} className="grid grid-cols-[88px_1fr] min-h-[88px]">
                    <div className="p-4 bg-muted/40 border-r border-border">
                      <span className="text-sm text-muted-foreground">{String(hour).padStart(2, "0")}:00</span>
                    </div>
                    <div className="p-3 space-y-2">
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
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            {[
              { label: "Confirmed", className: "bg-primary/10 border-primary/30" },
              { label: "Pending", className: "bg-blue-100 border-blue-300" },
              { label: "Completed", className: "bg-green-100 border-green-300" },
              { label: "No-show", className: "bg-amber-100 border-amber-300" },
              { label: "Cancelled", className: "bg-muted border-border" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded border ${item.className}`} />
                <span className="text-sm">{item.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Client</p>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <User className="w-4 h-4 text-muted-foreground" />
                    {selectedBooking.client_name}
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
                      className={selectedBooking.status === "completed" ? "bg-green-600 hover:bg-green-700" : ""}
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
                      className={
                        selectedBooking.status === "no_show"
                          ? "bg-amber-600 hover:bg-amber-700 text-white"
                          : ""
                      }
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
                      className={selectedBooking.status === "cancelled" ? "bg-gray-700 hover:bg-gray-800" : ""}
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
                  {outcomeError && <p className="text-sm text-red-600">{outcomeError}</p>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
