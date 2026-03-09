import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileSettings } from "../settings/ProfileSettings";

vi.mock("@/hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({
    preferences: { language: "de", color_scheme: "default", theme_mode: "system" },
    loading: false,
    updatePreferences: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "profile.language": "Sprache",
        "profile.languageDescription": "Wählen Sie Ihre Sprache",
        "profile.colorScheme": "Farbschema",
        "profile.colorSchemeDescription": "Wählen Sie ein Farbschema",
        "profile.themeMode": "Design",
        "profile.themeModeDescription": "Hell, Dunkel oder System",
        "profile.light": "Hell",
        "profile.dark": "Dunkel",
        "profile.system": "System",
        "language.de": "Deutsch",
        "language.en": "English",
        "language.es": "Español",
        "language.nl": "Nederlands",
        "colorScheme.default": "Standard",
        "colorScheme.ocean": "Ozean",
        "colorScheme.forest": "Wald",
        "colorScheme.sunset": "Sonnenuntergang",
        "colorScheme.lavender": "Lavendel",
        "colorScheme.slate": "Schiefer",
        "colorScheme.rose": "Rose",
        "colorScheme.amber": "Bernstein",
        "common.error": "Fehler",
        "common.saved": "Gespeichert",
        "profile.settingError": "Einstellung konnte nicht gespeichert werden",
        "profile.settingSaved": "Einstellung gespeichert",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("ProfileSettings", () => {
  it("renders language, color scheme, and theme cards", () => {
    render(
      <MemoryRouter>
        <ProfileSettings />
      </MemoryRouter>
    );
    expect(screen.getByText("Sprache")).toBeInTheDocument();
    expect(screen.getByText("Farbschema")).toBeInTheDocument();
    expect(screen.getByText("Design")).toBeInTheDocument();
  });

  it("shows color scheme options", () => {
    render(
      <MemoryRouter>
        <ProfileSettings />
      </MemoryRouter>
    );
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("Ozean")).toBeInTheDocument();
  });

  it("shows theme mode options", () => {
    render(
      <MemoryRouter>
        <ProfileSettings />
      </MemoryRouter>
    );
    expect(screen.getByText("Hell")).toBeInTheDocument();
    expect(screen.getByText("Dunkel")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });
});
