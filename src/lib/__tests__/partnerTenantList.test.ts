import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { loadPartnerTenants } from "../partnerTenantList";
function result(data: unknown, error: unknown = null) {
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data, error });
}
describe("partner tenant visibility during schema rollout", () => {
  it("returns own tenants even when setup_status is not present, retaining the partner scope", async () => {
    result([{ id: "tenant-1", name: "Test", partner_id: "partner-1" }]);
    expect(await loadPartnerTenants("partner-1")).toEqual([{ id: "tenant-1", name: "Test", partner_id: "partner-1" }]);
    expect(mocks.select).toHaveBeenCalledWith("*");
    expect(mocks.eq).toHaveBeenCalledWith("partner_id", "partner-1");
  });
  it("surfaces denied access rather than returning an apparently empty list", async () => {
    const error = { code: "42501", message: "permission denied" };
    result(null, error);
    await expect(loadPartnerTenants("partner-1")).rejects.toEqual(error);
  });
});