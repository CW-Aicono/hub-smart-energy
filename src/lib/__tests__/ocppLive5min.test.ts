import { describe, it, expect } from "vitest";
import { aggregateTo5min, bucketStart } from "../../../supabase/functions/ocpp-persistent-api/livePower5min";

const base = { meter_id: "m1", tenant_id: "t1", energy_type: "electricity" };

describe("OCPP live 5-min aggregation", () => {
  it("aligns samples to 5-minute buckets", () => {
    expect(bucketStart("2026-11-03T08:07:42Z")).toBe("2026-11-03T08:05:00.000Z");
  });
  it("averages and maxes all samples in a bucket", () => {
    const rows = aggregateTo5min([
      { ...base, power_value: 100, recorded_at: "2026-11-03T08:05:10Z" },
      { ...base, power_value: 50, recorded_at: "2026-11-03T08:09:50Z" },
      { ...base, power_value: 20, recorded_at: "2026-11-03T08:10:00Z" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ power_avg: 75, power_max: 100, sample_count: 2, resolution_minutes: 5 });
  });
});
