// Live scheduling insights for the dashboard home page.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Calendar, Clock, DollarSign, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "../ui/button";
import { ErrorNote } from "../dashboard-ui/ErrorNote";
import { ListSkeleton } from "../dashboard-ui/skeletons";
import { SectionCard } from "../dashboard-ui/SectionCard";
import { api } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";

type InsightCard = {
  title: string;
  body: string;
  icon: typeof TrendingUp;
  iconClass: string;
};

type DashboardInsightsProps = {
  homeStats: {
    pending_confirmations: number;
    new_clients: number;
    revenue_month: number;
    currency: string;
  } | null;
};

function formatSlotLabel(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildInsightCards(
  insights: Awaited<ReturnType<typeof api.getSchedulingInsights>>,
  homeStats: DashboardInsightsProps["homeStats"]
): InsightCard[] {
  const cards: InsightCard[] = [];

  if (insights.peak_day) {
    cards.push({
      title: "Peak Performance Day",
      body: `${insights.peak_day}s are your busiest day — consider premium pricing or extra buffer time.`,
      icon: TrendingUp,
      iconClass: "bg-primary/15 text-primary",
    });
  }

  if (insights.schedule_gaps.length > 0) {
    const gap = insights.schedule_gaps[0];
    const dayLabel = new Date(`${gap.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
    cards.push({
      title: "Optimize Your Schedule",
      body: `You have a ${gap.minutes}-minute opening on ${dayLabel}. Offer an express slot to fill the gap.`,
      icon: Clock,
      iconClass: "bg-accent/25 text-accent-foreground",
    });
  }

  if (insights.utilization_pct < 40 && insights.open_slots.length > 0) {
    cards.push({
      title: "Boost Utilization",
      body: `Calendar utilization is ${insights.utilization_pct}% over the next two weeks. Promote last-minute openings to fill idle time.`,
      icon: DollarSign,
      iconClass: "bg-accent/25 text-accent-foreground",
    });
  } else if (insights.utilization_pct >= 70) {
    cards.push({
      title: "High Demand Period",
      body: `Utilization is ${insights.utilization_pct}% — consider extending availability or adding a waitlist.`,
      icon: TrendingUp,
      iconClass: "bg-primary/15 text-primary",
    });
  }

  if (insights.recommended_slots.length > 0 && cards.length < 3) {
    const nextSlot = formatSlotLabel(insights.recommended_slots[0]);
    cards.push({
      title: "Recommended Opening",
      body: `Your next best slot to promote is ${nextSlot}. Share it on your booking link or social channels.`,
      icon: Calendar,
      iconClass: "bg-primary/15 text-primary",
    });
  }

  for (const suggestion of insights.suggestions) {
    if (cards.length >= 3) break;
    const alreadyShown = cards.some((card) => card.body === suggestion);
    if (!alreadyShown) {
      cards.push({
        title: "Smart Suggestion",
        body: suggestion,
        icon: Sparkles,
        iconClass: "bg-primary/15 text-primary",
      });
    }
  }

  if (homeStats && homeStats.pending_confirmations > 0 && cards.length < 3) {
    cards.push({
      title: "Pending Confirmations",
      body: `You have ${homeStats.pending_confirmations} booking${homeStats.pending_confirmations === 1 ? "" : "s"} awaiting confirmation.`,
      icon: Clock,
      iconClass: "bg-[var(--warning-surface)] text-[var(--warning-on-surface)]",
    });
  }

  if (homeStats && homeStats.revenue_month > 0 && cards.length < 3) {
    cards.push({
      title: "Revenue Snapshot",
      body: `You've recorded ${formatCurrency(homeStats.revenue_month, homeStats.currency)} in revenue this month from confirmed payments.`,
      icon: DollarSign,
      iconClass: "bg-accent/25 text-accent-foreground",
    });
  }

  if (cards.length === 0) {
    cards.push({
      title: "Calendar Health",
      body: "Your calendar looks healthy. Keep buffer time between back-to-back appointments.",
      icon: Sparkles,
      iconClass: "bg-primary/15 text-primary",
    });
  }

  return cards.slice(0, 3);
}

export function DashboardInsights({ homeStats }: DashboardInsightsProps) {
  const {
    data: insights,
    isPending,
    isError,
  } = useQuery({
    queryKey: queryKeys.schedulingInsights,
    queryFn: () => api.getSchedulingInsights(),
  });

  const cards = useMemo(
    () => (insights ? buildInsightCards(insights, homeStats) : []),
    [insights, homeStats]
  );

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Insights from Orion
        </span>
      }
      description="Patterns Orion spotted in your schedule this fortnight."
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/orion">Ask Orion</Link>
        </Button>
      }
      contentClassName="space-y-3"
    >
      {isPending && <ListSkeleton rows={3} />}
      {isError && (
        <ErrorNote tone="info">
          Unable to load scheduling insights right now. Check your availability settings and try again.
        </ErrorNote>
      )}
      {!isPending &&
        !isError &&
        cards.map((card) => (
          <div key={card.title} className="flex items-start gap-3 rounded-xl border border-border p-4">
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${card.iconClass}`}
            >
              <card.icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-foreground">{card.title}</h4>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
            </div>
          </div>
        ))}
    </SectionCard>
  );
}
