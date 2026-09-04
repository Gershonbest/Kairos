// Tenant dashboard home with KPIs, charts, and upcoming appointments.

import { Button } from "../../components/ui/button";
import { CalendarClock, LinkIcon, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DashboardHomeHeader } from "../../components/dashboard-home/DashboardHomeHeader";
import { DashboardMiniCalendar } from "../../components/dashboard-home/DashboardMiniCalendar";
import { DashboardStatsRow } from "../../components/dashboard-home/DashboardStatsRow";
import { DashboardInsights } from "../../components/dashboard-home/DashboardInsights";
import { DashboardTodayTimeline } from "../../components/dashboard-home/DashboardTodayTimeline";
import {
  BrandAvatar,
  ChartSkeleton,
  EmptyState,
  ErrorNote,
  ListRow,
  ListSkeleton,
  PageShell,
  SectionCard,
  StatusBadge,
} from "../../components/dashboard-ui";
import { api, bookingClientLabel } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { useChartTheme } from "../../../lib/charts/useChartTheme";
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
  const chart = useChartTheme();
  const {
    data: summary,
    isError: summaryFailed,
    isPending: summaryLoading,
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
  const { data: tenant = null } = useQuery({
    queryKey: queryKeys.tenant,
    queryFn: () => api.myTenant(),
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
    <PageShell>
      {showWelcome && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-primary/30 bg-primary/8 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Welcome to your account</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {tenant?.setup_progress?.has_services
                ? "Your setup is complete. Share your booking link and start taking appointments."
                : "Your setup is complete. Add your first service to start taking appointments."}
            </p>
            {!tenant?.setup_progress?.has_services ? (
              <Button asChild size="sm" className="mt-3">
                <Link to="/dashboard/services">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add first service
                </Link>
              </Button>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setShowWelcome(false)}>
            Dismiss
          </Button>
        </div>
      )}

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
      {summaryError && <ErrorNote tone="warning">{summaryError}</ErrorNote>}

      <DashboardStatsRow stats={homeStats} loading={homeStatsLoading} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DashboardTodayTimeline bookings={bookings} loading={loadingAppointments} />
        <DashboardMiniCalendar bookings={bookings} />
      </div>

      <SectionCard
        title="Upcoming appointments"
        description="The next confirmed and pending bookings on your calendar."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/calendar">View calendar</Link>
          </Button>
        }
      >
        {loadingAppointments ? (
          <ListSkeleton rows={4} />
        ) : appointmentsError ? (
          <ErrorNote>{appointmentsError}</ErrorNote>
        ) : displayedAppointments.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming appointments"
            description="Once clients book through your link, their appointments appear here."
            action={
              <Button size="sm" asChild>
                <Link to="/dashboard/calendar?new=1">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add a booking
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {displayedAppointments.map((appointment) => (
              <ListRow key={appointment.id} to={`/dashboard/calendar?booking=${appointment.id}`}>
                <BrandAvatar name={appointment.client} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-foreground">{appointment.client}</p>
                    <StatusBadge status={appointment.status} />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {appointment.service}
                    {appointment.product ? ` · ${appointment.product}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium tabular-nums text-foreground">{appointment.time}</p>
                  <p className="text-xs text-muted-foreground">{appointment.date}</p>
                </div>
              </ListRow>
            ))}
          </div>
        )}
      </SectionCard>

      <DashboardInsights homeStats={homeStats} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Revenue overview" description="Collected revenue by month.">
          {summaryLoading ? (
            <ChartSkeleton height={250} />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueData}>
                <CartesianGrid key="grid" strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis key="x" dataKey="month" stroke={chart.axis} fontSize={12} />
                <YAxis key="y" stroke={chart.axis} fontSize={12} />
                <Tooltip
                  key="tooltip"
                  contentStyle={chart.tooltipStyle}
                  itemStyle={chart.tooltipItemStyle}
                  labelStyle={chart.tooltipLabelStyle}
                />
                <Line
                  key="revenue"
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-chart-1)", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Weekly bookings" description="Booking volume across the week.">
          {summaryLoading ? (
            <ChartSkeleton height={250} />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bookingsData}>
                <CartesianGrid key="grid" strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis key="x" dataKey="day" stroke={chart.axis} fontSize={12} />
                <YAxis key="y" stroke={chart.axis} fontSize={12} />
                <Tooltip
                  key="tooltip"
                  cursor={{ fill: "var(--color-chart-grid)" }}
                  contentStyle={chart.tooltipStyle}
                  itemStyle={chart.tooltipItemStyle}
                  labelStyle={chart.tooltipLabelStyle}
                />
                <Bar key="bookings" dataKey="bookings" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Public booking links"
        description="Share these anywhere clients can reach you."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/booking-links">Manage links</Link>
          </Button>
        }
        contentClassName="space-y-4"
      >
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Main booking page</p>
          {bookingLinks?.business_url ? (
            <a
              href={normalizeToCurrentOrigin(bookingLinks.business_url)}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm text-primary hover:underline"
            >
              {normalizeToCurrentOrigin(bookingLinks.business_url)}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </div>
        {bookingLinks?.service_urls?.length ? (
          <div className="space-y-3 border-t border-border pt-4">
            {bookingLinks.service_urls.slice(0, 5).map((link) => (
              <div key={link.service_id}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{link.service_name}</p>
                <a
                  href={normalizeToCurrentOrigin(link.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sm text-primary hover:underline"
                >
                  {normalizeToCurrentOrigin(link.url)}
                </a>
              </div>
            ))}
          </div>
        ) : bookingLinks ? (
          <EmptyState
            icon={LinkIcon}
            title="No service links yet"
            description="Add a service to generate a direct booking link for it."
            action={
              <Button size="sm" asChild>
                <Link to="/dashboard/services">Add a service</Link>
              </Button>
            }
          />
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
