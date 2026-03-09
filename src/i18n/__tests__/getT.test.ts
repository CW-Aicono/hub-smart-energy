import { describe, it, expect, beforeEach, vi } from "vitest";
import { getT } from "../getT";

describe("getT", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to German when no preference is set", () => {
    const t = getT();
    expect(t("nav.dashboard")).toBe("Dashboard");
    expect(t("nav.locations")).toBe("Standorte");
  });

  it("uses English when language preference is en", () => {
    localStorage.setItem("user_preferences", JSON.stringify({ language: "en" }));
    const t = getT();
    expect(t("nav.locations")).toBe("Locations");
  });

  it("returns the key itself for unknown keys", () => {
    const t = getT();
    expect(t("nonexistent.key.here")).toBe("nonexistent.key.here");
  });

  it("falls back to German if stored language is invalid", () => {
    localStorage.setItem("user_preferences", JSON.stringify({ language: "xx" }));
    const t = getT();
    // Should fall back via entry.de
    expect(t("nav.dashboard")).toBe("Dashboard");
  });

  it("handles malformed JSON in localStorage gracefully", () => {
    localStorage.setItem("user_preferences", "not-json");
    const t = getT();
    // Should not throw, defaults to de
    expect(t("nav.dashboard")).toBe("Dashboard");
  });
});
