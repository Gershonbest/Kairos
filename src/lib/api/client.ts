// Typed HTTP API client with auth token handling.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

let accessToken: string | null = localStorage.getItem("kairos_access_token");
let refreshToken: string | null = localStorage.getItem("kairos_refresh_token");
let isRedirectingToLogin = false;

const AUTH_PATHS_WITHOUT_SESSION = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/admin/login",
  "/auth/google",
  "/auth/verify-email",
  "/auth/resend-verification",
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

export function setAuthTokens(tokens: { access_token: string; refresh_token: string }) {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  localStorage.setItem("kairos_access_token", tokens.access_token);
  localStorage.setItem("kairos_refresh_token", tokens.refresh_token);
}

export function clearAuthTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("kairos_access_token");
  localStorage.removeItem("kairos_refresh_token");
}

function syncAuthTokensFromStorage() {
  accessToken = localStorage.getItem("kairos_access_token");
  refreshToken = localStorage.getItem("kairos_refresh_token");
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

async function refreshAccessToken(): Promise<boolean> {
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
  }
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

export interface PublicBookingResponse {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  client_id: string;
  service_id: string;
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
}

export interface BookingListItem {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  client_id: string;
  service_id: string;
  client_name: string;
  client_email?: string | null;
  client_phone?: string | null;
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
  replaceAvailability: (payload: { rules: AvailabilityRulePayload[] }) =>
    request<{ ok: boolean }>("/availability", { method: "PUT", body: JSON.stringify(payload) }),
  listAvailability: () =>
    request<Array<{ id: string; day_of_week: number; start_time: string; end_time: string; is_enabled: boolean }>>(
      "/availability"
    ),
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
      reference: string;
      purpose?: string;
      booking_id?: string | null;
      transaction_id?: string;
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
  listPublicAvailability: (businessId: string, serviceId: string, fromIso: string, toIso: string) =>
    request<{ slots: string[] }>(
      `/public/businesses/${businessId}/availability?service_id=${encodeURIComponent(serviceId)}&from_iso=${encodeURIComponent(fromIso)}&to_iso=${encodeURIComponent(toIso)}`
    ),
  createPublicBooking: (
    businessId: string,
    payload: {
      service_id: string;
      start_at: string;
      client_name: string;
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
  updateSubscriber: (tenantId: string, payload: { status?: string; plan_code?: string; name?: string; location?: string }) =>
    request<{ ok: boolean }>(`/admin/subscribers/${tenantId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteSubscriber: (tenantId: string) =>
    request<{ ok: boolean }>(`/admin/subscribers/${tenantId}`, { method: "DELETE" }),
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

export function getRefreshToken(): string | null {
  return refreshToken;
}
