// Typed HTTP API client with auth token handling.

import { decodeToken, isTokenExpired } from "../auth/token";
import { queryClient } from "../queryClient";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

const ACCESS_TOKEN_KEY = "orheo_access_token";
const REFRESH_TOKEN_KEY = "orheo_refresh_token";
const LEGACY_ACCESS_TOKEN_KEY = "kairos_access_token";
const LEGACY_REFRESH_TOKEN_KEY = "kairos_refresh_token";

function migrateLegacyAuthTokens() {
  const access = localStorage.getItem(ACCESS_TOKEN_KEY) ?? localStorage.getItem(LEGACY_ACCESS_TOKEN_KEY);
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY) ?? localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY);
  if (access && !localStorage.getItem(ACCESS_TOKEN_KEY)) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
  }
  if (refresh && !localStorage.getItem(REFRESH_TOKEN_KEY)) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

migrateLegacyAuthTokens();

let accessToken: string | null = localStorage.getItem(ACCESS_TOKEN_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_TOKEN_KEY);
let isRedirectingToLogin = false;
let refreshInFlight: Promise<boolean> | null = null;

const AUTH_PATHS_WITHOUT_SESSION = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/admin/login",
  "/auth/google",
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/refresh",
]);

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

export class SubscriptionRequiredError extends Error {
  constructor() {
    super("Subscription required");
    this.name = "SubscriptionRequiredError";
  }
}

function tokenSubject(token: string | null): string | null {
  return decodeToken(token)?.sub ?? null;
}

export function setAuthTokens(tokens: { access_token: string; refresh_token: string }) {
  syncAuthTokensFromStorage();
  const previousSubject = tokenSubject(accessToken);

  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);

  // A different user in the same tab must never inherit the previous
  // session's cached data. Token refresh keeps the same subject, so it
  // does not wipe the cache.
  if (tokenSubject(tokens.access_token) !== previousSubject) {
    queryClient.clear();
  }
}

export function clearAuthTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  queryClient.clear();
}

function syncAuthTokensFromStorage() {
  migrateLegacyAuthTokens();
  accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
}

function hadStoredSession(): boolean {
  syncAuthTokensFromStorage();
  return Boolean(accessToken || refreshToken);
}

function shouldHandleUnauthorized(path: string): boolean {
  return !AUTH_PATHS_WITHOUT_SESSION.has(path);
}

function redirectToLogin() {
  if (isRedirectingToLogin || typeof window === "undefined") return;
  isRedirectingToLogin = true;
  clearAuthTokens();

  const returnPath = `${window.location.pathname}${window.location.search}`;
  const loginPath =
    returnPath && returnPath !== "/auth/login"
      ? `/auth/login?redirect=${encodeURIComponent(returnPath)}`
      : "/auth/login";

  window.location.replace(loginPath);
}

function redirectToChoosePlan() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/dashboard/choose-plan")) return;
  window.location.replace("/dashboard/choose-plan");
}

function handleUnauthorized(path: string) {
  if (!shouldHandleUnauthorized(path)) return;
  if (!hadStoredSession()) return;
  redirectToLogin();
}

/**
 * Refresh (or end) the session before a request goes out, so an expired
 * session signs the user out instead of rendering stale screens.
 */
async function ensureLiveSession(path: string): Promise<void> {
  if (!shouldHandleUnauthorized(path)) return;
  syncAuthTokensFromStorage();
  if (!accessToken && !refreshToken) return;
  if (accessToken && !isTokenExpired(accessToken)) return;

  if (refreshToken && !isTokenExpired(refreshToken, 0) && (await refreshAccessToken())) {
    return;
  }

  handleUnauthorized(path);
  throw new SessionExpiredError();
}

async function refreshAccessToken(): Promise<boolean> {
  // Multiple 401s often fire together (dashboard + notifications + status).
  // Share one refresh so concurrent callers don't race the same token.
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    syncAuthTokensFromStorage();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) return false;

      const tokens = (await response.json()) as { access_token: string; refresh_token: string };
      setAuthTokens(tokens);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function authHeaders(): Record<string, string> {
  syncAuthTokensFromStorage();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

function formatApiError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    const detail = parsed.detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "object" && item && "msg" in item) {
            const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : "field";
            return `${String(field)}: ${String(item.msg)}`;
          }
          return String(item);
        })
        .join("; ");
    }
    if (typeof detail === "string") {
      return detail;
    }
  } catch {
    // Fall back to the raw body below.
  }
  return body || `HTTP ${status}`;
}

