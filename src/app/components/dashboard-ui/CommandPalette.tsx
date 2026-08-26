// Cmd/Ctrl-K palette for jumping between dashboard pages and quick actions.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bot,
  Calendar,
  CalendarOff,
  Clock,
  DollarSign,
  LayoutDashboard,
  Link as LinkIcon,
  Package,
  Plus,
  Settings,
  Briefcase,
  UserPlus,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";

type PaletteEntry = {
  label: string;
  to: string;
  icon: typeof Calendar;
  keywords?: string;
  permission?: string;
};

const NAVIGATE: PaletteEntry[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, keywords: "home overview" },
  { label: "Calendar", to: "/dashboard/calendar", icon: Calendar, keywords: "bookings schedule" },
  { label: "Availability", to: "/dashboard/availability", icon: Clock, keywords: "hours opening" },
  { label: "Services", to: "/dashboard/services", icon: Briefcase, keywords: "offerings pricing", permission: "services:write" },
  { label: "Products", to: "/dashboard/products", icon: Package, keywords: "listings inventory", permission: "services:write" },
  { label: "Clients", to: "/dashboard/clients", icon: Users, keywords: "customers people" },
  { label: "Payments", to: "/dashboard/payments", icon: DollarSign, keywords: "revenue transactions", permission: "payments:manage" },
  { label: "Booking links", to: "/dashboard/booking-links", icon: LinkIcon, keywords: "share public url" },
  { label: "Orion", to: "/dashboard/orion", icon: Bot, keywords: "ai assistant chat" },
  { label: "Settings", to: "/dashboard/settings", icon: Settings, keywords: "account business profile" },
  { label: "Team", to: "/dashboard/team", icon: Users, keywords: "staff invite seats", permission: "team:manage" },
];

const ACTIONS: PaletteEntry[] = [
  { label: "New booking", to: "/dashboard/calendar?new=1", icon: Plus, keywords: "create appointment" },
  { label: "Block time off", to: "/dashboard/calendar?block=1", icon: CalendarOff, keywords: "holiday leave" },
  { label: "Add a client", to: "/dashboard/clients?new=1", icon: UserPlus, keywords: "create customer" },
  { label: "Ask Orion", to: "/dashboard/orion", icon: Bot, keywords: "ai help question" },
];

const OPEN_EVENT = "orheo:open-command-palette";

/** Lets the header search button open the palette without faking a keypress. */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette({ permissions }: { permissions?: string[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const allowed = (entry: PaletteEntry) => !entry.permission || permissions?.includes(entry.permission);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpenRequest = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenRequest);
    };
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to a page or start a task"
    >
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>Nothing matched that search.</CommandEmpty>
        <CommandGroup heading="Quick actions">
          {ACTIONS.filter(allowed).map((entry) => (
            <CommandItem
              key={entry.label}
              value={`${entry.label} ${entry.keywords ?? ""}`}
              onSelect={() => go(entry.to)}
            >
              <entry.icon />
              {entry.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {NAVIGATE.filter(allowed).map((entry) => (
            <CommandItem
              key={entry.to}
              value={`${entry.label} ${entry.keywords ?? ""}`}
              onSelect={() => go(entry.to)}
            >
              <entry.icon />
              {entry.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
