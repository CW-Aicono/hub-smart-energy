import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { SALanguage } from "@/i18n/superAdminTranslations";

export type SAColorPreset = "default" | "ocean" | "forest" | "sunset" | "lavender" | "slate" | "rose" | "amber";
export type SAThemeMode = "light" | "dark" | "system";

interface SAPreferences {
  colorPreset: SAColorPreset;
  themeMode: SAThemeMode;
  language: SALanguage;
}

interface SAPreferencesContextType extends SAPreferences {
  setColorPreset: (preset: SAColorPreset) => void;
  setThemeMode: (mode: SAThemeMode) => void;
  setLanguage: (lang: SALanguage) => void;
}

const SA_PREFS_KEY = "sa-preferences";

const defaults: SAPreferences = {
  colorPreset: "default",
  themeMode: "system",
  language: "de",
};

function loadPrefs(): SAPreferences {
  try {
    const stored = localStorage.getItem(SA_PREFS_KEY);
    if (stored) return { ...defaults, ...JSON.parse(stored) };
  } catch {}
  return defaults;
}

const SAPreferencesContext = createContext<SAPreferencesContextType>({
  ...defaults,
  setColorPreset: () => {},
  setThemeMode: () => {},
  setLanguage: () => {},
});

// Color preset CSS variables (HSL values for primary, accent, sidebar)
const COLOR_PRESETS: Record<SAColorPreset, Record<string, string>> = {
  default: {
    "--sa-primary": "152 55% 42%",
    "--sa-primary-foreground": "0 0% 100%",
    "--sa-accent": "152 30% 20%",
    "--sa-sidebar-bg": "220 20% 12%",
    "--sa-sidebar-fg": "0 0% 95%",
    "--sa-sidebar-accent": "152 40% 25%",
    "--sa-sidebar-border": "220 15% 20%",
  },
  ocean: {
    "--sa-primary": "200 70% 50%",
    "--sa-primary-foreground": "0 0% 100%",
    "--sa-accent": "200 40% 22%",
    "--sa-sidebar-bg": "210 30% 10%",
    "--sa-sidebar-fg": "0 0% 95%",
    "--sa-sidebar-accent": "200 50% 25%",
    "--sa-sidebar-border": "210 20% 18%",
  },
  forest: {
    "--sa-primary": "140 50% 38%",
    "--sa-primary-foreground": "0 0% 100%",
    "--sa-accent": "140 30% 18%",
    "--sa-sidebar-bg": "150 25% 10%",
    "--sa-sidebar-fg": "0 0% 95%",
    "--sa-sidebar-accent": "140 40% 22%",
    "--sa-sidebar-border": "150 15% 18%",
  },
  sunset: {
    "--sa-primary": "25 90% 55%",
    "--sa-primary-foreground": "0 0% 100%",
    "--sa-accent": "25 50% 22%",
    "--sa-sidebar-bg": "20 25% 10%",
    "--sa-sidebar-fg": "0 0% 95%",
    "--sa-sidebar-accent": "25 60% 25%",
    "--sa-sidebar-border": "20 15% 18%",
  },
  lavender: {
    "--sa-primary": "270 60% 60%",
    "--sa-primary-foreground": "0 0% 100%",
    "--sa-accent": "270 30% 22%",
    "--sa-sidebar-bg": "275 25% 12%",
    "--sa-sidebar-fg": "0 0% 95%",
    "--sa-sidebar-accent": "270 40% 28%",
    "--sa-sidebar-border": "275 15% 20%",
  },
  slate: {
    "--sa-primary": "215 20% 55%",
    "--sa-primary-foreground": "0 0% 100%",
    "--sa-accent": "215 15% 22%",
    "--sa-sidebar-bg": "220 15% 11%",
    "--sa-sidebar-fg": "0 0% 95%",
    "--sa-sidebar-accent": "215 15% 22%",
    "--sa-sidebar-border": "220 10% 18%",
  },
  rose: {
    "--sa-primary": "350 70% 55%",
    "--sa-primary-foreground": "0 0% 100%",
    "--sa-accent": "350 40% 22%",
    "--sa-sidebar-bg": "345 20% 10%",
    "--sa-sidebar-fg": "0 0% 95%",
    "--sa-sidebar-accent": "350 50% 25%",
    "--sa-sidebar-border": "345 15% 18%",
  },
  amber: {
    "--sa-primary": "38 92% 50%",
    "--sa-primary-foreground": "0 0% 10%",
    "--sa-accent": "38 50% 22%",
    "--sa-sidebar-bg": "35 20% 10%",
    "--sa-sidebar-fg": "0 0% 95%",
    "--sa-sidebar-accent": "38 60% 25%",
    "--sa-sidebar-border": "35 15% 18%",
  },
};

function applyThemeMode(mode: SAThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  } else {
    root.classList.toggle("dark", mode === "dark");
  }
}

function applyColorPreset(preset: SAColorPreset) {
  const root = document.documentElement;
  const vars = COLOR_PRESETS[preset] || COLOR_PRESETS.default;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  root.setAttribute("data-sa-color", preset);
}

export function SAPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<SAPreferences>(loadPrefs);

  // Apply on mount and changes
  useEffect(() => {
    applyThemeMode(prefs.themeMode);
    applyColorPreset(prefs.colorPreset);
    localStorage.setItem(SA_PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Listen for system theme changes
  useEffect(() => {
    if (prefs.themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [prefs.themeMode]);

  const setColorPreset = useCallback((preset: SAColorPreset) => setPrefs((p) => ({ ...p, colorPreset: preset })), []);
  const setThemeMode = useCallback((mode: SAThemeMode) => setPrefs((p) => ({ ...p, themeMode: mode })), []);
  const setLanguage = useCallback((lang: SALanguage) => setPrefs((p) => ({ ...p, language: lang })), []);

  return (
    <SAPreferencesContext.Provider value={{ ...prefs, setColorPreset, setThemeMode, setLanguage }}>
      {children}
    </SAPreferencesContext.Provider>
  );
}

export function useSAPreferences() {
  return useContext(SAPreferencesContext);
}
