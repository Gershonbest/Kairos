// Resolve where authenticated users should land after login or verification.

import { api } from "../api/client";

export async function resolvePostAuthPath(fallbackOnboarding = false): Promise<string> {
  try {
    const profile = await api.me();
    // A locked-out tenant (suspended or expired) must land on the payment page
    // rather than a dashboard that answers every request with 402.
    if (profile.subscription?.requires_plan_selection) {
      return "/dashboard/choose-plan";
    }
    if (!profile.onboarding_completed) {
      return "/onboarding";
    }
    return "/dashboard";
  } catch {
    return fallbackOnboarding ? "/onboarding" : "/dashboard";
  }
}
