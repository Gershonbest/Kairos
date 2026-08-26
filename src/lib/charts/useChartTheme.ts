// Theme-aware Recharts styling so charts read correctly in light and dark mode.

import { useMemo } from "react";
import { useTheme } from "../../app/components/theme/ThemeProvider";

export type ChartTheme = {
  grid: string;
  axis: string;
  series: string[];
  tooltipStyle: React.CSSProperties;
  tooltipItemStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
};

export function useChartTheme(): ChartTheme {
  // Recharts takes colors as props rather than CSS, so the resolved theme has to
  // be a dependency for charts to restyle when the user toggles light/dark.
  const { resolvedTheme } = useTheme();

  return useMemo(
    () => ({
      grid: "var(--color-chart-grid)",
      axis: "var(--color-chart-axis)",
      series: [
        "var(--color-chart-1)",
        "var(--color-chart-2)",
        "var(--color-chart-4)",
        "var(--color-chart-5)",
      ],
      tooltipStyle: {
        backgroundColor: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "0.75rem",
        boxShadow: "0 12px 32px -12px rgba(15, 23, 42, 0.35)",
        color: "var(--color-foreground)",
        fontSize: "0.8125rem",
      },
      tooltipItemStyle: { color: "var(--color-foreground)" },
      tooltipLabelStyle: { color: "var(--color-muted-foreground)", fontWeight: 600 },
    }),
    [resolvedTheme],
  );
}
