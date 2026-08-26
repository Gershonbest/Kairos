/** Page title, description, Open Graph, and canonical helpers for marketing pages. */

export const SITE_NAME = "Orheo";
export const SITE_TAGLINE = "Create Order. Unlock Flow.";
export const DEFAULT_DESCRIPTION =
  "Grow your service business with Orheo — AI-powered bookings, Paystack payments, client CRM, and reminders built for Africa.";
export const SUPPORT_EMAIL = "support@orheobookings.com";
export const SITE_ORIGIN = "https://www.orheo.com";
export const DEFAULT_OG_IMAGE = "/orheo-logo.png";

export function siteOrigin(): string {
  return SITE_ORIGIN;
}

export function absoluteUrl(path: string): string {
  const origin = siteOrigin();
  if (path.startsWith("http")) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(id: string, data: object | null) {
  const existing = document.getElementById(id);
  if (!data) {
    existing?.remove();
    return;
  }
  const el = (existing as HTMLScriptElement | null) ?? document.createElement("script");
  el.id = id;
  el.type = "application/ld+json";
  el.textContent = JSON.stringify(data);
  if (!existing) document.head.appendChild(el);
}

export type PageMetaOptions = {
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
  jsonLd?: object | object[] | null;
};

export function applyPageMeta({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  noindex = false,
  jsonLd = null,
}: PageMetaOptions) {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;

  document.title = fullTitle;

  upsertMeta('meta[name="description"]', { name: "description", content: description });
  upsertMeta('meta[name="robots"]', {
    name: "robots",
    content: noindex ? "noindex, nofollow" : "index, follow",
  });
  upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
  upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: SITE_NAME });
  upsertMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
  upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
  upsertMeta('meta[property="og:url"]', { property: "og:url", content: url });
  upsertMeta('meta[property="og:image"]', { property: "og:image", content: imageUrl });
  upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
  upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
  upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
  upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: imageUrl });
  upsertLink("canonical", url);
  upsertJsonLd("orheo-jsonld", jsonLd);
}

export function shareUrl(path?: string): string {
  if (path) return absoluteUrl(path);
  if (typeof window !== "undefined") return window.location.href;
  return siteOrigin();
}
