// Onboarding step to configure weekly availability.

import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { ArrowRight } from "lucide-react";
import { OnboardingShell } from "../../components/layouts/OnboardingShell";
import { useState } from "react";
import { api } from "../../../lib/api/client";
import {
  DEFAULT_WEEKLY_AVAILABILITY,
  validateWeeklyAvailability,
  weeklyAvailabilityToRules,
  type DayAvailability,
  type WeekDayKey,
} from "../../../lib/data/availability";
import { WeeklyAvailabilityEditor } from "../../components/forms/WeeklyAvailabilityEditor";

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
      navigate("/onboarding/payment");
    } catch {
      setError("Unable to save availability.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OnboardingShell
      step={3}
      title="Set your availability"
      description="When are you available for bookings?"
    >
          <form onSubmit={handleNext} className="space-y-3">
            <WeeklyAvailabilityEditor value={availability} onChange={setAvailability} disabled={isLoading} />

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/onboarding/services")}
                className="flex-1"
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/90"
                loading={isLoading}
                loadingLabel="Saving..."
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
    </OnboardingShell>
  );
}