async function request<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  if (allowRefresh) await ensureLiveSession(path);
  const hasBody = init.body !== undefined && init.body !== null && init.body !== "";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401 && shouldHandleUnauthorized(path)) {
    if (allowRefresh && (await refreshAccessToken())) {
      return request<T>(path, init, false);
    }
    handleUnauthorized(path);
    throw new SessionExpiredError();
  }

  if (response.status === 402 && !path.startsWith("/subscriptions")) {
    redirectToChoosePlan();
    throw new SubscriptionRequiredError();
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(formatApiError(body, response.status));
  }
  return response.json() as Promise<T>;
}

async function uploadMultipart(path: string, file: File, allowRefresh = true): Promise<{ url: string }> {
  if (allowRefresh) await ensureLiveSession(path);
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  if (response.status === 401 && shouldHandleUnauthorized(path)) {
    if (allowRefresh && (await refreshAccessToken())) {
      return uploadMultipart(path, file, false);
    }
    handleUnauthorized(path);
    throw new SessionExpiredError();
  }

  if (response.status === 402 && !path.startsWith("/subscriptions")) {
    redirectToChoosePlan();
    throw new SubscriptionRequiredError();
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(formatApiError(body, response.status));
  }
  return response.json() as Promise<{ url: string }>;
}

export interface TenantBranchPayload {
  id: string;
  name: string;
  country_code: string;
  state?: string;
  address_line: string;
  phone_country_code?: string;
  phone_number?: string;
  latitude?: number | null;
  longitude?: number | null;
  is_primary?: boolean;
}

export type SchedulingMode = "fixed" | "flexible" | "all_day";
export type BookingType = "general" | "listing";
export type ListingStatus = "available" | "reserved" | "sold" | "hidden";

