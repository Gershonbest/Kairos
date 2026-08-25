// Live scheduling insights for the dashboard home page.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Calendar, Clock, DollarSign, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { BrandLoader } from "../brand/BrandLoader";
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
      iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
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
    <Card className="bg-gradient-to-br from-primary/5 via-background to-accent/10 border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          AI-Generated Insights
        </CardTitle>
        <Button variant="link" className="text-primary shrink-0" asChild>
          <Link to="/dashboard/orion">Ask Orion</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending && <BrandLoader label="Analyzing your schedule" />}
        {isError && (
          <p className="text-sm text-muted-foreground">
            Unable to load scheduling insights right now. Check your availability settings and try again.
          </p>
        )}
        {!isPending &&
          !isError &&
          cards.map((card) => (
            <div key={card.title} className="p-4 bg-card rounded-lg border border-primary/10">
              <div className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${card.iconClass}`}
                >
                  <card.icon className="w-3 h-3" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">{card.title}</h4>
                  <p className="text-sm text-muted-foreground">{card.body}</p>
                </div>
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
