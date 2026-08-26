// Dashboard page to view and edit weekly booking availability.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { WeeklyAvailabilityEditor } from "../../components/forms/WeeklyAvailabilityEditor";
import { ErrorNote, PageHeader, PageShell, StatCard } from "../../components/dashboard-ui";
import { api } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
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
  const queryClient = useQueryClient();
  const [availability, setAvailability] = useState<Record<WeekDayKey, DayAvailability>>(DEFAULT_WEEKLY_AVAILABILITY);
  const [hydrated, setHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const {
    data: rules,
    isPending,
    isError,
  } = useQuery({
    queryKey: queryKeys.availability,
    queryFn: () => api.listAvailability(),
  });

  useEffect(() => {
    if (!rules || hydrated) return;
    setAvailability(rulesToWeeklyAvailability(rules));
    setHydrated(true);
  }, [rules, hydrated]);

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
      const nextRules = weeklyAvailabilityToRules(availability);
      await api.replaceAvailability({ rules: nextRules });
      queryClient.setQueryData(queryKeys.availability, nextRules);
      setSuccess("Weekly hours saved. Your public booking page will use the updated schedule.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save availability.");
    } finally {
      setIsSaving(false);
    }
  }

  const enabledDays = countEnabledDays(availability);
  const loadError = isError ? "Unable to load your availability." : error;

  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow="Schedule"
        title="Weekly availability"
        description="Set when clients can book you. Changes apply immediately to your public booking page."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Open days" value={`${enabledDays} / 7`} icon={Calendar} />
        <StatCard
          label="Booking windows"
          value="Service-led"
          hint="Slot length follows each service's duration and buffer settings."
          icon={Clock}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your weekly hours</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending && !hydrated ? (
            <BrandLoader label="Syncing availability" />
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <WeeklyAvailabilityEditor value={availability} onChange={setAvailability} disabled={isSaving} />

              {loadError && <ErrorNote>{loadError}</ErrorNote>}
              {success && <ErrorNote tone="success">{success}</ErrorNote>}

              <Button type="submit" loading={isSaving} loadingLabel="Saving...">
                <Save className="w-4 h-4 mr-2" />
                Save weekly hours
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
