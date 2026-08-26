// Resolve media URLs that may be stored as relative paths.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

function apiOrigin(): string {
  try {
    const parsed = new URL(API_BASE_URL);
    return parsed.origin;
  } catch {
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }
}

export function resolveMediaUrl(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith("/")) {
    const origin = apiOrigin();
    return origin ? `${origin}${raw}` : raw;
  }
  const origin = apiOrigin();
  return origin ? `${origin}/${raw.replace(/^\/+/, "")}` : raw;
}
