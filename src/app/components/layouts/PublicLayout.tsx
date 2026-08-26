// Layout wrapper for marketing and public booking pages.

import { Outlet, useLocation } from "react-router";
import { ThemeToggle } from "../theme/ThemeToggle";

export function PublicLayout() {
  const { pathname } = useLocation();
  const isBookingPage = pathname.startsWith("/book/");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isBookingPage && (
        <div className="fixed right-4 top-4 z-50">
          <ThemeToggle compact />
        </div>
      )}
      <Outlet />
    </div>
  );
}
