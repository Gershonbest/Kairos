// Resolve where authenticated users should land after login or verification.

import { api } from "../api/client";

export async function resolvePostAuthPath(fallbackOnboarding = false): Promise<string> {
  try {
    const profile = await api.me();
    if (!profile.onboarding_completed) {
      return "/onboarding";
    }
    return "/dashboard";
  } catch {
    return fallbackOnboarding ? "/onboarding" : "/dashboard";
  }
}
