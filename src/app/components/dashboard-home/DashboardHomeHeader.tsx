// Greeting header with date and compact live clock.

import { LiveAnalogClock } from "./LiveAnalogClock";
import type { ReactNode } from "react";

type DashboardHomeHeaderProps = {
  firstName?: string | null;
  action?: ReactNode;
};

function resolveGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DashboardHomeHeader({ firstName, action }: DashboardHomeHeaderProps) {
  const now = new Date();
  const greeting = resolveGreeting(now);
  const naturalDate = formatLongDate(now);

  return (
    <section className="w-full rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{naturalDate}</p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <LiveAnalogClock className="self-start sm:self-auto" />
          {action}
        </div>
      </div>
    </section>
  );
}
