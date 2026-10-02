import { describe, it, expect } from "vitest";
import { allocateCurtailment, findActiveEvent } from "../gridCurtailment";

const cp = (id: string, max: number, min = 4.2, priority = 100, active = true) => ({
  id,
  device_ref_id: id,
  device_type: "charge_point" as const,
  max_power_kw: max,
  min_power_kw: min,
  priority,
  active,
});

describe("allocateCurtailment", () => {
  it("returns max power on 100% (no curtailment)", () => {
    const r = allocateCurtailment(100, [cp("a", 22)]);
    expect(r[0].target_kw).toBe(22);
    expect(r[0].was_throttled).toBe(false);
  });

  it("never goes below gesetzlicher Mindestbezug (4.2 kW) on 0%", () => {
    const r = allocateCurtailment(0, [cp("a", 22)]);
    expect(r[0].target_kw).toBe(4.2);
    expect(r[0].was_throttled).toBe(true);
  });

  it("scales linearly with percent", () => {
    const r = allocateCurtailment(50, [cp("a", 22)]);
    expect(r[0].target_kw).toBe(11);
  });

  it("skips inactive devices", () => {
    const r = allocateCurtailment(50, [cp("a", 22), cp("b", 11, 4.2, 100, false)]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("a");
  });

  it("sorts by priority ascending", () => {
    const r = allocateCurtailment(50, [cp("a", 22, 4.2, 200), cp("b", 11, 4.2, 50)]);
    expect(r[0].id).toBe("b");
  });

  it("clamps percent to [0,100]", () => {
    expect(allocateCurtailment(-10, [cp("a", 22)])[0].target_kw).toBe(4.2);
    expect(allocateCurtailment(999, [cp("a", 22)])[0].target_kw).toBe(22);
  });
});

describe("findActiveEvent", () => {
  it("returns currently valid event", () => {
    const now = new Date("2026-06-06T12:00:00Z");
    const events = [
      { valid_from: "2026-06-06T11:00:00Z", valid_until: "2026-06-06T13:00:00Z", id: "a" },
      { valid_from: "2026-06-06T14:00:00Z", valid_until: "2026-06-06T16:00:00Z", id: "b" },
    ];
    expect(findActiveEvent(events, now)?.id).toBe("a");
  });

  it("returns null when none active", () => {
    expect(
      findActiveEvent(
        [{ valid_from: "2026-06-06T14:00:00Z", valid_until: "2026-06-06T16:00:00Z" }],
        new Date("2026-06-06T12:00:00Z"),
      ),
    ).toBeNull();
  });
});
