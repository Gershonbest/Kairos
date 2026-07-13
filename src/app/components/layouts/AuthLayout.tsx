// Minimal layout wrapper for authentication and onboarding pages.

import { Outlet } from "react-router";

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-white">
      <Outlet />
    </div>
  );
}
