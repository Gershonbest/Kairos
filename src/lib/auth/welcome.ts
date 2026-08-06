// One-shot welcome flag after a successful plan payment.

const WELCOME_AFTER_PAYMENT_KEY = "kairos_welcome_after_payment";

export function markWelcomeAfterPayment(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(WELCOME_AFTER_PAYMENT_KEY, "1");
}

/** Returns true once, then clears the flag. */
export function consumeWelcomeAfterPayment(): boolean {
  if (typeof window === "undefined") return false;
  if (window.sessionStorage.getItem(WELCOME_AFTER_PAYMENT_KEY) !== "1") return false;
  window.sessionStorage.removeItem(WELCOME_AFTER_PAYMENT_KEY);
  return true;
}
