import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useUserPreferences, ColorScheme, ThemeMode } from "./useUserPreferences";

interface ThemeContextType {
  colorScheme: ColorScheme;
  themeMode: ThemeMode;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  colorScheme: "default",
  themeMode: "system",
  isLoading: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { preferences, loading } = useUserPreferences();
  const [applied, setApplied] = useState(false);

  // Apply theme on mount and when preferences change
  useEffect(() => {
    const root = document.documentElement;

    // Default to "default" color scheme if no preferences loaded yet
    const colorScheme = preferences?.color_scheme || "default";
    const themeMode = preferences?.theme_mode || "system";

    // Set color scheme
    root.setAttribute("data-color-scheme", colorScheme);

    // Set dark/light mode
    if (themeMode === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.toggle("dark", themeMode === "dark");
    }

    setApplied(true);
  }, [preferences]);

  // Listen for system theme changes when using "system" mode
  useEffect(() => {
    if (preferences?.theme_mode !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preferences?.theme_mode]);

  return (
    <ThemeContext.Provider
      value={{
        colorScheme: preferences?.color_scheme || "default",
        themeMode: preferences?.theme_mode || "system",
        isLoading: loading && !applied,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
