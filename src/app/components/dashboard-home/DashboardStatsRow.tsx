// Dashboard home metric cards row.

import { CalendarCheck2, Clock3, Coins, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

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
      highlight: false,
      note: "",
    },
    {
      key: "revenue_week",
      title: "Monthly revenue",
      value: stats ? formatCurrency(stats.revenue_month, stats.currency) : "—",
      icon: Coins,
      highlight: false,
      note: "",
    },
    {
      key: "pending_confirmations",
      title: "Pending confirmations",
      value: stats ? String(stats.pending_confirmations) : "—",
      icon: Clock3,
      highlight: Boolean(stats && stats.pending_confirmations > 0),
      note:
        stats && stats.pending_confirmations > 0
          ? "Needs attention"
          : "All clear",
    },
    {
      key: "new_clients",
      title: "New clients",
      value: stats ? String(stats.new_clients) : "—",
      icon: UserPlus,
      highlight: false,
      note: stats ? `This ${stats.new_clients_period}` : "",
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((item) => (
        <Card key={item.key} className={item.highlight ? "border-amber-400/70" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between gap-2">
              <span>{item.title}</span>
              <item.icon className={`h-4 w-4 ${item.highlight ? "text-amber-500" : "text-muted-foreground"}`} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-semibold ${item.highlight ? "text-amber-500" : ""}`}>
              {loading ? "…" : item.value}
            </p>
            {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
