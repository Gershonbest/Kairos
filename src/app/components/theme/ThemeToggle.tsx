import { Laptop, Moon, Sun } from "lucide-react";

import { Button } from "../ui/button";
import { useTheme } from "./ThemeProvider";

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label =
    theme === "system"
      ? `Theme: System (${isDark ? "dark" : "light"})`
      : `Theme: ${theme === "dark" ? "Dark" : "Light"}`;

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "sm"}
      className={className}
      onClick={toggleTheme}
      aria-label={`${label}. Click to cycle theme`}
      title={`${label}. Click to cycle theme`}
    >
      {theme === "system" ? <Laptop className="h-4 w-4" /> : isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && <span>{label}</span>}
    </Button>
  );
}

