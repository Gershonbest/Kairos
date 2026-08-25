/** Phone normalization aligned with backend normalize_phone_e164 (default Nigeria +234). */

export function normalizePhoneE164(
  value: string | null | undefined,
  defaultCountryCode = "234"
): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const keepPlus = raw.startsWith("+");
  const cleaned = raw.replace(/[^\d+]/g, "");
  let digits = cleaned.replace(/^\+/, "");
  if (!digits) return null;

  if (cleaned.startsWith("00")) {
    digits = digits.slice(2);
  } else if (!keepPlus && digits.startsWith("0") && digits.length === 11) {
    digits = `${defaultCountryCode}${digits.slice(1)}`;
  }

  if (digits.length < 8) return null;
  return digits;
}

export function formatPhoneDisplay(e164: string): string {
  if (e164.startsWith("234") && e164.length === 13) {
    return `+234 ${e164.slice(3, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`;
  }
  return e164.startsWith("+") ? e164 : `+${e164}`;
}

export function telHref(e164: string): string {
  return `tel:+${e164.replace(/^\+/, "")}`;
}

export function whatsAppHref(e164: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}`;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
