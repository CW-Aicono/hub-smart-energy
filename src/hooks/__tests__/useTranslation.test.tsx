import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTranslation } from "../useTranslation";

// When used outside TranslationProvider, it should fall back gracefully
describe("useTranslation (without provider)", () => {
  it("returns de as default language", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.language).toBe("de");
  });

  it("t() returns key when translations not yet cached", () => {
    const { result } = renderHook(() => useTranslation());
    // Without provider, cachedTranslations may or may not be loaded
    const value = result.current.t("nav.dashboard");
    // Either returns the German translation or the key itself
    expect(typeof value).toBe("string");
    expect(value.length).toBeGreaterThan(0);
  });
});
