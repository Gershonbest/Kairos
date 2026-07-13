// Dashboard page to view and edit weekly booking availability.

import { useEffect, useState } from "react";
import { Calendar, Clock, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { WeeklyAvailabilityEditor } from "../../components/forms/WeeklyAvailabilityEditor";
import { api } from "../../../lib/api/client";
import {
  countEnabledDays,
  DEFAULT_WEEKLY_AVAILABILITY,
  rulesToWeeklyAvailability,
  validateWeeklyAvailability,
  weeklyAvailabilityToRules,
  type DayAvailability,
  type WeekDayKey,
} from "../../../lib/data/availability";

export function AvailabilitySettings() {
  const [availability, setAvailability] = useState<Record<WeekDayKey, DayAvailability>>(DEFAULT_WEEKLY_AVAILABILITY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api
      .listAvailability()
      .then((rules) => setAvailability(rulesToWeeklyAvailability(rules)))
      .catch(() => setError("Unable to load your availability."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const validationError = validateWeeklyAvailability(availability);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    try {
      await api.replaceAvailability({ rules: weeklyAvailabilityToRules(availability) });
      setSuccess("Weekly hours saved. Your public booking page will use the updated schedule.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save availability.");
    } finally {
      setIsSaving(false);
    }
  }

  const enabledDays = countEnabledDays(availability);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold">Weekly Availability</h1>
        <p className="text-gray-600 mt-1">
          Set when clients can book you. Changes apply immediately to your public booking page.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Open days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{enabledDays} / 7</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Booking windows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Slot length follows each service&apos;s duration and buffer settings.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your weekly hours</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading availability...</p>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <WeeklyAvailabilityEditor value={availability} onChange={setAvailability} disabled={isSaving} />

              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-[#22c55e]">{success}</p>}

              <Button type="submit" className="bg-[#7c3aed] hover:bg-[#6d28d9]" loading={isSaving} loadingLabel="Saving...">
                <Save className="w-4 h-4 mr-2" />
                Save weekly hours
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
