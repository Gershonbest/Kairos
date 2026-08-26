// Consistent page container and enter transition for dashboard pages.

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "../ui/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  /** Narrow column for form-heavy pages like settings and availability. */
  width?: "wide" | "narrow";
};

export function PageShell({ children, className, width = "wide" }: PageShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("workspace-page space-y-6", width === "narrow" && "max-w-3xl", className)}
    >
      {children}
    </motion.div>
  );
}
