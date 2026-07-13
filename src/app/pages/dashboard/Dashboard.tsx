// Tenant dashboard home with KPIs, charts, and upcoming appointments.

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../../../lib/api/client";

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
    service_name: string;
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
      client: booking.client_name,
      service: booking.service_name,
      status: booking.status,
      start_at: booking.start_at,
      time: formatAppointmentTime(booking.start_at),
      date: formatAppointmentDate(booking.start_at),
    }));
}

export function Dashboard() {
  const [summary, setSummary] = useState<{
    stats: {
      total_bookings: number;
      monthly_revenue: number;
      active_clients: number;
      avg_booking_value: number;
      bookings_change_pct: number;
      revenue_change_pct: number;
    };
    revenue_series: Array<{ month: string; revenue: number }>;
    bookings_series: Array<{ day: string; bookings: number }>;
    upcoming_appointments: Array<{
      id: string;
      client: string;
      service: string;
      status: string;
      start_at: string;
      time: string;
      date: string;
    }>;
  } | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    Array<{
      id: string;
      client: string;
      service: string;
      status: string;
      start_at: string;
      time: string;
      date: string;
    }>
  >([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [appointmentsError, setAppointmentsError] = useState("");
  const [bookingLinks, setBookingLinks] = useState<{
    business_url: string;
    service_urls: Array<{ service_id: string; service_name: string; url: string }>;
  } | null>(null);

  useEffect(() => {
    api
      .dashboardSummary()
      .then((data) => {
        setSummary(data);
        setSummaryError("");
      })
      .catch(() => setSummaryError("Unable to load dashboard metrics."));

    api.getBookingLinks().then(setBookingLinks).catch(() => null);

    api
      .listBookings()
      .then((bookings) => {
        setUpcomingAppointments(buildUpcomingAppointments(bookings));
        setAppointmentsError("");
      })
      .catch(() => {
        setUpcomingAppointments([]);
        setAppointmentsError("Unable to load upcoming appointments.");
      })
      .finally(() => setLoadingAppointments(false));
  }, []);

  const stats = summary?.stats;
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-gray-600 mt-1">Live business metrics from your account data.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link to="/dashboard/calendar">
              <Calendar className="w-4 h-4 mr-2" />
              View Calendar
            </Link>
          </Button>
          <Button className="bg-[#7c3aed] hover:bg-[#6d28d9]" asChild>
            <Link to="/dashboard/booking-links">
              <Plus className="w-4 h-4 mr-2" />
              Share Booking Link
            </Link>
          </Button>
        </div>
      </div>
      {summaryError && <p className="text-sm text-amber-700">{summaryError}</p>}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Bookings</CardTitle>
            <Calendar className="w-4 h-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats?.total_bookings ?? 0}</div>
            <p className="text-xs text-[#22c55e] flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3 h-3" />
              <span>{stats?.bookings_change_pct ?? 0}% from last month</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Monthly Revenue</CardTitle>
            <DollarSign className="w-4 h-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">${(stats?.monthly_revenue ?? 0).toFixed(2)}</div>
            <p className="text-xs text-[#22c55e] flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3 h-3" />
              <span>{stats?.revenue_change_pct ?? 0}% from last month</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Clients</CardTitle>
            <Users className="w-4 h-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats?.active_clients ?? 0}</div>
            <p className="text-xs text-gray-600 mt-2">Unique clients in your tenant account</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Avg. Booking Value</CardTitle>
            <TrendingUp className="w-4 h-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">${(stats?.avg_booking_value ?? 0).toFixed(2)}</div>
            <p className="text-xs text-gray-600 mt-2">Current month revenue / bookings</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Appointments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Upcoming Appointments</CardTitle>
          <Button variant="link" className="text-[#7c3aed]" asChild>
            <Link to="/dashboard/calendar">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {loadingAppointments ? (
              <p className="text-sm text-gray-500">Loading appointments...</p>
            ) : (
              displayedAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] flex items-center justify-center text-white font-medium">
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
                              ? "bg-[#22c55e]/10 text-[#22c55e]"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {appointment.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{appointment.service}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{appointment.time}</p>
                    <p className="text-sm text-gray-600">{appointment.date}</p>
                  </div>
                </div>
              ))
            )}
            {!loadingAppointments && appointmentsError && (
              <p className="text-sm text-red-600">{appointmentsError}</p>
            )}
            {!loadingAppointments && !appointmentsError && displayedAppointments.length === 0 && (
              <p className="text-sm text-gray-500">No upcoming appointments yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card className="bg-gradient-to-br from-[#7c3aed]/5 via-purple-50 to-[#22c55e]/5 border-[#7c3aed]/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#22c55e] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            AI-Generated Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-4 bg-white rounded-lg border border-[#7c3aed]/10">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#22c55e]/20 flex items-center justify-center mt-0.5">
                <TrendingUp className="w-3 h-3 text-[#22c55e]" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-1">Peak Performance Day</h4>
                <p className="text-sm text-gray-600">
                  Booking trends update from your own data. Use weekly chart patterns to tune pricing and availability.
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white rounded-lg border border-[#7c3aed]/10">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#7c3aed]/20 flex items-center justify-center mt-0.5">
                <Clock className="w-3 h-3 text-[#7c3aed]" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-1">Optimize Your Schedule</h4>
                <p className="text-sm text-gray-600">
                  Open low-demand slots with promo offers to improve occupancy and reduce idle hours.
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white rounded-lg border border-[#7c3aed]/10">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#22c55e]/20 flex items-center justify-center mt-0.5">
                <DollarSign className="w-3 h-3 text-[#22c55e]" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-1">Revenue Opportunity</h4>
                <p className="text-sm text-gray-600">
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
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dot={{ fill: "#7c3aed", r: 4 }}
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
                <Bar key="bookings" dataKey="bookings" fill="#22c55e" radius={[8, 8, 0, 0]} />
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
            <p className="text-sm text-gray-600 mb-1">Main booking page (all services)</p>
            <a href={bookingLinks?.business_url ? normalizeToCurrentOrigin(bookingLinks.business_url) : undefined} target="_blank" rel="noreferrer" className="text-sm text-[#7c3aed] break-all">
              {bookingLinks?.business_url ? normalizeToCurrentOrigin(bookingLinks.business_url) : "Loading..."}
            </a>
          </div>
          {bookingLinks?.service_urls?.slice(0, 5).map((link) => (
            <div key={link.service_id}>
              <p className="text-sm text-gray-600 mb-1">{link.service_name}</p>
              <a href={normalizeToCurrentOrigin(link.url)} target="_blank" rel="noreferrer" className="text-sm text-[#7c3aed] break-all">
                {normalizeToCurrentOrigin(link.url)}
              </a>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
