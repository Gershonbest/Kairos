import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  bookings: ["bookings"] as const,
  clients: ["clients"] as const,
  client: (clientId: string) => ["clients", clientId] as const,
  clientEmailTemplates: ["client-email-templates"] as const,
  clientCommunications: (clientId: string) => ["client-communications", clientId] as const,
  schedulingInsights: ["scheduling-insights"] as const,
  services: ["services"] as const,
  listings: ["listings"] as const,
  dashboardSummary: ["dashboard-summary"] as const,
  dashboardHomeStats: ["dashboard-home-stats"] as const,
  bookingLinks: ["booking-links"] as const,
  availability: ["availability"] as const,
  calendarBlocks: ["calendar-blocks"] as const,
  transactions: ["transactions"] as const,
  balanceTracking: ["balance-tracking"] as const,
  paymentProvider: ["payment-provider"] as const,
  paymentConfig: ["payments", "config"] as const,
  me: ["me"] as const,
  tenant: ["tenant"] as const,
  notificationPrefs: ["notification-prefs"] as const,
  subscriptionStatus: ["subscription-status"] as const,
  subscriptionPlans: ["subscription-plans"] as const,
  paystackBanks: ["paystack-banks"] as const,
  settingsBundle: ["settings-bundle"] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
