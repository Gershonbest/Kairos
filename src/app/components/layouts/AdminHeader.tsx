// Shared header for platform admin pages so every screen exposes the same
// navigation and theme control.

import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Calendar, LogOut } from "lucide-react";
import { ThemeToggle } from "../theme/ThemeToggle";
import { api } from "../../../lib/api/client";

type AdminHeaderProps = {
  title: string;
  subtitle?: string;
  /** Where the logo links to. Defaults to the admin dashboard. */
  homeTo?: string;
  children?: ReactNode;
};

export function AdminHeader({ title, subtitle, homeTo = "/admin", children }: AdminHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="bg-card border-b border-border sticky top-0 z-10">
      <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <Link to={homeTo} className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          {children}
          <ThemeToggle compact />
          <button
            onClick={() => void api.logout().finally(() => navigate("/admin/login", { replace: true }))}
            className="px-4 py-2 text-sm text-foreground flex items-center gap-2 border border-border rounded-lg hover:bg-muted"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

export const adminNavLinkClass =
  "px-4 py-2 text-sm text-foreground flex items-center gap-2 border border-border rounded-lg hover:bg-muted";

export const adminGhostLinkClass =
  "px-4 py-2 text-sm text-muted-foreground hover:text-foreground flex items-center gap-2";

export const adminInputClass =
  "px-3 py-2 rounded-lg text-sm bg-input-background text-foreground border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40";
