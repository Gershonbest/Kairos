// Resolve where authenticated users should land after login or verification.

import { api } from "../api/client";

export async function resolvePostAuthPath(fallbackOnboarding = false): Promise<string> {
  try {
    const [profile, tenant] = await Promise.all([api.me(), api.myTenant().catch(() => null)]);
    // A locked-out tenant (suspended or expired) must land on the payment page
    // rather than a dashboard that answers every request with 402.
    if (profile.subscription?.requires_plan_selection) {
      return "/dashboard/choose-plan";
    }
    if (!profile.onboarding_completed) {
      return "/onboarding";
    }
    const progress = tenant?.setup_progress;
    if (progress) {
      if (!progress.has_services) return "/onboarding/services";
      if (progress.has_listing_based_service && !progress.has_products) return "/onboarding/services";
      if (!progress.has_availability_rules) return "/onboarding/availability";
      if (!progress.has_payment_provider) return "/onboarding/payment";
    }
    return "/dashboard";
  } catch {
    return fallbackOnboarding ? "/onboarding" : "/dashboard";
  }
}
