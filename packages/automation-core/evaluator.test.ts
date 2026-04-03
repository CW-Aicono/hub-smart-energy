import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isTimeInRange,
  isNearTimePoint,
  isDebounceExpired,
  evaluateCondition,
  evaluateAutomation,
  resolveActions,
  DEBOUNCE_MINUTES,
} from "./evaluator";
import type {
  AutomationCondition,
  AutomationRule,
  TimeParts,
  SensorProvider,
} from "./types";

// ---------- isTimeInRange ----------
describe("isTimeInRange", () => {
  it("returns true when time is within a normal range", () => {
    expect(isTimeInRange("10:00", "08:00", "12:00")).toBe(true);
  });

  it("returns false when time is outside a normal range", () => {
    expect(isTimeInRange("07:00", "08:00", "12:00")).toBe(false);
  });

  it("returns true at exact boundaries", () => {
    expect(isTimeInRange("08:00", "08:00", "12:00")).toBe(true);
    expect(isTimeInRange("12:00", "08:00", "12:00")).toBe(true);
  });

  it("handles overnight range (22:00–06:00)", () => {
    expect(isTimeInRange("23:00", "22:00", "06:00")).toBe(true);
    expect(isTimeInRange("03:00", "22:00", "06:00")).toBe(true);
    expect(isTimeInRange("10:00", "22:00", "06:00")).toBe(false);
  });
});

// ---------- isNearTimePoint ----------
describe("isNearTimePoint", () => {
  it("returns true when times match exactly", () => {
    expect(isNearTimePoint("14:30", "14:30")).toBe(true);
  });

  it("returns true within ±2 minutes", () => {
    expect(isNearTimePoint("14:32", "14:30")).toBe(true);
    expect(isNearTimePoint("14:28", "14:30")).toBe(true);
  });

  it("returns false when difference > 2 minutes", () => {
    expect(isNearTimePoint("14:33", "14:30")).toBe(false);
    expect(isNearTimePoint("14:00", "14:30")).toBe(false);
  });

  it("handles midnight wrap-around", () => {
    expect(isNearTimePoint("23:59", "00:00")).toBe(true);
    expect(isNearTimePoint("00:01", "00:00")).toBe(true);
  });
});

// ---------- isDebounceExpired ----------
describe("isDebounceExpired", () => {
  it("returns true when lastExecutedAt is null", () => {
    expect(isDebounceExpired(null)).toBe(true);
    expect(isDebounceExpired(undefined)).toBe(true);
  });

  it("returns false when executed recently", () => {
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    expect(isDebounceExpired(twoMinAgo)).toBe(false);
  });

  it("returns true when debounce period has passed", () => {
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    expect(isDebounceExpired(sixMinAgo)).toBe(true);
  });

  it("uses DEBOUNCE_MINUTES constant (5 min)", () => {
    expect(DEBOUNCE_MINUTES).toBe(5);
  });
});

