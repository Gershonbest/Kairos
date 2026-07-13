// Application route definitions for public, auth, dashboard, and admin areas.

import { createBrowserRouter } from "react-router";
import { SignUp } from "./pages/auth/SignUp";
import { Login } from "./pages/auth/Login";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { BusinessSetup } from "./pages/onboarding/BusinessSetup";
import { ServiceCreation } from "./pages/onboarding/ServiceCreation";
import { AvailabilityScheduling } from "./pages/onboarding/AvailabilityScheduling";
import { PaymentIntegration } from "./pages/onboarding/PaymentIntegration";
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
import { PublicBooking } from "./pages/public/PublicBooking";
import { LandingPage } from "./pages/marketing/LandingPage";
import { SystemAdmin } from "./pages/admin/SystemAdmin";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { SubscriberManagement } from "./pages/admin/SubscriberManagement";
import { PlanSettings } from "./pages/admin/PlanSettings";
import { DashboardLayout } from "./components/layouts/DashboardLayout";
import { PublicLayout } from "./components/layouts/PublicLayout";
import { AuthLayout } from "./components/layouts/AuthLayout";

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
    ],
  },
  // Legacy routes for backwards compatibility
  { path: "/login", Component: Login },
  { path: "/signup", Component: SignUp },
  { path: "/verify-email", Component: VerifyEmail },
  // System Admin Routes
  { path: "/admin/login", Component: AdminLogin },
  { path: "/admin", Component: SystemAdmin },
  { path: "/admin/subscribers", Component: SubscriberManagement },
  { path: "/admin/plans", Component: PlanSettings },
  {
    path: "/onboarding",
    Component: AuthLayout,
    children: [
      { index: true, Component: BusinessSetup },
      { path: "services", Component: ServiceCreation },
      { path: "availability", Component: AvailabilityScheduling },
      { path: "payment", Component: PaymentIntegration },
    ],
  },
  {
    path: "/dashboard",
    Component: DashboardLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "calendar", Component: BookingCalendar },
      { path: "availability", Component: AvailabilitySettings },
      { path: "choose-plan", Component: ChoosePlan },
      { path: "services", Component: ServicesManagement },
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