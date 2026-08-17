// Keeps the rendered area in sync with the stored session: signs the user
// out when it expires and stops one role's session from rendering another
// role's area.

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { endSession, getSessionRole, hasLiveSession } from "../api/client";
import { isPlatformPaymentReturn } from "../payments/platformReturn";

const CHECK_INTERVAL_MS = 20_000;

interface SessionGuardOptions {
  /** Role required for this area, if any. */
  requiredRole?: string;
  /** Role that must never render this area, if any. */
  forbiddenRole?: string;
  /** Where to send a session whose role does not belong here. */
  redirectOnRoleMismatch?: string;
  /** Where to send a visitor with no session at all. */
  redirectWhenSignedOut: string;
}

export function useSessionGuard({
  requiredRole,
  forbiddenRole,
  redirectOnRoleMismatch,
  redirectWhenSignedOut,
}: SessionGuardOptions) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const check = () => {
      if (!hasLiveSession()) {
        // Stay on this URL while Paystack return params are verified.
        if (isPlatformPaymentReturn()) return;
        // A session that can no longer be refreshed is over: drop the cached
        // data and send the user to login instead of leaving the last
        // account's screen on display.
        if (
          localStorage.getItem("orheo_access_token") ||
          localStorage.getItem("orheo_refresh_token") ||
          localStorage.getItem("kairos_access_token") ||
          localStorage.getItem("kairos_refresh_token")
        ) {
          endSession();
        } else {
          const here = `${location.pathname}${location.search}`;
          const loginPath =
            redirectWhenSignedOut.startsWith("/auth/login") && here && here !== "/auth/login"
              ? `${redirectWhenSignedOut}?redirect=${encodeURIComponent(here)}`
              : redirectWhenSignedOut;
          navigate(loginPath, { replace: true });
        }
        return;
      }

      if (!redirectOnRoleMismatch) return;
      const role = getSessionRole();
      if ((requiredRole && role !== requiredRole) || (forbiddenRole && role === forbiddenRole)) {
        navigate(redirectOnRoleMismatch, { replace: true });
      }
    };

    check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    // Signing out in one tab must sign out every other tab.
    window.addEventListener("storage", check);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("storage", check);
    };
  }, [navigate, location.pathname, location.search, requiredRole, forbiddenRole, redirectOnRoleMismatch, redirectWhenSignedOut]);
}
