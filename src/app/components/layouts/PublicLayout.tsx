// Layout wrapper for marketing and public booking pages.

import { Outlet } from "react-router";

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}
