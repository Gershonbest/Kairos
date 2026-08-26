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
  if (/^(data:|blob:)/i.test(raw)) return raw;
  if (/^https?:/i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const origin = apiOrigin();
      if (!origin) return raw;
      const api = new URL(origin);
      // Some rows may still contain old local media hosts (e.g. :8000) while
      // the API currently runs on a different origin (e.g. :8001). Rebase
      // only local media URLs to the active API origin.
      const isLocalHost = ["localhost", "127.0.0.1"].includes(parsed.hostname);
      const pathLooksLikeMedia = parsed.pathname.startsWith("/media/") || parsed.pathname.startsWith("/uploads/");
      if (isLocalHost && pathLooksLikeMedia && parsed.origin !== api.origin) {
        return `${api.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      return raw;
    }
    return raw;
  }
  if (raw.startsWith("/")) {
    const origin = apiOrigin();
    return origin ? `${origin}${raw}` : raw;
  }
  const origin = apiOrigin();
  return origin ? `${origin}/${raw.replace(/^\/+/, "")}` : raw;
}
