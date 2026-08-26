import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "orheo_theme";
const LEGACY_THEME_STORAGE_KEY = "kairos_theme";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Temporarily force light mode for public/auth surfaces. Returns unlock. */
  lockLightTheme: () => () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function detectInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored =
    window.localStorage.getItem(THEME_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
      window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    }
    return stored;
  }
  return "system";
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(detectInitialTheme);
  const [lightLocks, setLightLocks] = useState(0);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(detectInitialTheme()),
  );

  useEffect(() => {
    const nextResolvedTheme = lightLocks > 0 ? "light" : resolveTheme(theme);
    setResolvedTheme(nextResolvedTheme);
    applyTheme(nextResolvedTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  }, [theme, lightLocks]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (theme !== "system" || lightLocks > 0) return;
      const nextResolvedTheme = resolveTheme("system");
      setResolvedTheme(nextResolvedTheme);
      applyTheme(nextResolvedTheme);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const nextTheme = event.newValue;
      if (nextTheme === "light" || nextTheme === "dark" || nextTheme === "system") {
        setTheme(nextTheme);
      }
    };

    media.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [theme, lightLocks]);

  const lockLightTheme = useCallback(() => {
    setLightLocks((count) => count + 1);
    return () => setLightLocks((count) => Math.max(0, count - 1));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme: () =>
        setTheme((current) => (current === "system" ? "light" : current === "light" ? "dark" : "system")),
      lockLightTheme,
    }),
    [theme, resolvedTheme, lockLightTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/** Keep these routes in light mode regardless of user/system preference. */
export function useForceLightTheme() {
  const { lockLightTheme } = useTheme();
  useEffect(() => lockLightTheme(), [lockLightTheme]);
}
