// Sidebar navigation layout for tenant dashboard pages.

import { Outlet, NavLink, useLocation, useNavigate, useSearchParams } from "react-router";
import {
  LayoutDashboard,
  Calendar,
  Briefcase,
  Users,
  DollarSign,
  Link as LinkIcon,
  Bot,
  LogOut,
  Menu,
  Settings,
  Clock,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { Button } from "../ui/button";
import { CommandPalette, openCommandPalette } from "../dashboard-ui/CommandPalette";
import { TrialBanner } from "../billing/TrialBanner";
import { NotificationBell } from "../notifications/NotificationBell";
import { ThemeToggle } from "../theme/ThemeToggle";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import orheoLogo from "../../../assets/orheo-logo.png";
import {
  api,
  hasAccessToken,
  hasLiveSession,
  isPlatformAdminSession,
  type SubscriptionStatus,
} from "../../../lib/api/client";
import { BrandLoader } from "../brand/BrandLoader";
import { OrionFloatingWidget } from "../orion/OrionFloatingWidget";
import { useSessionGuard } from "../../../lib/auth/useSessionGuard";
import { markWelcomeAfterPayment } from "../../../lib/auth/welcome";
import { queryKeys } from "../../../lib/queryClient";
import { readPlatformPaymentReference } from "../../../lib/payments/platformReturn";

const SIDEBAR_COLLAPSED_KEY = "orheo_sidebar_collapsed";

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ path: string; icon: typeof Calendar; label: string; permission?: string }>;
}> = [
  {
    label: "Overview",
    items: [{ path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" }],
  },
  {
    label: "Schedule",
    items: [
      { path: "/dashboard/calendar", icon: Calendar, label: "Calendar" },
      { path: "/dashboard/availability", icon: Clock, label: "Availability" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { path: "/dashboard/services", icon: Briefcase, label: "Services", permission: "services:write" },
      { path: "/dashboard/products", icon: Package, label: "Products", permission: "services:write" },
    ],
  },
  {
    label: "Customers",
    items: [
      { path: "/dashboard/clients", icon: Users, label: "Clients" },
      { path: "/dashboard/payments", icon: DollarSign, label: "Payments", permission: "payments:manage" },
      { path: "/dashboard/booking-links", icon: LinkIcon, label: "Booking Links" },
    ],
  },
  {
    label: "Assistant",
    items: [{ path: "/dashboard/orion", icon: Bot, label: "Orion" }],
  },
  {
    label: "Settings",
    items: [
      { path: "/dashboard/settings", icon: Settings, label: "Settings" },
      { path: "/dashboard/team", icon: Users, label: "Team", permission: "team:manage" },
    ],
  },
];

const PAGE_TITLES: Array<{ match: string; title: string }> = [
  { match: "/dashboard/calendar", title: "Calendar" },
  { match: "/dashboard/availability", title: "Availability" },
  { match: "/dashboard/services", title: "Services" },
  { match: "/dashboard/products", title: "Products" },
  { match: "/dashboard/listings", title: "Products" },
  { match: "/dashboard/clients", title: "Clients" },
  { match: "/dashboard/payments", title: "Payments" },
  { match: "/dashboard/booking-links", title: "Booking Links" },
  { match: "/dashboard/settings", title: "Settings" },
  { match: "/dashboard/team", title: "Team" },
  { match: "/dashboard/orion", title: "Orion" },
  { match: "/dashboard/ai-assistant", title: "Orion" },
  { match: "/dashboard/choose-plan", title: "Choose a plan" },
];

function pageTitleFor(pathname: string): string {
  return PAGE_TITLES.find((entry) => pathname.startsWith(entry.match))?.title ?? "Dashboard";
}

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const paymentReference = readPlatformPaymentReference(searchParams);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const [user, setUser] = useState<{
    full_name: string;
    email: string;
    permissions?: string[];
    is_owner?: boolean;
  } | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const handleLogout = () => {
    setUser(null);
    setSubscription(null);
    void api.logout().finally(() => navigate("/", { replace: true }));
  };

  useSessionGuard({
    forbiddenRole: "platform_admin",
    redirectOnRoleMismatch: "/admin",
    redirectWhenSignedOut: "/auth/login",
  });

  useEffect(() => {
    if (!paymentReference) return;
    let cancelled = false;
    api
      .verifyPaymentReference(paymentReference)
      .then(async (result) => {
        if (cancelled) return;
        if (!result.ok) {
          if (result.status === "failed") {
            throw new Error(result.message || "Payment failed or was cancelled. You can try again.");
          }
          throw new Error(
            result.message || "Payment is still processing. Wait a moment, then refresh this page."
          );
        }
        markWelcomeAfterPayment();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.subscriptionStatus }),
          queryClient.invalidateQueries({ queryKey: queryKeys.settingsBundle }),
          queryClient.invalidateQueries({ queryKey: queryKeys.me }),
          queryClient.invalidateQueries({ queryKey: queryKeys.tenant }),
        ]);
        navigate("/dashboard", { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        navigate("/dashboard/choose-plan", {
          replace: true,
          state: {
            paymentError: err instanceof Error ? err.message : "Unable to verify payment.",
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, paymentReference, queryClient]);

  useEffect(() => {
    if (!hasAccessToken() || isPlatformAdminSession()) {
      return;
    }
    if (paymentReference) return;

    api
      .me()
      .then((profile) => {
        setUser(profile);
        if (profile.subscription) {
          setSubscription(profile.subscription);
          if (
            profile.subscription.requires_plan_selection &&
            !location.pathname.startsWith("/dashboard/choose-plan") &&
            !(
              profile.subscription.status === "suspended" &&
              location.pathname.startsWith("/dashboard/settings")
            )
          ) {
            navigate("/dashboard/choose-plan", { replace: true });
          }
        }
      })
      .catch(() => {
        // The API client already redirects to login on a real 401. Aborted
        // fetches (e.g. the 402 redirect to /dashboard/choose-plan) must not
        // clear the session, or a locked-out tenant gets signed out instead.
      });
  }, [navigate, location.pathname, paymentReference]);

  useEffect(() => {
    if (!hasAccessToken() || isPlatformAdminSession()) return;
    if (paymentReference) return;
    if (location.pathname.startsWith("/dashboard/choose-plan")) return;
    api
      .getSubscriptionStatus()
      .then((status) => {
        setSubscription(status);
        if (
          status.requires_plan_selection &&
          !(status.status === "suspended" && location.pathname.startsWith("/dashboard/settings"))
        ) {
          navigate("/dashboard/choose-plan", { replace: true });
        }
      })
      .catch(() => {
        // Non-blocking if status check fails during navigation.
      });
  }, [location.pathname, navigate, paymentReference]);

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2)
    : "KB";

  // Child pages fetch on mount, so an admin (or expired) session must not
  // reach them even for the frame before the guard redirects.
  if (paymentReference) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <BrandLoader label="Confirming your payment…" size="lg" fullscreen />
      </div>
    );
  }

  if (!hasLiveSession() || isPlatformAdminSession()) return null;

  const pageTitle = pageTitleFor(location.pathname);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground
          border-r border-sidebar-border transition-[transform,width] duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${collapsed ? "w-64 lg:w-[76px]" : "w-64"}
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div
          className={`flex h-16 shrink-0 items-center border-b border-sidebar-border ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          } px-5`}
        >
          <div className="flex items-center gap-2.5">
            <img src={orheoLogo} alt="Orheo" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            <span
              className={`text-lg font-semibold tracking-tight text-sidebar-foreground ${
                collapsed ? "lg:hidden" : ""
              }`}
            >
              Orheo
            </span>
          </div>
        </div>

        <nav className="workspace-scroll flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(
              (item) => !item.permission || user?.permissions?.includes(item.permission)
            );
            if (items.length === 0) return null;
            return (
            <div key={group.label} className="mb-5 last:mb-0">
              <p className={`workspace-nav-group-label ${collapsed ? "lg:hidden" : ""}`}>
                {group.label}
              </p>
              <div className="space-y-1">
                {items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/dashboard"}
                    onClick={() => setSidebarOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) => `
                      flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors
                      ${collapsed ? "lg:justify-center lg:px-0" : ""}
                      ${
                        isActive
                          ? "bg-sidebar-primary/15 font-medium text-sidebar-primary"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }
                    `}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className={`flex items-center gap-3 px-2 py-2 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
              {initials}
            </div>
            <div className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user?.full_name ?? "Business User"}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/60">{user?.email ?? ""}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title={collapsed ? "Log out" : undefined}
            className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
              collapsed ? "lg:justify-center lg:px-0" : ""
            }`}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span className={collapsed ? "lg:hidden" : ""}>Log out</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={() => setCollapsed((current) => !current)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              {pageTitle}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCommandPalette}
              className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:flex"
            >
              <Search className="h-3.5 w-3.5" />
              Search
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle compact />
            <NotificationBell />
          </div>
        </header>

        <main className="workspace-scroll flex-1 overflow-y-auto">
          {subscription?.warning_level === "ending_soon" && subscription.warning_message && (
            <TrialBanner
              message={subscription.warning_message}
              daysRemaining={subscription.days_remaining}
              variant="ending_soon"
            />
          )}
          {subscription?.warning_level === "expired" && subscription.warning_message && (
            <TrialBanner message={subscription.warning_message} variant="expired" />
          )}
          {subscription?.warning_level === "suspended" && subscription.warning_message && (
            <TrialBanner message={subscription.warning_message} variant="suspended" />
          )}
          <Outlet />
        </main>
        <OrionFloatingWidget />
        <CommandPalette permissions={user?.permissions} />
      </div>
    </div>
  );
}
