/** Detect a Paystack return from a business paying Orheo for a plan. */

export function readPlatformPaymentReference(
  search: string | URLSearchParams
): string | null {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  if (params.get("payment") !== "1") return null;
  const reference = (params.get("reference") || params.get("trxref") || "").trim();
  return reference || null;
}

export function isPlatformPaymentReturn(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(readPlatformPaymentReference(window.location.search));
}
