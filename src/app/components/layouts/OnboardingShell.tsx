// Shared shell for onboarding steps — theme-aware for light and dark mode.

import type { ReactNode } from "react";
import { Calendar } from "lucide-react";

type OnboardingShellProps = {
  step: number;
  totalSteps?: number;
  title: string;
  description: string;
  children: ReactNode;
};

export function OnboardingShell({
  step,
  totalSteps = 4,
  title,
  description,
  children,
}: OnboardingShellProps) {
  const percent = Math.round((step / totalSteps) * 100);

  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            Kairos Bookings
          </span>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {step} of {totalSteps}
            </span>
            <span className="text-sm text-muted-foreground">{percent}% complete</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="bg-card text-card-foreground rounded-xl shadow-sm border border-border p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
