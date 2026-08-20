// Application route definitions for public, auth, dashboard, and admin areas.

import { createElement } from "react";
import { Navigate, createBrowserRouter } from "react-router";
import { SignUp } from "./pages/auth/SignUp";
import { Login } from "./pages/auth/Login";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { Dashboard } from "./pages/dashboard/Dashboard";
import { BookingCalendar } from "./pages/dashboard/BookingCalendar";
import { ServicesManagement } from "./pages/dashboard/ServicesManagement";
import { ClientManagement } from "./pages/dashboard/ClientManagement";
import { PaymentsDashboard } from "./pages/dashboard/PaymentsDashboard";
import { ChoosePlan } from "./pages/dashboard/ChoosePlan";
import { AvailabilitySettings } from "./pages/dashboard/AvailabilitySettings";
import { AccountSettings } from "./pages/dashboard/AccountSettings";
import { AIAssistant } from "./pages/dashboard/AIAssistant";
import { BookingLinksManagement } from "./pages/dashboard/BookingLinksManagement";
import { ListingsManagement } from "./pages/dashboard/ListingsManagement";
import { PublicBooking } from "./pages/public/PublicBooking";
import { LandingPage } from "./pages/marketing/LandingPage";
import { SystemAdmin } from "./pages/admin/SystemAdmin";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { SubscriberManagement } from "./pages/admin/SubscriberManagement";
import { PaymentLogs } from "./pages/admin/PaymentLogs";
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
  // System Admin Routes
  { path: "/admin/login", Component: AdminLogin },
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: SystemAdmin },
      { path: "subscribers", Component: SubscriberManagement },
      { path: "payments", Component: PaymentLogs },
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
      { path: "payments", Component: PaymentsDashboard },
      { path: "booking-links", Component: BookingLinksManagement },
      { path: "settings", Component: AccountSettings },
      { path: "ai-assistant", Component: AIAssistant },
    ],
  },
  {
    path: "/book/:businessId",
    Component: PublicLayout,
    children: [
      { index: true, Component: PublicBooking },
    ],
  },
]);