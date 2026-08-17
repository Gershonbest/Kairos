// Tenant dashboard home with KPIs, charts, and upcoming appointments.

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  DollarSign,
  TrendingUp,
  Clock,
  Plus,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { DashboardHomeHeader } from "../../components/dashboard-home/DashboardHomeHeader";
import { DashboardMiniCalendar } from "../../components/dashboard-home/DashboardMiniCalendar";
import { DashboardStatsRow } from "../../components/dashboard-home/DashboardStatsRow";
import { api, bookingClientLabel } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { consumeWelcomeAfterPayment } from "../../../lib/auth/welcome";

const PUBLIC_UI_BASE_URL =
  ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_PUBLIC_UI_BASE_URL ?? "").trim();

function normalizeToCurrentOrigin(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (PUBLIC_UI_BASE_URL) {
      const base = PUBLIC_UI_BASE_URL.replace(/\/$/, "");
      return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function formatAppointmentTime(startAt: string): string {
  return new Date(startAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatAppointmentDate(startAt: string): string {
  return new Date(startAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function buildUpcomingAppointments(
  bookings: Array<{
    id: string;
    status: string;
    start_at: string;
    client_name: string;
    client_profile_name?: string | null;
    service_name: string;
    listing_name?: string | null;
  }>
) {
  const now = Date.now();
  return bookings
    .filter(
      (booking) =>
        new Date(booking.start_at).getTime() >= now &&
        (booking.status === "pending" || booking.status === "confirmed")
    )
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .slice(0, 6)
    .map((booking) => ({
      id: booking.id,
      client: bookingClientLabel(booking),
      service: booking.service_name,
      product: booking.listing_name ?? null,
      status: booking.status,
      start_at: booking.start_at,
      time: formatAppointmentTime(booking.start_at),
      date: formatAppointmentDate(booking.start_at),
    }));
}

export function Dashboard() {
  const [showWelcome, setShowWelcome] = useState(() => consumeWelcomeAfterPayment());
  const {
    data: summary,
    isError: summaryFailed,
  } = useQuery({
    queryKey: queryKeys.dashboardSummary,
    queryFn: () => api.dashboardSummary(),
  });
  const {
    data: bookings = [],
    isPending: loadingAppointments,
    isError: appointmentsFailed,
  } = useQuery({
    queryKey: queryKeys.bookings,
    queryFn: () => api.listBookings(),
  });
  const { data: bookingLinks = null } = useQuery({
    queryKey: queryKeys.bookingLinks,
    queryFn: () => api.getBookingLinks(),
  });
  const { data: homeStats = null, isPending: homeStatsLoading } = useQuery({
    queryKey: queryKeys.dashboardHomeStats,
    queryFn: () => api.dashboardHomeStats(),
  });
  const { data: me = null } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.me(),
  });

  const summaryError = summaryFailed ? "Unable to load dashboard metrics." : "";
  const appointmentsError = appointmentsFailed ? "Unable to load upcoming appointments." : "";
  const upcomingAppointments = useMemo(() => buildUpcomingAppointments(bookings), [bookings]);

  const revenueData = summary?.revenue_series ?? [];
  const bookingsData = summary?.bookings_series ?? [];
  const displayedAppointments = useMemo(() => {
    if (upcomingAppointments.length > 0) {
      return upcomingAppointments;
    }
    return summary?.upcoming_appointments ?? [];
  }, [summary?.upcoming_appointments, upcomingAppointments]);

  return (
    <div className="p-6 space-y-6">
      {showWelcome && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
              Welcome to your account
            </h2>
            <p className="text-sm text-emerald-800/80 dark:text-emerald-300/90 mt-1">
              Your plan is active and you&apos;re all set. Explore your dashboard, share your booking link, and start
              taking appointments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWelcome(false)}
            className="text-sm text-emerald-800 dark:text-emerald-300 hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <DashboardHomeHeader
        firstName={me?.full_name?.trim().split(/\s+/)[0] ?? null}
        action={
          <Button asChild className="w-full sm:w-auto">
            <Link to="/dashboard/calendar?new=1">
              <Plus className="w-4 h-4 mr-2" />
              New booking
            </Link>
          </Button>
        }
      />
      {summaryError && <p className="text-sm text-amber-700">{summaryError}</p>}

      <DashboardStatsRow stats={homeStats} loading={homeStatsLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Appointments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming Appointments</CardTitle>
            <Button variant="link" className="text-primary" asChild>
              <Link to="/dashboard/calendar">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loadingAppointments ? (
                <BrandLoader label="Loading appointments" />
              ) : (
                displayedAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-medium">
                        {appointment.client
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{appointment.client}</h4>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full capitalize ${
                              appointment.status === "confirmed"
                                ? "bg-primary/10 text-primary"
                                : "bg-accent/20 text-accent-foreground"
                            }`}
                          >
                            {appointment.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{appointment.service}</p>
                        {appointment.product && (
                          <p className="text-xs text-muted-foreground">Product: {appointment.product}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{appointment.time}</p>
                      <p className="text-sm text-muted-foreground">{appointment.date}</p>
                    </div>
                  </div>
                ))
              )}
              {!loadingAppointments && appointmentsError && (
                <p className="text-sm text-red-600">{appointmentsError}</p>
              )}
              {!loadingAppointments && !appointmentsError && displayedAppointments.length === 0 && (
                <p className="text-sm text-muted-foreground">No upcoming appointments yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
        <DashboardMiniCalendar bookings={bookings} />
      </div>

      {/* AI Insights */}
      <Card className="bg-gradient-to-br from-primary/5 via-background to-accent/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            AI-Generated Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-4 bg-card rounded-lg border border-primary/10">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                <TrendingUp className="w-3 h-3 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-1">Peak Performance Day</h4>
                <p className="text-sm text-muted-foreground">
                  Booking trends update from your own data. Use weekly chart patterns to tune pricing and availability.
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-card rounded-lg border border-primary/10">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/25 flex items-center justify-center mt-0.5">
                <Clock className="w-3 h-3 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-1">Optimize Your Schedule</h4>
                <p className="text-sm text-muted-foreground">
                  Open low-demand slots with promo offers to improve occupancy and reduce idle hours.
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-card rounded-lg border border-primary/10">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/25 flex items-center justify-center mt-0.5">
                <DollarSign className="w-3 h-3 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-1">Revenue Opportunity</h4>
                <p className="text-sm text-muted-foreground">
                  Deposit conversion and average booking value are now driven from live tenant transactions.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueData}>
                <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis key="x" dataKey="month" stroke="#888888" />
                <YAxis key="y" stroke="#888888" />
                <Tooltip
                  key="tooltip"
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  key="revenue"
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-primary)", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bookingsData}>
                <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis key="x" dataKey="day" stroke="#888888" />
                <YAxis key="y" stroke="#888888" />
                <Tooltip
                  key="tooltip"
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                />
                <Bar key="bookings" dataKey="bookings" fill="var(--color-accent)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Public Booking Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Main booking page (all services)</p>
            <a href={bookingLinks?.business_url ? normalizeToCurrentOrigin(bookingLinks.business_url) : undefined} target="_blank" rel="noreferrer" className="text-sm text-primary break-all">
              {bookingLinks?.business_url ? normalizeToCurrentOrigin(bookingLinks.business_url) : "Loading..."}
            </a>
          </div>
          {bookingLinks?.service_urls?.slice(0, 5).map((link) => (
            <div key={link.service_id}>
              <p className="text-sm text-muted-foreground mb-1">{link.service_name}</p>
              <a href={normalizeToCurrentOrigin(link.url)} target="_blank" rel="noreferrer" className="text-sm text-primary break-all">
                {normalizeToCurrentOrigin(link.url)}
              </a>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
