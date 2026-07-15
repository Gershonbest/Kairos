// Minimal layout wrapper for authentication and onboarding pages.

import { Outlet } from "react-router";
import { ThemeToggle } from "../theme/ThemeToggle";

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle compact />
      </div>
      <Outlet />
    </div>
  );
}
