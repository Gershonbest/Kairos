// Onboarding step to configure weekly availability.

import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { ArrowRight } from "lucide-react";
import { OnboardingShell } from "../../components/layouts/OnboardingShell";
import { useState } from "react";
import { api } from "../../../lib/api/client";
import { OnboardingAlert } from "../../components/onboarding/OnboardingAlert";
import { OnboardingStepActions } from "../../components/onboarding/OnboardingStepActions";
import {
  DEFAULT_WEEKLY_AVAILABILITY,
  validateWeeklyAvailability,
  weeklyAvailabilityToRules,
  type DayAvailability,
  type WeekDayKey,
} from "../../../lib/data/availability";
import { WeeklyAvailabilityEditor } from "../../components/forms/WeeklyAvailabilityEditor";
import { OPTIONAL_ONBOARDING_ROUTES } from "./flow";

export function AvailabilityScheduling() {
  const navigate = useNavigate();
  const [availability, setAvailability] = useState<Record<WeekDayKey, DayAvailability>>(DEFAULT_WEEKLY_AVAILABILITY);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validationError = validateWeeklyAvailability(availability);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      await api.replaceAvailability({ rules: weeklyAvailabilityToRules(availability) });
      navigate("/dashboard");
    } catch {
      setError("Unable to save availability.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OnboardingShell
      step={4}
      showProgress={false}
      badge="Optional Setup"
      title="Set Weekly Availability"
      description="Configure weekly booking hours so clients can select available slots on your public page."
      previewData={{
        previewType: "availability",
      }}
    >
      <form onSubmit={handleNext} className="space-y-5">
        {error ? <OnboardingAlert tone="error" message={error} live="assertive" /> : null}
        <OnboardingAlert
          tone="info"
          message="Without configured availability, clients won't see available times. Set at least one active day or update later in Dashboard > Availability."
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
          <WeeklyAvailabilityEditor value={availability} onChange={setAvailability} disabled={isLoading} />
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="w-full rounded-xl border-slate-200 bg-slate-100/80 text-slate-700 hover:bg-slate-200 hover:text-slate-900 py-3.5 font-medium transition-all"
            disabled={isLoading}
          >
            Skip & Go to Dashboard
          </Button>
        </div>

        <OnboardingStepActions
          onBack={() => navigate(OPTIONAL_ONBOARDING_ROUTES.services)}
          nextLabel="Save Schedule & Go to Dashboard"
          nextIcon={<ArrowRight className="ml-2 h-4 w-4" />}
          isLoading={isLoading}
          loadingLabel="Saving Schedule..."
          helperText="Your weekly hours can be modified anytime in Dashboard > Availability."
        />
      </form>
    </OnboardingShell>
  );
}

