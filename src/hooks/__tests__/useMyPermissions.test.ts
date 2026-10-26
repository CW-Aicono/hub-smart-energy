import { describe, it, expect } from "vitest";
import { isPathPermitted } from "@/hooks/useMyPermissions";

describe("isPathPermitted (custom role rights)", () => {
  const endkunde = ["dashboard.view", "charging.billing_view"];
  it("unrestricted users (admin / no custom role) see everything", () => {
    expect(isPathPermitted("/energy-data", null)).toBe(true);
  });
  it("Endkunde with only billing_view may open charging billing", () => {
    expect(isPathPermitted("/charging/billing", endkunde)).toBe(true);
  });
  it("Endkunde may not open charging points", () => {
    expect(isPathPermitted("/charging/points", endkunde)).toBe(false);
  });
  it("Endkunde may not open energy data, meters or locations", () => {
    expect(isPathPermitted("/energy-data", endkunde)).toBe(false);
    expect(isPathPermitted("/meters", endkunde)).toBe(false);
    expect(isPathPermitted("/locations", endkunde)).toBe(false);
    expect(isPathPermitted("/analytics-studio/analyse", endkunde)).toBe(false);
  });
  it("dashboard and help need no extra right", () => {
    expect(isPathPermitted("/", endkunde)).toBe(true);
    expect(isPathPermitted("/help", endkunde)).toBe(true);
  });
  it("most specific route wins (branding needs settings.branding)", () => {
    expect(isPathPermitted("/settings/branding", ["settings.view"])).toBe(false);
  });
});
