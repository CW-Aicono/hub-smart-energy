import { describe, it, expect } from "vitest";
import { translations } from "../translations";

describe("translations consistency", () => {
  const keys = Object.keys(translations) as (keyof typeof translations)[];

  it("has at least one translation key", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it("every key has a German (de) entry", () => {
    const missingDe: string[] = [];
    for (const key of keys) {
      if (!translations[key].de) missingDe.push(key);
    }
    expect(missingDe).toEqual([]);
  });

  it("every key has an English (en) entry (except known gaps)", () => {
    const KNOWN_MISSING_EN = ["pv.clock", "chart.timeLabel"];
    const missingEn: string[] = [];
    for (const key of keys) {
      if (!translations[key].en && !KNOWN_MISSING_EN.includes(key)) missingEn.push(key);
    }
    expect(missingEn).toEqual([]);
  });

  it("no German value is empty string", () => {
    const empty: string[] = [];
    for (const key of keys) {
      if ((translations[key].de as string).length === 0) empty.push(key);
    }
    expect(empty).toEqual([]);
  });

  it("no English value is empty string", () => {
    const empty: string[] = [];
    for (const key of keys) {
      if ((translations[key].en as string).length === 0) empty.push(key);
    }
    expect(empty).toEqual([]);
  });
});
