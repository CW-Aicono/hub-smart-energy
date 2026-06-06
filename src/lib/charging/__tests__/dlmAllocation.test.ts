import { describe, it, expect } from "vitest";
import { allocate, kwToAmps } from "../dlmAllocation";

const cfg = {
  grid_limit_kw: 50,
  safety_buffer_kw: 2,
  fallback_kw_per_cp: 4.2,
  min_charge_kw: 1.4,
};

describe("dlmAllocation.allocate", () => {
  it("returns empty for no CPs", () => {
    const r = allocate(cfg, 10, 10, []);
    expect(r.allocations).toEqual([]);
  });

  it("fallback bei stale Sensor (null measured)", () => {
    const cps = [
      { id: "a", max_kw: 22 },
      { id: "b", max_kw: 22 },
      { id: "c", max_kw: 22 },
    ];
    const r = allocate(cfg, null, 0, cps);
    expect(r.fallback_active).toBe(true);
    // cap = 50-2 = 48; per_cp 4.2 → max 11 CPs, all 3 served
    expect(r.allocations.every((a) => a.target_kw === 4.2)).toBe(true);
  });

  it("fallback überschreitet Limit nicht", () => {
    // grid_limit so klein, dass nur 2 CPs Platz haben
    const tight = { ...cfg, grid_limit_kw: 10, safety_buffer_kw: 0 }; // cap=10, /4.2=2
    const cps = [
      { id: "a", max_kw: 22 },
      { id: "b", max_kw: 22 },
      { id: "c", max_kw: 22 },
    ];
    const r = allocate(tight, null, 0, cps);
    const served = r.allocations.filter((a) => a.target_kw !== null);
    expect(served.length).toBe(2);
    expect(r.allocations[2].target_kw).toBeNull();
  });

  it("verteilt Budget nach Priorität", () => {
    const cps = [
      { id: "first", max_kw: 22 },
      { id: "second", max_kw: 22 },
      { id: "third", max_kw: 22 },
    ];
    // grid 50, baseload 10, buffer 2 → available 38
    const r = allocate(cfg, 12, 10, cps);
    expect(r.available_kw).toBe(38);
    expect(r.allocations[0].target_kw).toBe(22); // full
    expect(r.allocations[1].target_kw).toBe(16); // throttled rest
    expect(r.allocations[2].target_kw).toBeNull(); // budget aufgebraucht
  });

  it("pausiert CPs bei Budget < min_charge", () => {
    const cps = [{ id: "a", max_kw: 22 }];
    // available = 5 - 4 - 0 = 1 < 1.4 → pause
    const r = allocate(
      { ...cfg, grid_limit_kw: 5, safety_buffer_kw: 0 },
      4,
      4,
      cps,
    );
    expect(r.allocations[0].target_kw).toBeNull();
    expect(r.allocations[0].reason).toBe("pause_budget");
  });

  it("kwToAmps liefert plausible Werte", () => {
    expect(kwToAmps(11)).toBe(16);
    expect(kwToAmps(22)).toBe(32);
    expect(kwToAmps(0.5)).toBe(6); // min
    expect(kwToAmps(100)).toBe(32); // max
  });
});
