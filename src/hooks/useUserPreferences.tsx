import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type Language = "de" | "en" | "es" | "nl";
export type ColorScheme = "default" | "ocean" | "forest" | "sunset" | "lavender" | "slate" | "rose" | "amber";
export type ThemeMode = "light" | "dark" | "system";

export interface UserPreferences {
  id: string;
  user_id: string;
  language: Language;
  color_scheme: ColorScheme;
  theme_mode: ThemeMode;
  created_at: string;
  updated_at: string;
}

interface UseUserPreferencesReturn {
  preferences: UserPreferences | null;
  loading: boolean;
  error: string | null;
  updatePreferences: (updates: Partial<Pick<UserPreferences, "language" | "color_scheme" | "theme_mode">>) => Promise<{ error: Error | null }>;
}

const defaultPreferences: Omit<UserPreferences, "id" | "user_id" | "created_at" | "updated_at"> = {
  language: "de",
  color_scheme: "default",
  theme_mode: "system",
};

const UserPreferencesContext = createContext<UseUserPreferencesReturn | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    if (!user) {
      setPreferences(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
      } else if (data) {
        setPreferences(data as UserPreferences);
      } else {
        // Create default preferences if none exist
        const { data: newData, error: insertError } = await supabase
          .from("user_preferences")
          .insert({
            user_id: user.id,
            ...defaultPreferences,
          })
          .select()
          .single();

        if (insertError) {
          setError(insertError.message);
        } else {
          setPreferences(newData as UserPreferences);
        }
      }
    } catch (err) {
      setError("Failed to fetch preferences");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Apply theme mode
  useEffect(() => {
    if (!preferences) return;

    const root = document.documentElement;
    
    if (preferences.theme_mode === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.toggle("dark", preferences.theme_mode === "dark");
    }

    root.setAttribute("data-color-scheme", preferences.color_scheme);
  }, [preferences]);

  // Listen for system theme changes
  useEffect(() => {
    if (preferences?.theme_mode !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preferences?.theme_mode]);

  const updatePreferences = useCallback(async (
    updates: Partial<Pick<UserPreferences, "language" | "color_scheme" | "theme_mode">>
  ) => {
    if (!user || !preferences) {
      return { error: new Error("Not authenticated") };
    }

    const { error: updateError } = await supabase
      .from("user_preferences")
      .update(updates)
      .eq("user_id", user.id);

    if (!updateError) {
      setPreferences((prev) => (prev ? { ...prev, ...updates } : prev));
    }

    return { error: updateError as Error | null };
  }, [user, preferences]);

  return (
    <UserPreferencesContext.Provider value={{ preferences, loading, error, updatePreferences }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UseUserPreferencesReturn {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    // Fallback for components outside provider (shouldn't happen in practice)
    return {
      preferences: null,
      loading: true,
      error: null,
      updatePreferences: async () => ({ error: new Error("No provider") }),
    };
  }
  return context;
}
