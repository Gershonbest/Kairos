// Accessible list row used for clients, bookings, transactions, and products.

import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../ui/utils";

type ListRowProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  to?: string;
};

export function ListRow({ children, className, onClick, to }: ListRowProps) {
  if (to) {
    return (
      <Link to={to} className={cn("workspace-row", className)}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn("workspace-row", className)}>
        {children}
      </button>
    );
  }

  return <div className={cn("workspace-row", className)}>{children}</div>;
}
