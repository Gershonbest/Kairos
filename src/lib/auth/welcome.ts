// One-shot welcome flag after a successful plan payment.

const WELCOME_AFTER_PAYMENT_KEY = "orheo_welcome_after_payment";
const LEGACY_WELCOME_AFTER_PAYMENT_KEY = "orheo_welcome_after_payment";

export function markWelcomeAfterPayment(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(WELCOME_AFTER_PAYMENT_KEY, "1");
  window.sessionStorage.removeItem(LEGACY_WELCOME_AFTER_PAYMENT_KEY);
}

/** Returns true once, then clears the flag. */
export function consumeWelcomeAfterPayment(): boolean {
  if (typeof window === "undefined") return false;
  const flagged =
    window.sessionStorage.getItem(WELCOME_AFTER_PAYMENT_KEY) === "1" ||
    window.sessionStorage.getItem(LEGACY_WELCOME_AFTER_PAYMENT_KEY) === "1";
  if (!flagged) return false;
  window.sessionStorage.removeItem(WELCOME_AFTER_PAYMENT_KEY);
  window.sessionStorage.removeItem(LEGACY_WELCOME_AFTER_PAYMENT_KEY);
  return true;
}
