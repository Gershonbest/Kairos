// Shared onboarding route + step metadata.

export const REQUIRED_ONBOARDING_STEPS = [
  {
    key: "business",
    route: "/onboarding",
    title: "Tell us about your business",
  },
  {
    key: "payment",
    route: "/onboarding/payment",
    title: "Connect Paystack",
  },
] as const;

export const OPTIONAL_ONBOARDING_ROUTES = {
  services: "/onboarding/services",
  availability: "/onboarding/availability",
} as const;

export const REQUIRED_ONBOARDING_TOTAL = REQUIRED_ONBOARDING_STEPS.length;
