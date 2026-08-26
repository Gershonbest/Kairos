// Dashboard home metric cards row.

import { CalendarCheck2, Clock3, Coins, UserPlus } from "lucide-react";
import { StatCard } from "../dashboard-ui/StatCard";

type DashboardStatsRowProps = {
  stats: {
    todays_bookings: number;
    revenue_month: number;
    pending_confirmations: number;
    new_clients: number;
    new_clients_period: "week" | "month";
    currency: string;
  } | null;
  loading?: boolean;
};

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function DashboardStatsRow({ stats, loading = false }: DashboardStatsRowProps) {
  const rows = [
    {
      key: "todays_bookings",
      title: "Today's bookings",
      value: stats ? String(stats.todays_bookings) : "—",
      icon: CalendarCheck2,
      emphasis: false,
      note: "",
    },
    {
      key: "revenue_month",
      title: "Monthly revenue",
      value: stats ? formatCurrency(stats.revenue_month, stats.currency) : "—",
      icon: Coins,
      emphasis: false,
      note: "",
    },
    {
      key: "pending_confirmations",
      title: "Pending confirmations",
      value: stats ? String(stats.pending_confirmations) : "—",
      icon: Clock3,
      emphasis: Boolean(stats && stats.pending_confirmations > 0),
      note: stats && stats.pending_confirmations > 0 ? "Needs attention" : "All clear",
    },
    {
      key: "new_clients",
      title: "New clients",
      value: stats ? String(stats.new_clients) : "—",
      icon: UserPlus,
      emphasis: false,
      note: stats ? `This ${stats.new_clients_period}` : "",
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((item) => (
        <StatCard
          key={item.key}
          label={item.title}
          value={item.value}
          hint={item.note || undefined}
          icon={item.icon}
          loading={loading}
          emphasis={item.emphasis}
        />
      ))}
    </section>
  );
}
