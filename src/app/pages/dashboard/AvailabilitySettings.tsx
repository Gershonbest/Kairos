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
  const { data: me } = useQuery({ queryKey: queryKeys.me, queryFn: () => api.me() });
  const canEditBusiness = Boolean(me?.permissions?.includes("availability:business"));
  const [tab, setTab] = useState<"business" | "mine">("business");
  const [availability, setAvailability] = useState<Record<WeekDayKey, DayAvailability>>(DEFAULT_WEEKLY_AVAILABILITY);
  const [hydrated, setHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const scope = canEditBusiness && tab === "business" ? "business" : "mine";
  const {
    data: rules,
    isPending,
    isError,
  } = useQuery({
    queryKey: [...queryKeys.availability, scope, me?.id],
    queryFn: () =>
      scope === "business" || !me?.id
        ? api.listAvailability()
        : api.listStaffAvailability(me.id).then((rows) =>
            rows.length ? rows : api.listAvailability()
          ),
    enabled: Boolean(me),
  });

  useEffect(() => {
    if (!rules || hydrated) return;
    setAvailability(rulesToWeeklyAvailability(rules));
    setHydrated(true);
  }, [rules, hydrated]);

  useEffect(() => {
    setHydrated(false);
  }, [scope]);

  useEffect(() => {
    if (!canEditBusiness) setTab("mine");
  }, [canEditBusiness]);

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
      if (scope === "business") {
        await api.replaceAvailability({ rules: nextRules });
      } else if (me?.id) {
        await api.replaceStaffAvailability(me.id, { rules: nextRules });
      }
      queryClient.setQueryData([...queryKeys.availability, scope, me?.id], nextRules);
      setSuccess(
        scope === "business"
          ? "Business hours saved. Your public booking page will use the updated schedule."
          : "Your hours were saved. Bookings assigned to you will use this schedule."
      );
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
        description={
          scope === "business"
            ? "Set when the business is open. Staff without their own hours inherit this schedule."
            : "Set when clients can book you. Leave this empty to inherit business hours."
        }
      />

      {canEditBusiness && (
        <div className="mb-4 flex gap-2">
          <Button type="button" variant={tab === "business" ? "default" : "outline"} onClick={() => setTab("business")}>
            Business hours
          </Button>
          <Button type="button" variant={tab === "mine" ? "default" : "outline"} onClick={() => setTab("mine")}>
            My hours
          </Button>
        </div>
      )}

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
          <CardTitle>{scope === "business" ? "Business hours" : "My hours"}</CardTitle>
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
