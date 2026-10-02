import { describe, it, expect } from "vitest";
import { buildHeatmap } from "../utilization";

describe("buildHeatmap", () => {
  it("zählt Sessions am Wochentag-Bucket des Starts", () => {
    // Montag, 2024-01-01, 10:00 lokal
    const m = buildHeatmap(
      [
        { start_time: "2024-01-01T10:00:00", stop_time: "2024-01-01T11:30:00", energy_kwh: 10 },
        { start_time: "2024-01-01T10:30:00", stop_time: "2024-01-01T11:00:00", energy_kwh: 5 },
      ],
      "sessions",
    );
    expect(m[0][10]).toBe(2);
  });

  it("verteilt Minuten anteilig über Stunden", () => {
    const m = buildHeatmap(
      [{ start_time: "2024-01-01T10:30:00", stop_time: "2024-01-01T12:00:00", energy_kwh: null }],
      "minutes",
    );
    expect(m[0][10]).toBeCloseTo(30, 5);
    expect(m[0][11]).toBeCloseTo(60, 5);
  });

  it("verteilt kWh proportional zur Zeit", () => {
    const m = buildHeatmap(
      [{ start_time: "2024-01-01T10:30:00", stop_time: "2024-01-01T11:30:00", energy_kwh: 10 }],
      "kwh",
    );
    // 30 min in 10, 30 min in 11 → 5 kWh each
    expect(m[0][10]).toBeCloseTo(5, 5);
    expect(m[0][11]).toBeCloseTo(5, 5);
  });
});
