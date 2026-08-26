// Application route definitions for public, auth, dashboard, and admin areas.

import { createElement } from "react";
import { Navigate, createBrowserRouter } from "react-router";
import { SignUp } from "./pages/auth/SignUp";
import { Login } from "./pages/auth/Login";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { AcceptInvite } from "./pages/auth/AcceptInvite";
import { Dashboard } from "./pages/dashboard/Dashboard";
import { BookingCalendar } from "./pages/dashboard/BookingCalendar";
import { ServicesManagement } from "./pages/dashboard/ServicesManagement";
import { ClientManagement } from "./pages/dashboard/ClientManagement";
import { ClientDetailPage } from "./pages/dashboard/ClientDetailPage";
import { PaymentsDashboard } from "./pages/dashboard/PaymentsDashboard";
import { ChoosePlan } from "./pages/dashboard/ChoosePlan";
import { AvailabilitySettings } from "./pages/dashboard/AvailabilitySettings";
import { AccountSettings } from "./pages/dashboard/AccountSettings";
import { AIAssistant } from "./pages/dashboard/AIAssistant";
import { BookingLinksManagement } from "./pages/dashboard/BookingLinksManagement";
import { ListingsManagement } from "./pages/dashboard/ListingsManagement";
import { TeamManagement } from "./pages/dashboard/TeamManagement";
import { PublicBooking } from "./pages/public/PublicBooking";
import { LandingPage } from "./pages/marketing/LandingPage";
import { PricingPage } from "./pages/marketing/PricingPage";
import { FaqPage } from "./pages/marketing/FaqPage";
import { PrivacyPage } from "./pages/marketing/PrivacyPage";
import { TermsPage } from "./pages/marketing/TermsPage";
import { NotFoundPage } from "./pages/marketing/NotFoundPage";
import { SystemAdmin } from "./pages/admin/SystemAdmin";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { SubscriberManagement } from "./pages/admin/SubscriberManagement";
import { PaymentLogs } from "./pages/admin/PaymentLogs";
import { PlanCatalog } from "./pages/admin/PlanCatalog";
import { AdminLayout } from "./components/layouts/AdminLayout";
import { DashboardLayout } from "./components/layouts/DashboardLayout";
import { PublicLayout } from "./components/layouts/PublicLayout";
import { AuthLayout } from "./components/layouts/AuthLayout";

function RedirectToDashboard() {
  return createElement(Navigate, { to: "/dashboard", replace: true });
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: PublicLayout,
    children: [
      { index: true, Component: LandingPage },
      { path: "pricing", Component: PricingPage },
      { path: "faq", Component: FaqPage },
      { path: "privacy", Component: PrivacyPage },
      { path: "terms", Component: TermsPage },
    ],
  },
  {
    path: "/auth",
    Component: AuthLayout,
    children: [
      { path: "login", Component: Login },
      { path: "signup", Component: SignUp },
      { path: "verify-email", Component: VerifyEmail },
      { path: "forgot-password", Component: ForgotPassword },
      { path: "reset-password", Component: ResetPassword },
    ],
  },
  // Legacy routes for backwards compatibility
  { path: "/login", Component: Login },
  { path: "/signup", Component: SignUp },
  { path: "/verify-email", Component: VerifyEmail },
  { path: "/forgot-password", Component: ForgotPassword },
  { path: "/reset-password", Component: ResetPassword },
  { path: "/invite/:token", Component: AcceptInvite },
  // System Admin Routes
  { path: "/admin/login", Component: AdminLogin },
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: SystemAdmin },
      { path: "subscribers", Component: SubscriberManagement },
      { path: "payments", Component: PaymentLogs },
      { path: "plans", Component: PlanCatalog },
    ],
  },
  { path: "/onboarding", Component: RedirectToDashboard },
  { path: "/onboarding/*", Component: RedirectToDashboard },
  {
    path: "/dashboard",
    Component: DashboardLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "calendar", Component: BookingCalendar },
      { path: "availability", Component: AvailabilitySettings },
      { path: "choose-plan", Component: ChoosePlan },
      { path: "services", Component: ServicesManagement },
      { path: "products", Component: ListingsManagement },
      { path: "listings", Component: ListingsManagement },
      { path: "clients", Component: ClientManagement },
      { path: "clients/:clientId", Component: ClientDetailPage },
      { path: "payments", Component: PaymentsDashboard },
      { path: "booking-links", Component: BookingLinksManagement },
      { path: "settings", Component: AccountSettings },
      { path: "team", Component: TeamManagement },
      { path: "ai-assistant", Component: AIAssistant },
      { path: "orion", Component: AIAssistant },
    ],
  },
  {
    path: "/book/:businessId",
    Component: PublicLayout,
    children: [
      { index: true, Component: PublicBooking },
    ],
  },
  { path: "*", Component: NotFoundPage },
]);