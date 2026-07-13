// Sidebar navigation layout for tenant dashboard pages.

import { Outlet, NavLink, useLocation, useNavigate } from "react-router";
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
} from "lucide-react";
import { Button } from "../ui/button";
import { TrialBanner } from "../billing/TrialBanner";
import { useEffect, useState } from "react";
import {
  api,
  clearAuthTokens,
  hasAccessToken,
  isSessionExpiredError,
  type SubscriptionStatus,
} from "../../../lib/api/client";

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ full_name: string; email: string } | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

  const handleLogout = () => {
    clearAuthTokens();
    navigate("/");
  };

  useEffect(() => {
    if (!hasAccessToken()) {
      navigate("/auth/login", { replace: true });
      return;
    }

    api
      .me()
      .then((profile) => {
        setUser(profile);
        if (profile.subscription) {
          setSubscription(profile.subscription);
          if (
            profile.subscription.requires_plan_selection &&
            !location.pathname.startsWith("/dashboard/choose-plan")
          ) {
            navigate("/dashboard/choose-plan", { replace: true });
          }
        }
      })
      .catch((error) => {
        if (isSessionExpiredError(error)) return;
        clearAuthTokens();
        navigate("/auth/login", { replace: true });
      });
  }, [navigate, location.pathname]);

  useEffect(() => {
    if (!hasAccessToken() || location.pathname.startsWith("/dashboard/choose-plan")) return;
    api
      .getSubscriptionStatus()
      .then((status) => {
        setSubscription(status);
        if (status.requires_plan_selection) {
          navigate("/dashboard/choose-plan", { replace: true });
        }
      })
      .catch(() => {
        // Non-blocking if status check fails during navigation.
      });
  }, [location.pathname, navigate]);

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2)
    : "KB";

  const navItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/dashboard/calendar", icon: Calendar, label: "Calendar" },
    { path: "/dashboard/availability", icon: Clock, label: "Availability" },
    { path: "/dashboard/services", icon: Briefcase, label: "Services" },
    { path: "/dashboard/clients", icon: Users, label: "Clients" },
    { path: "/dashboard/payments", icon: DollarSign, label: "Payments" },
    { path: "/dashboard/booking-links", icon: LinkIcon, label: "Booking Links" },
    { path: "/dashboard/settings", icon: Settings, label: "Settings" },
    { path: "/dashboard/ai-assistant", icon: Bot, label: "AI Assistant" },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#22c55e] flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg">Kairos Bookings</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/dashboard"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                  ${isActive 
                    ? 'bg-[#7c3aed] text-white' 
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] flex items-center justify-center text-white">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name ?? "Business User"}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email ?? ""}</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 mb-2"
              onClick={() => navigate("/dashboard/settings")}
            >
              <Settings className="w-4 h-4" />
              Account settings
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden h-16 bg-white border-b border-gray-200 flex items-center px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </Button>
          <span className="ml-4 font-semibold">Kairos Bookings</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
