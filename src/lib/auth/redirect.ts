// Resolve where authenticated users should land after login or verification.

import { api } from "../api/client";

export async function resolvePostAuthPath(): Promise<string> {
  try {
    const profile = await api.me();
    // A locked-out tenant (suspended or expired) must land on the payment page
    // rather than a dashboard that answers every request with 402.
    if (profile.subscription?.requires_plan_selection) {
      return "/dashboard/choose-plan";
    }
    if (profile.role === "tenant_admin" && profile.tenant_id) {
      if (!profile.onboarding_completed) {
        return "/onboarding";
      }
      try {
        const tenant = await api.myTenant();
        if (!tenant.setup_progress?.has_payment_provider) {
          return "/onboarding/payment";
        }
      } catch {
        return "/onboarding/payment";
      }
    }
    return "/dashboard";
  } catch {
    return "/dashboard";
  }
}
