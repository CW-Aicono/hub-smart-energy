import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { saTranslations } from "@/i18n/superAdminTranslations";

const state = vi.hoisted(() => ({ membershipError: false, membershipSelect: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "current" }, loading: false }) }));
vi.mock("@/hooks/useSuperAdmin", () => ({ useSuperAdmin: () => ({ isSuperAdmin: true, loading: false }) }));
vi.mock("@/hooks/useSATranslation", () => ({ useSATranslation: () => ({ t: (key: string) => saTranslations[key]?.de ?? key }) }));
vi.mock("@/components/super-admin/SuperAdminSidebar", () => ({ default: () => null }));
vi.mock("@/components/super-admin/SuperAdminInviteDialog", () => ({ default: () => null }));
vi.mock("@/components/super-admin/EditSAUserDialog", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const result = table === "profiles" ? { data: [{ id: "profile", user_id: "target", contact_person: "Testperson", email: "test@example.test", created_at: "2026-10-01", is_blocked: false }], error: null }
        : table === "user_roles" ? { data: [{ user_id: "target", role: "super_admin" }], error: null }
        : { data: [{ user_id: "target", partner_role: "partner_admin", partners: { name: "Testpartner" } }], error: state.membershipError ? new Error("Request failed") : null };
      const chain = { select: (fields: string) => { if (table === "partner_members") state.membershipSelect(fields); return chain; }, is: () => chain, then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
      return chain;
    },
  },
}));
import SuperAdminUsers from "../SuperAdminUsers";
function showPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><SuperAdminUsers /></MemoryRouter></QueryClientProvider>);
}
describe("Portal user list", () => {
  beforeEach(() => { state.membershipError = false; state.membershipSelect.mockClear(); });
  it("loads partner_role and shows users with partner affiliation and Portal-Admin label", async () => {
    showPage();
    expect(await screen.findByText("Testperson")).toBeInTheDocument();
    expect(screen.getByText("Partner-Admin: Testpartner")).toBeInTheDocument();
    expect(screen.getByText("Portal-Admin")).toBeInTheDocument();
    expect(state.membershipSelect).toHaveBeenCalledWith("user_id, partner_role, partners(name)");
    expect(screen.queryByText("Keine Benutzer gefunden")).not.toBeInTheDocument();
  });
  it("shows a retry action rather than an empty-user claim on request failure", async () => {
    state.membershipError = true;
    showPage();
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(screen.queryByText("Keine Benutzer gefunden")).not.toBeInTheDocument();
  });
});
