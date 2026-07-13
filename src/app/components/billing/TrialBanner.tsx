// Trial and subscription expiry banner for the dashboard.

import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../ui/button";

interface TrialBannerProps {
  message: string;
  daysRemaining?: number;
  variant?: "ending_soon" | "expired";
}

export function TrialBanner({ message, daysRemaining, variant = "ending_soon" }: TrialBannerProps) {
  const isExpired = variant === "expired";

  return (
    <div
      className={`border-b px-4 py-3 ${
        isExpired ? "bg-red-50 border-red-200 text-red-900" : "bg-amber-50 border-amber-200 text-amber-900"
      }`}
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${isExpired ? "text-red-600" : "text-amber-600"}`} />
          <div>
            <p className="font-medium">{isExpired ? "Trial ended" : "Trial ending soon"}</p>
            <p className="text-sm opacity-90">
              {message}
              {!isExpired && daysRemaining !== undefined ? ` (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left)` : ""}
            </p>
          </div>
        </div>
        <Button asChild size="sm" className={isExpired ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}>
          <Link to="/dashboard/choose-plan">Choose a plan</Link>
        </Button>
      </div>
    </div>
  );
}
