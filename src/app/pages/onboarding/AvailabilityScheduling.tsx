// Onboarding step to configure weekly availability.

import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Calendar, ArrowRight } from "lucide-react";
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Step 3 of 4</span>
            <span className="text-sm text-gray-600">75% complete</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#7c3aed] to-[#8b5cf6] w-3/4 transition-all duration-300" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#22c55e] flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Set your availability</h1>
              <p className="text-sm text-gray-600">When are you available for bookings?</p>
            </div>
          </div>

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
                className="flex-1 bg-[#7c3aed] hover:bg-[#6d28d9]"
                loading={isLoading}
                loadingLabel="Saving..."
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
