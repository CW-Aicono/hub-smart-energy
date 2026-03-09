import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true, loading: false }),
}));
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (k: string) => k, language: "de" }),
  TranslationProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t1" }, loading: false }),
  TenantProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/components/dashboard/DashboardSidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("@/components/admin/UserManagement", () => ({ default: () => <div data-testid="user-mgmt" /> }));
vi.mock("@/components/admin/InviteUserDialog", () => ({ default: () => <div data-testid="invite" /> }));
vi.mock("@/components/admin/ExternalContactsManager", () => ({ default: () => <div data-testid="external" /> }));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const W = ({ children }: any) => (
  <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
);

describe("Admin page", () => {
  it("renders title and user management", async () => {
    const Admin = (await import("../Admin")).default;
    render(<W><Admin /></W>);
    expect(screen.getByText("users.title")).toBeInTheDocument();
    expect(screen.getByTestId("user-mgmt")).toBeInTheDocument();
  });
});
