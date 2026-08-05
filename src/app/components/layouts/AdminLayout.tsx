// Guard for platform admin pages. Admin screens bring their own chrome, so
// this only enforces that a live platform-admin session is present.

import { Outlet } from "react-router";
import { hasLiveSession, isPlatformAdminSession } from "../../../lib/api/client";
import { useSessionGuard } from "../../../lib/auth/useSessionGuard";

export function AdminLayout() {
  useSessionGuard({
    requiredRole: "platform_admin",
    redirectOnRoleMismatch: "/dashboard",
    redirectWhenSignedOut: "/admin/login",
  });

  if (!hasLiveSession() || !isPlatformAdminSession()) return null;

  return <Outlet />;
}