// ---------- evaluateCondition ----------
describe("evaluateCondition", () => {
  const timeParts: TimeParts = { hours: 10, minutes: 30, weekday: 3, timeStr: "10:30" };
  const mockProvider: SensorProvider = {
    getSensorValue: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  // -- time --
  it("evaluates time condition within range", async () => {
    const cond: AutomationCondition = { id: "1", type: "time", time_from: "09:00", time_to: "11:00" };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(true);
  });

  it("evaluates time condition outside range", async () => {
    const cond: AutomationCondition = { id: "1", type: "time", time_from: "11:00", time_to: "12:00" };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  it("returns false for time condition without from/to", async () => {
    const cond: AutomationCondition = { id: "1", type: "time" };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  // -- time_point --
  it("evaluates time_point near current time", async () => {
    const cond: AutomationCondition = { id: "1", type: "time_point", time_point: "10:31" };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(true);
  });

  it("evaluates time_point far from current time", async () => {
    const cond: AutomationCondition = { id: "1", type: "time_point", time_point: "15:00" };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  // -- time_switch --
  it("evaluates time_switch with matching time point", async () => {
    const cond: AutomationCondition = { id: "1", type: "time_switch", time_points: ["08:00", "10:30", "14:00"] };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(true);
  });

  it("evaluates time_switch with no matching time point", async () => {
    const cond: AutomationCondition = { id: "1", type: "time_switch", time_points: ["08:00", "14:00"] };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  it("returns false for time_switch without time_points", async () => {
    const cond: AutomationCondition = { id: "1", type: "time_switch" };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  // -- weekday --
  it("evaluates weekday condition matching", async () => {
    const cond: AutomationCondition = { id: "1", type: "weekday", weekdays: [1, 3, 5] };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(true);
  });

  it("evaluates weekday condition not matching", async () => {
    const cond: AutomationCondition = { id: "1", type: "weekday", weekdays: [0, 6] };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  it("returns false for weekday without weekdays array", async () => {
    const cond: AutomationCondition = { id: "1", type: "weekday" };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  // -- sensor_value --
  it("evaluates sensor > threshold", async () => {
    (mockProvider.getSensorValue as ReturnType<typeof vi.fn>).mockResolvedValue({ uuid: "s1", value: 25 });
    const cond: AutomationCondition = { id: "1", type: "sensor_value", sensor_uuid: "s1", operator: ">", value: 20 };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(true);
  });

  it("evaluates sensor < threshold", async () => {
    (mockProvider.getSensorValue as ReturnType<typeof vi.fn>).mockResolvedValue({ uuid: "s1", value: 15 });
    const cond: AutomationCondition = { id: "1", type: "sensor_value", sensor_uuid: "s1", operator: "<", value: 20 };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(true);
  });

  it("evaluates sensor = threshold (with epsilon)", async () => {
    (mockProvider.getSensorValue as ReturnType<typeof vi.fn>).mockResolvedValue({ uuid: "s1", value: 20.0005 });
    const cond: AutomationCondition = { id: "1", type: "sensor_value", sensor_uuid: "s1", operator: "=", value: 20 };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(true);
  });

  it("evaluates sensor >= and <=", async () => {
    (mockProvider.getSensorValue as ReturnType<typeof vi.fn>).mockResolvedValue({ uuid: "s1", value: 20 });
    const geq: AutomationCondition = { id: "1", type: "sensor_value", sensor_uuid: "s1", operator: ">=", value: 20 };
    const leq: AutomationCondition = { id: "2", type: "sensor_value", sensor_uuid: "s1", operator: "<=", value: 20 };
    expect(await evaluateCondition(geq, timeParts, mockProvider)).toBe(true);
    expect(await evaluateCondition(leq, timeParts, mockProvider)).toBe(true);
  });

  it("handles string sensor values by parsing", async () => {
    (mockProvider.getSensorValue as ReturnType<typeof vi.fn>).mockResolvedValue({ uuid: "s1", value: "25.5" });
    const cond: AutomationCondition = { id: "1", type: "sensor_value", sensor_uuid: "s1", operator: ">", value: 20 };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(true);
  });

  it("returns false for non-numeric sensor value", async () => {
    (mockProvider.getSensorValue as ReturnType<typeof vi.fn>).mockResolvedValue({ uuid: "s1", value: "unavailable" });
    const cond: AutomationCondition = { id: "1", type: "sensor_value", sensor_uuid: "s1", operator: ">", value: 20 };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  it("returns false when sensor_uuid is missing", async () => {
    const cond: AutomationCondition = { id: "1", type: "sensor_value", operator: ">", value: 20 };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  it("returns false when sensor provider throws", async () => {
    (mockProvider.getSensorValue as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));
    const cond: AutomationCondition = { id: "1", type: "sensor_value", sensor_uuid: "s1", operator: ">", value: 20 };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  // -- status --
  it("evaluates status condition matching", async () => {
    (mockProvider.getSensorValue as ReturnType<typeof vi.fn>).mockResolvedValue({ uuid: "a1", value: "on" });
    const cond: AutomationCondition = { id: "1", type: "status", actuator_uuid: "a1", expected_status: "on" };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(true);
  });

  it("evaluates status condition not matching", async () => {
    (mockProvider.getSensorValue as ReturnType<typeof vi.fn>).mockResolvedValue({ uuid: "a1", value: "off" });
    const cond: AutomationCondition = { id: "1", type: "status", actuator_uuid: "a1", expected_status: "on" };
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });

  it("returns false for unknown condition type", async () => {
    const cond = { id: "1", type: "unknown" } as any;
    expect(await evaluateCondition(cond, timeParts, mockProvider)).toBe(false);
  });
});

// ---------- evaluateAutomation ----------
describe("evaluateAutomation", () => {
  const mockProvider: SensorProvider = { getSensorValue: vi.fn() };

  const baseRule: AutomationRule = {
    id: "rule-1",
    name: "Test Rule",
    tenant_id: "t1",
    location_id: "l1",
    conditions: [],
    actions: [{ actuator_uuid: "a1", action_type: "on" }],
    logic_operator: "AND",
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  it("AND logic: all conditions must be true", async () => {
    const rule: AutomationRule = {
      ...baseRule,
      conditions: [
        { id: "1", type: "weekday", weekdays: [0, 1, 2, 3, 4, 5, 6] },
        { id: "2", type: "time", time_from: "00:00", time_to: "23:59" },
      ],
    };
    const result = await evaluateAutomation(rule, "Europe/Berlin", mockProvider);
    expect(result.conditionsMet).toBe(true);
    expect(result.conditionResults).toHaveLength(2);
    expect(result.conditionResults.every(Boolean)).toBe(true);
  });

  it("AND logic: one false condition fails", async () => {
    const rule: AutomationRule = {
      ...baseRule,
      conditions: [
        { id: "1", type: "weekday", weekdays: [0, 1, 2, 3, 4, 5, 6] },
        { id: "2", type: "time", time_from: "99:99", time_to: "99:99" }, // will never match
      ],
    };
    const result = await evaluateAutomation(rule, "Europe/Berlin", mockProvider);
    // time "99:99" is out of any real range, so this should be false
    expect(result.conditionsMet).toBe(false);
  });

  it("OR logic: one true condition suffices", async () => {
    const rule: AutomationRule = {
      ...baseRule,
      logic_operator: "OR",
      conditions: [
        { id: "1", type: "weekday", weekdays: [] }, // false
        { id: "2", type: "time", time_from: "00:00", time_to: "23:59" }, // true
      ],
    };
    const result = await evaluateAutomation(rule, "Europe/Berlin", mockProvider);
    expect(result.conditionsMet).toBe(true);
  });

  it("empty conditions with AND yields true", async () => {
    const result = await evaluateAutomation(baseRule, "Europe/Berlin", mockProvider);
    expect(result.conditionsMet).toBe(true);
    expect(result.conditionResults).toHaveLength(0);
  });
});

// ---------- resolveActions ----------
describe("resolveActions", () => {
  it("returns actions array when present", () => {
    const rule = {
      actions: [
        { actuator_uuid: "a1", action_type: "on" },
        { actuator_uuid: "a2", action_type: "off" },
      ],
    } as AutomationRule;
    expect(resolveActions(rule)).toHaveLength(2);
  });

  it("falls back to legacy single-action fields", () => {
    const rule = {
      actions: [],
      actuator_uuid: "a1",
      action_value: "on",
      action_type: "toggle",
    } as unknown as AutomationRule;
    const actions = resolveActions(rule);
    expect(actions).toHaveLength(1);
    expect(actions[0].actuator_uuid).toBe("a1");
    expect(actions[0].action_type).toBe("on"); // action_value takes priority
  });

  it("defaults to pulse when no action values", () => {
    const rule = {
      actions: [],
      actuator_uuid: "a1",
    } as unknown as AutomationRule;
    const actions = resolveActions(rule);
    expect(actions[0].action_type).toBe("pulse");
  });
});
