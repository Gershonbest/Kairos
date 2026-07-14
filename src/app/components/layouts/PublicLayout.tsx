// Layout wrapper for marketing and public booking pages.

import { Outlet } from "react-router";
import { ThemeToggle } from "../theme/ThemeToggle";

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle compact />
      </div>
      <Outlet />
    </div>
  );
}