export interface ListingRecord {
  id: string;
  name: string;
  description?: string | null;
  status: ListingStatus;
  image_urls: string[];
  active: boolean;
  service_ids: string[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PublicBookingResponse {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  client_id: string;
  service_id: string;
  listing_id?: string | null;
  listing_name?: string | null;
  listing_image_url?: string | null;
  payment_required?: boolean;
  payment_amount?: number | null;
  payment_status?: string | null;
  payment_authorization_url?: string | null;
  payment_access_code?: string | null;
  payment_reference?: string | null;
  google_calendar_url?: string | null;
  ics_download_path?: string | null;
  is_all_day?: boolean;
  scheduling_mode?: SchedulingMode | null;
  client_name?: string | null;
  client_first_name?: string | null;
  client_last_name?: string | null;
  client_profile_name?: string | null;
  client_email?: string | null;
  service_name?: string | null;
  service_price?: number | null;
  service_deposit?: number | null;
  service_image_url?: string | null;
  service_duration_minutes?: number | null;
  host_name?: string | null;
  host_title?: string | null;
  appointment_format?: "online" | "onsite" | null;
  location?: string | null;
  business_name?: string | null;
  business_contact_email?: string | null;
  business_help_email?: string | null;
  receipt_download_path?: string | null;
  paid_at?: string | null;
  payment_currency?: string | null;
}

export interface BookingListItem {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  client_id: string;
  service_id: string;
  listing_id?: string | null;
  listing_name?: string | null;
  listing_image_url?: string | null;
  client_name: string;
  client_profile_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  booking_source?: "public" | "dashboard" | string;
  service_name: string;
  service_duration_minutes?: number;
  scheduling_mode?: SchedulingMode;
  is_all_day?: boolean;
  notes?: string | null;
  appointment_format?: "online" | "onsite" | null;
  host_name?: string | null;
  host_title?: string | null;
  location?: string | null;
}

export function bookingClientLabel(booking: {
  client_name?: string | null;
  client_profile_name?: string | null;
}): string {
  const visit = (booking.client_name || "").trim();
  const profile = (booking.client_profile_name || "").trim();
  if (visit && profile && profile !== visit) {
    return `${visit} · profile: ${profile}`;
  }
  return visit || profile;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  booking_id?: string | null;
  read_at?: string | null;
  created_at?: string | null;
  is_read: boolean;
}

export interface OnboardingPayload {
  business_name: string;
  business_type: string;
  country_code: string;
  state?: string;
  address_line: string;
  phone_country_code: string;
  phone_number: string;
  latitude?: number | null;
  longitude?: number | null;
  logo_url?: string;
  help_email?: string;
  timezone?: string;
  branches?: TenantBranchPayload[];
  location?: string;
}

export interface ServicePayload {
  name: string;
  description?: string;
  duration_minutes: number;
  booking_type?: BookingType;
  listing_ids?: string[];
  scheduling_mode?: SchedulingMode;
  price_amount: number;
  deposit_amount?: number;
  appointment_type?: "online" | "onsite" | "hybrid";
  location?: string;
  use_business_location?: boolean;
  host_name?: string;
  host_title?: string;
  online_meeting_link?: string;
  client_instructions?: string;
  buffer_minutes?: number;
  image_url?: string;
}

export interface ServiceRecord extends ServicePayload {
  id: string;
  active: boolean;
}

export interface ServiceUpdatePayload extends ServicePayload {
  active: boolean;
}

export interface SubscriptionStatus {
  status: string;
  plan_code: string;
  is_trial: boolean;
  requires_plan_selection: boolean;
  days_remaining: number;
  trial_ends_at: string | null;
  subscription_paid_until: string | null;
  warning_level: "ending_soon" | "expired" | "suspended" | null;
  warning_message: string | null;
}

export interface AvailabilityRulePayload {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
}

export interface CalendarBlockRecord {
  id: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  created_at?: string | null;
}

export const api = {
  signup: (payload: { first_name: string; last_name: string; business_name: string; email: string; password: string }) =>
    request<{
      needs_email_verification: boolean;
      email?: string;
      access_token?: string;
      refresh_token?: string;
    }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyEmail: (payload: { token: string }) =>
    request<{
      ok: boolean;
      access_token: string;
      refresh_token: string;
      onboarding_completed: boolean;
    }>("/auth/verify-email", { method: "POST", body: JSON.stringify(payload) }),
  resendVerification: (payload: { email: string }) =>
    request<{ ok: boolean }>("/auth/resend-verification", { method: "POST", body: JSON.stringify(payload) }),
  forgotPassword: (payload: { email: string }) =>
    request<{ ok: boolean }>("/auth/forgot-password", { method: "POST", body: JSON.stringify(payload) }),
  resetPassword: (payload: { token: string; new_password: string }) =>
    request<{ ok: boolean }>("/auth/reset-password", { method: "POST", body: JSON.stringify(payload) }),
  googleAuth: (payload: { id_token: string; business_name?: string }) =>
    request<{ access_token: string; refresh_token: string; is_new_user: boolean }>("/auth/google", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload: { email: string; password: string }) =>
    request<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: async () => {
    const token = refreshToken;
    try {
      if (token) {
        await request<{ ok: boolean }>("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: token }),
        });
      }
    } catch {
      // Revoking server-side is best effort; the local session is cleared either way.
    } finally {
      clearAuthTokens();
    }
  },
  adminLogin: (payload: { email: string; password: string }) =>
    request<{ access_token: string; refresh_token: string }>("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: () =>
    request<{
      id: string;
      full_name: string;
      email: string;
      tenant_id?: string;
      role: string;
      email_verified?: boolean;
      has_password?: boolean;
      onboarding_completed?: boolean;
      subscription?: SubscriptionStatus | null;
    }>("/auth/me"),
  updateProfile: (payload: {
    full_name?: string;
    current_password?: string;
    new_password?: string;
    new_email?: string;
  }) =>
    request<{ id: string; full_name: string; email: string; email_verified: boolean }>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  completeOnboarding: (payload: OnboardingPayload) =>
    request<{ ok: boolean }>("/tenants/me/onboarding", { method: "PUT", body: JSON.stringify(payload) }),
  uploadLogo: (file: File) => uploadMultipart("/uploads/logo", file),
  uploadServiceImage: (file: File) => uploadMultipart("/uploads/service-image", file),
  uploadListingImage: (file: File) => uploadMultipart("/uploads/listing-image", file),
  myTenant: () =>
    request<{
      id: string;
      name: string;
      business_type?: string;
      location?: string;
      country_code?: string;
      state?: string;
      address_line?: string;
      phone_country_code?: string;
      phone_number?: string;
      latitude?: number | null;
      longitude?: number | null;
      branches?: TenantBranchPayload[];
      status: string;
      plan_code: string;
      public_slug?: string;
      public_tagline?: string;
      public_description?: string;
      public_logo_url?: string;
      help_email?: string | null;
      timezone?: string;
      onboarding_completed?: boolean;
      setup_progress?: {
        has_services: boolean;
        has_listing_based_service: boolean;
        has_products: boolean;
        has_availability_rules: boolean;
        has_payment_provider: boolean;
      };
    }>("/tenants/me"),
  updateTenant: (payload: {
    business_name?: string;
    business_type?: string;
    country_code?: string;
    state?: string;
    address_line?: string;
    phone_country_code?: string;
    phone_number?: string;
    latitude?: number | null;
    longitude?: number | null;
    logo_url?: string;
    help_email?: string | null;
    timezone?: string;
    public_slug?: string;
    branches?: TenantBranchPayload[];
    location?: string;
  }) =>
    request<{
      id: string;
      name: string;
      business_type?: string;
      help_email?: string | null;
      timezone?: string;
      public_slug?: string;
      [key: string]: unknown;
    }>("/tenants/me", { method: "PATCH", body: JSON.stringify(payload) }),
  deactivateTenant: () =>
    request<{ ok: boolean; status: string }>("/tenants/me/deactivate", { method: "POST" }),
  getBookingLinks: () =>
    request<{ business_url: string; service_urls: Array<{ service_id: string; service_name: string; url: string }> }>(
      "/tenants/me/booking-links"
    ),
  createService: (payload: ServicePayload) =>
    request<ServiceRecord>("/services", { method: "POST", body: JSON.stringify(payload) }),
  listServices: () => request<Array<ServiceRecord>>("/services"),
  updateService: (serviceId: string, payload: ServiceUpdatePayload) =>
    request<ServiceRecord>(`/services/${serviceId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteService: (serviceId: string) => request<{ ok: boolean }>(`/services/${serviceId}`, { method: "DELETE" }),
  createListing: (payload: {
    name: string;
    description?: string;
    status?: ListingStatus;
    image_urls?: string[];
    active?: boolean;
    service_ids?: string[];
  }) => request<ListingRecord>("/listings", { method: "POST", body: JSON.stringify(payload) }),
  listListings: () => request<Array<ListingRecord>>("/listings"),
  updateListing: (
    listingId: string,
    payload: {
      name: string;
      description?: string;
      status?: ListingStatus;
      image_urls?: string[];
      active?: boolean;
      service_ids?: string[];
    }
  ) =>
    request<ListingRecord>(`/listings/${listingId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteListing: (listingId: string) => request<{ ok: boolean }>(`/listings/${listingId}`, { method: "DELETE" }),
  replaceAvailability: (payload: { rules: AvailabilityRulePayload[] }) =>
    request<{ ok: boolean }>("/availability", { method: "PUT", body: JSON.stringify(payload) }),
  listAvailability: () =>
    request<Array<{ id: string; day_of_week: number; start_time: string; end_time: string; is_enabled: boolean }>>(
      "/availability"
    ),
  listCalendarBlocks: () => request<CalendarBlockRecord[]>("/availability/blocks"),
  createCalendarBlock: (payload: { start_date: string; end_date: string; reason?: string }) =>
    request<CalendarBlockRecord>("/availability/blocks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteCalendarBlock: (blockId: string) =>
    request<{ ok: boolean }>(`/availability/blocks/${blockId}`, { method: "DELETE" }),
  listSubscriptionPlans: () =>
    request<
      Array<{
        code: string;
        name: string;
        monthly_price: number;
        description: string;
        features: string[];
        entitlements: Record<string, unknown>;
        self_serve: boolean;
        is_featured: boolean;
      }>
    >("/subscriptions/plans"),
  getSubscriptionStatus: () => request<SubscriptionStatus>("/subscriptions/status"),
  activateSubscriptionPlan: (plan_code: string) =>
    request<SubscriptionStatus>("/subscriptions/activate", {
      method: "POST",
      body: JSON.stringify({ plan_code }),
    }),
  checkoutSubscriptionPlan: (plan_code: string) =>
    request<{
      transaction_id: string;
      provider: string;
      provider_reference: string;
      authorization_url?: string | null;
      access_code?: string | null;
      amount: number;
      plan_code: string;
      status: string;
    }>("/subscriptions/checkout", {
      method: "POST",
      body: JSON.stringify({ plan_code }),
    }),
  verifyPaymentReference: (reference: string) =>
    request<{
      ok: boolean;
      status?: string;
      gateway_status?: string;
      reference: string;
      purpose?: string;
      booking_id?: string | null;
      transaction_id?: string;
      message?: string;
    }>(`/payments/verify/${encodeURIComponent(reference)}`, { method: "POST" }),
  listPaystackBanks: () =>
    request<Array<{ name: string; code: string; slug?: string }>>("/tenants/me/paystack/banks"),
  updatePublicProfile: (payload: {
    public_tagline?: string;
    public_description?: string;
    public_logo_url?: string;
    public_slug?: string;
  }) =>
    request<{ ok: boolean }>("/tenants/me/public-profile", { method: "PUT", body: JSON.stringify(payload) }),
  getNotificationPreferences: () =>
    request<{
      email_enabled: boolean;
      booking_created_email: boolean;
      payment_received_email: boolean;
      sms_enabled: boolean;
      email?: boolean;
      sms?: boolean;
    }>("/notifications/preferences"),
  updateNotificationPreferences: (payload: {
    email_enabled?: boolean;
    booking_created_email?: boolean;
    payment_received_email?: boolean;
    sms_enabled?: boolean;
  }) =>
    request<{
      email_enabled: boolean;
      booking_created_email: boolean;
      payment_received_email: boolean;
      sms_enabled: boolean;
    }>("/notifications/preferences", { method: "PUT", body: JSON.stringify(payload) }),
  listClients: () =>
    request<
      Array<{
        id: string;
        full_name: string;
        email: string;
        phone?: string;
        notes?: string;
        total_bookings: number;
        total_spent: number;
        last_visit_at?: string | null;
      }>
    >("/clients"),
  createClient: (payload: { full_name: string; email: string; phone?: string; notes?: string }) =>
    request<{ id: string; full_name: string; email: string; phone?: string; notes?: string; total_bookings: number; total_spent: number }>(
      "/clients",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  updateClient: (clientId: string, payload: { full_name?: string; email?: string; phone?: string; notes?: string }) =>
    request<{ id: string; full_name: string; email: string; phone?: string; notes?: string; total_bookings: number; total_spent: number }>(
      `/clients/${clientId}`,
      { method: "PATCH", body: JSON.stringify(payload) }
    ),
  deleteClient: (clientId: string) => request<{ ok: boolean }>(`/clients/${clientId}`, { method: "DELETE" }),
  listBookings: () => request<BookingListItem[]>("/bookings"),
  listManualBookingAvailability: (
    serviceId: string,
    fromIso: string,
    toIso: string,
    listingId?: string
  ) =>
    request<{ slots: string[] }>(
      `/bookings/availability?service_id=${encodeURIComponent(serviceId)}&from_iso=${encodeURIComponent(
        fromIso
      )}&to_iso=${encodeURIComponent(toIso)}${
        listingId ? `&listing_id=${encodeURIComponent(listingId)}` : ""
      }`
    ),
  createManualBooking: (payload: {
    client_id?: string;
    new_client_first_name?: string;
    new_client_last_name?: string;
    new_client_email?: string;
    new_client_phone?: string;
    service_id: string;
    listing_id?: string;
    start_at: string;
    guest_first_name?: string;
    guest_last_name?: string;
    notes?: string;
    appointment_format?: "online" | "onsite";
    send_confirmation: boolean;
    payment_status: "unpaid" | "paid_external";
    override_availability: boolean;
  }) =>
    request<BookingListItem>("/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateBookingStatus: (bookingId: string, status: "completed" | "no_show" | "cancelled" | "confirmed") =>
    request<BookingListItem>(`/bookings/${bookingId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  listNotifications: (limit = 30) =>
    request<AppNotification[]>(`/notifications?limit=${encodeURIComponent(String(limit))}`),
  getUnreadNotificationCount: () => request<{ count: number }>("/notifications/unread-count"),
  markNotificationRead: (notificationId: string) =>
    request<{ ok: boolean }>(`/notifications/${notificationId}/read`, { method: "POST" }),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),
  dashboardSummary: () =>
    request<{
      stats: {
        total_bookings: number;
        monthly_revenue: number;
        active_clients: number;
        avg_booking_value: number;
        bookings_change_pct: number;
        revenue_change_pct: number;
      };
      revenue_series: Array<{ month: string; revenue: number }>;
      bookings_series: Array<{ day: string; bookings: number }>;
      upcoming_appointments: Array<{
        id: string;
        client: string;
        service: string;
        status: string;
        start_at: string;
        time: string;
        date: string;
      }>;
    }>("/dashboard/summary"),
  dashboardHomeStats: () =>
    request<{
      todays_bookings: number;
      revenue_month: number;
      revenue_week: number;
      pending_confirmations: number;
      new_clients: number;
      new_clients_period: "week" | "month";
      currency: string;
    }>("/dashboard/home/stats"),
  connectPaymentProvider: (payload: {
    provider: string;
    business_name?: string;
    settlement_bank: string;
    account_number: string;
  }) =>
    request<{
      ok: boolean;
      provider?: string;
      subaccount_code?: string;
      platform_fee_percent?: number;
      payments_enabled?: boolean;
    }>("/tenants/me/payment-provider", { method: "POST", body: JSON.stringify(payload) }),
  getPaymentProvider: () =>
    request<{
      provider: string | null;
      account_id: string | null;
      payments_enabled: boolean;
      settlement_bank_code?: string | null;
      settlement_account_last4?: string | null;
      platform_fee_percent?: number;
    }>("/tenants/me/payment-provider"),
  getSchedulingInsights: () =>
    request<{
      open_slots: string[];
      recommended_slots: string[];
      upcoming_bookings: Array<{ id: string; start_at: string; end_at: string; status: string }>;
      schedule_gaps: Array<{ date: string; start: string; end: string; minutes: number }>;
      peak_day: string | null;
      utilization_pct: number;
      suggestions: string[];
    }>("/scheduling/insights"),
  askAssistant: (payload: { message: string }) =>
    request<{ reply: string; suggestions: string[] }>("/ai/assistant", { method: "POST", body: JSON.stringify(payload) }),
  listPublicServices: (businessId: string) =>
    request<
      Array<{
        id: string;
        name: string;
        description?: string;
        duration_minutes: number;
        booking_type: BookingType;
        listing_ids: string[];
        scheduling_mode?: SchedulingMode;
        price_amount: number;
        deposit_amount?: number;
        appointment_type: "online" | "onsite" | "hybrid";
        location?: string;
        use_business_location: boolean;
        host_name?: string;
        host_title?: string;
        client_instructions?: string;
        buffer_minutes: number;
        image_url?: string;
      }>
    >(`/public/businesses/${businessId}/services`),
  listPublicServiceListings: (businessId: string, serviceId: string) =>
    request<Array<{ id: string; name: string; description?: string; status: ListingStatus; image_urls: string[] }>>(
      `/public/businesses/${businessId}/services/${serviceId}/listings`
    ),
  getPublicBusiness: (businessId: string) =>
    request<{
      id: string;
      name: string;
      business_type?: string;
      location?: string;
      country_code?: string;
      public_tagline?: string;
      public_description?: string;
      public_logo_url?: string;
      contact_email?: string | null;
      help_email?: string | null;
    }>(`/public/businesses/${businessId}`),
  listPublicAvailability: (
    businessId: string,
    serviceId: string,
    fromIso: string,
    toIso: string,
    listingId?: string
  ) =>
    request<{ slots: string[] }>(
      `/public/businesses/${businessId}/availability?service_id=${encodeURIComponent(serviceId)}&from_iso=${encodeURIComponent(fromIso)}&to_iso=${encodeURIComponent(toIso)}${
        listingId ? `&listing_id=${encodeURIComponent(listingId)}` : ""
      }`
    ),
  lookupPublicClient: (businessId: string, email: string) =>
    request<
      | { found: false }
      | { found: true; first_name: string; last_name: string; phone: string | null }
    >(`/public/businesses/${businessId}/clients/lookup?email=${encodeURIComponent(email)}`),
  createPublicBooking: (
    businessId: string,
    payload: {
      service_id: string;
      listing_id?: string;
      start_at: string;
      client_first_name: string;
      client_last_name: string;
      client_email: string;
      client_phone?: string;
      notes?: string;
      appointment_format?: "online" | "onsite";
      idempotency_key: string;
    }
  ) =>
    request<PublicBookingResponse>(`/public/businesses/${businessId}/bookings`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  confirmPublicPayment: (businessId: string, bookingId: string, reference?: string) =>
    request<PublicBookingResponse>(
      `/public/businesses/${businessId}/bookings/${bookingId}/confirm-payment${
        reference ? `?reference=${encodeURIComponent(reference)}` : ""
      }`,
      { method: "POST" }
    ),
  downloadPublicReceipt: async (businessId: string, bookingId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/public/businesses/${encodeURIComponent(businessId)}/bookings/${encodeURIComponent(bookingId)}/receipt`
    );
    if (!response.ok) {
      throw new Error("Unable to download receipt");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${bookingId.slice(0, 8)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  emailPublicReceipt: (businessId: string, bookingId: string) =>
    request<{ ok: boolean; email: string }>(
      `/public/businesses/${businessId}/bookings/${bookingId}/receipt/email`,
      { method: "POST" }
    ),
  listTransactions: () =>
    request<
      Array<{
        id: string;
        provider: string;
        provider_reference: string;
        status: string;
        amount: number;
        booking_id: string;
        created_at: string;
        client_name: string;
        service_name: string;
        service_price: number;
        deposit_amount: number;
      }>
    >("/payments/transactions"),
  adminMetrics: () =>
    request<{ tenants: number; bookings: number; mrr: number; active_tenants: number; trial_tenants: number; suspended_tenants: number }>(
      "/admin/metrics"
    ),
  adminSubscribers: () =>
    request<Array<{ id: string; name: string; business_type?: string; location?: string; status: string; plan_code: string; public_slug?: string; created_at?: string; onboarding_completed: boolean; owner?: string; owner_email?: string }>>(
      "/admin/subscribers"
    ),
  updateSubscriber: (tenantId: string, payload: {
    status?: string;
    plan_code?: string;
    grant_days?: number;
    name?: string;
    location?: string;
  }) =>
    request<{
      ok: boolean;
      plan_code?: string;
      status?: string;
      subscription_paid_until?: string | null;
    }>(`/admin/subscribers/${tenantId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteSubscriber: (tenantId: string) =>
    request<{ ok: boolean }>(`/admin/subscribers/${tenantId}`, { method: "DELETE" }),
  adminPayments: (params?: {
    q?: string;
    tenant_id?: string;
    purpose?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    page_size?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.tenant_id) search.set("tenant_id", params.tenant_id);
    if (params?.purpose) search.set("purpose", params.purpose);
    if (params?.status) search.set("status", params.status);
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    if (params?.page) search.set("page", String(params.page));
    if (params?.page_size) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return request<{
      items: Array<{
        id: string;
        tenant_id: string;
        tenant_name?: string | null;
        booking_id?: string | null;
        purpose: string;
        status: string;
        amount: number;
        platform_fee_amount?: number | null;
        tenant_settlement_amount?: number | null;
        currency: string;
        provider: string;
        provider_reference: string;
        paid_at?: string | null;
        created_at?: string | null;
        client_name?: string | null;
        client_email?: string | null;
        client_phone?: string | null;
      }>;
      total: number;
      page: number;
      page_size: number;
    }>(`/admin/payments${qs ? `?${qs}` : ""}`);
  },
  adminPaymentSummary: (params?: { tenant_id?: string; from?: string; to?: string }) => {
    const search = new URLSearchParams();
    if (params?.tenant_id) search.set("tenant_id", params.tenant_id);
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    const qs = search.toString();
    return request<{
      booking: {
        transactions: number;
        gross: number;
        platform_fee: number;
        settlement: number;
        succeeded: number;
        pending: number;
        failed: number;
        refunded: number;
        paying_clients: number;
        businesses_collecting: number;
      };
      subscription: {
        transactions: number;
        gross: number;
        platform_fee: number;
        settlement: number;
        succeeded: number;
        pending: number;
        failed: number;
        refunded: number;
      };
    }>(`/admin/payments/summary${qs ? `?${qs}` : ""}`);
  },
  adminPaymentsByTenant: (params?: { from?: string; to?: string }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    const qs = search.toString();
    return request<
      Array<{
        tenant_id: string;
        tenant_name: string;
        tenant_status: string;
        plan_code: string;
        transactions: number;
        clients: number;
        gross: number;
        platform_fee: number;
        settlement: number;
        pending: number;
        failed: number;
        last_payment_at?: string | null;
      }>
    >(`/admin/payments/by-tenant${qs ? `?${qs}` : ""}`);
  },
  adminTenantClientPayments: (tenantId: string, params?: { from?: string; to?: string }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    const qs = search.toString();
    return request<
      Array<{
        client_id: string;
        client_name: string;
        client_email: string;
        client_phone?: string | null;
        transactions: number;
        paid: number;
        pending: number;
        failed: number;
        last_payment_at?: string | null;
      }>
    >(`/admin/payments/tenant/${tenantId}/clients${qs ? `?${qs}` : ""}`);
  },
  adminPaymentDetail: (transactionId: string) =>
    request<{
      id: string;
      tenant_id: string;
      tenant_name?: string | null;
      booking_id?: string | null;
      purpose: string;
      status: string;
      amount: number;
      platform_fee_amount?: number | null;
      tenant_settlement_amount?: number | null;
      currency: string;
      provider: string;
      provider_reference: string;
      paid_at?: string | null;
      created_at?: string | null;
      client_name?: string | null;
      client_email?: string | null;
      client_phone?: string | null;
      idempotency_key?: string;
      authorization_url?: string | null;
      access_code?: string | null;
      tenant?: {
        id: string;
        name: string;
        status: string;
        plan_code: string;
        public_slug?: string | null;
        help_email?: string | null;
        phone_number?: string | null;
        location?: string | null;
        paystack_subaccount_id?: string | null;
        settlement_account_last4?: string | null;
        owner_name?: string | null;
        owner_email?: string | null;
      } | null;
      booking?: {
        id: string;
        status: string;
        start_at?: string | null;
        end_at?: string | null;
        notes?: string | null;
        service?: {
          id: string;
          name: string;
          price_amount: number;
          deposit_amount?: number | null;
        } | null;
        client?: {
          id: string;
          full_name: string;
          email: string;
          phone?: string | null;
        } | null;
      } | null;
      webhooks: Array<{
        id: string;
        provider: string;
        event_id: string;
        processed: boolean;
        attempts: number;
        next_attempt_at?: string | null;
        created_at?: string | null;
        payload: Record<string, unknown>;
      }>;
      timeline: Array<{
        label: string;
        at?: string | null;
        event_id?: string;
        processed?: boolean;
      }>;
    }>(`/admin/payments/${transactionId}`),
  adminPlans: () =>
    request<
      Array<{
        id: string;
        code: string;
        name: string;
        monthly_price: number;
        description: string;
        features: string[];
        entitlements: Record<string, unknown>;
        self_serve: boolean;
        is_active: boolean;
        is_featured: boolean;
        sort_order: number;
      }>
    >("/admin/plans"),
  createAdminPlan: (payload: {
    code: string;
    name: string;
    monthly_price: number;
    description?: string;
    features?: string[];
    entitlements?: Record<string, unknown>;
    self_serve?: boolean;
    is_active?: boolean;
    is_featured?: boolean;
    sort_order?: number;
  }) =>
    request<{
      id: string;
      code: string;
      name: string;
      monthly_price: number;
      description: string;
      features: string[];
      entitlements: Record<string, unknown>;
      self_serve: boolean;
      is_active: boolean;
      is_featured: boolean;
      sort_order: number;
    }>("/admin/plans", { method: "POST", body: JSON.stringify(payload) }),
  updateAdminPlan: (
    planCode: string,
    payload: {
      name?: string;
      monthly_price?: number;
      description?: string;
      features?: string[];
      entitlements?: Record<string, unknown>;
      self_serve?: boolean;
      is_active?: boolean;
      is_featured?: boolean;
      sort_order?: number;
    }
  ) =>
    request<{
      id: string;
      code: string;
      name: string;
      monthly_price: number;
      description: string;
      features: string[];
      entitlements: Record<string, unknown>;
      self_serve: boolean;
      is_active: boolean;
      is_featured: boolean;
      sort_order: number;
    }>(`/admin/plans/${planCode}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAdminPlan: (planCode: string) =>
    request<{ ok: boolean }>(`/admin/plans/${planCode}`, { method: "DELETE" }),
};

export function hasAccessToken(): boolean {
  syncAuthTokensFromStorage();
  return Boolean(accessToken);
}

export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof SessionExpiredError;
}

/** True while the stored tokens can still authenticate a request. */
export function hasLiveSession(): boolean {
  syncAuthTokensFromStorage();
  if (!accessToken && !refreshToken) return false;
  if (accessToken && !isTokenExpired(accessToken)) return true;
  return Boolean(refreshToken) && !isTokenExpired(refreshToken, 0);
}

export function getSessionRole(): string | null {
  syncAuthTokensFromStorage();
  return decodeToken(accessToken)?.role ?? null;
}

export function isPlatformAdminSession(): boolean {
  return getSessionRole() === "platform_admin";
}

export function endSession() {
  clearAuthTokens();
  redirectToLogin();
}

export function getRefreshToken(): string | null {
  return refreshToken;
}
