// Minimal layout wrapper for authentication and onboarding pages.

import { Outlet } from "react-router";
import { useForceLightTheme } from "../theme/ThemeProvider";

export function AuthLayout() {
  useForceLightTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}
