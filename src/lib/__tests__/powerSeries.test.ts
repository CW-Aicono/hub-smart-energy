import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { fetchPowerSeriesStep } from "../powerSeries";
beforeEach(() => { rpc.mockReset(); });
describe("long fixed-resolution analyses", () => {
  it("loads 950 days at daily resolution without exceeding the server's 400-day limit", async () => {
    rpc.mockImplementation(async (_name, args) => {
      const span = Date.parse(args.p_end) - Date.parse(args.p_start);
      if (span > 400 * 86400000) return { error: new Error("400-day limit") };
      return { data: [{ meter_id: "meter", bucket: args.p_start, power_avg: 12, resolution_minutes: 1440 }], error: null };
    });
    const start = new Date("2024-01-01T00:00:00Z"), end = new Date(start.getTime() + 950 * 86400000);
    const result = await fetchPowerSeriesStep(["meter"], start, end, 1440);
    expect(result).toHaveLength(3);
    expect(rpc.mock.calls.map(c => c[0])).toEqual(Array(3).fill("get_power_series_step"));
    const intervals = rpc.mock.calls.map(c => c[1]).sort((a,b) => a.p_start.localeCompare(b.p_start));
    expect(Date.parse(intervals[0].p_start)).toBe(start.getTime());
    expect(Date.parse(intervals[2].p_end)).toBe(end.getTime()-1);
    expect(Date.parse(intervals[1].p_start)).toBe(Date.parse(intervals[0].p_end)+1);
  });
});