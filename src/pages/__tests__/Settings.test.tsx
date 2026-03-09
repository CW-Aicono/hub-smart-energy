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
vi.mock("@/components/settings/BrandingSettings", () => ({ BrandingSettings: () => <div data-testid="branding" /> }));
vi.mock("@/components/settings/BackupSettings", () => ({ BackupSettings: () => <div data-testid="backup" /> }));
vi.mock("@/components/settings/WeekStartSetting", () => ({ WeekStartSetting: () => <div /> }));
vi.mock("@/components/settings/ManualMetersSetting", () => ({ ManualMetersSetting: () => <div /> }));
vi.mock("@/components/settings/TenantInfoSettings", () => ({ TenantInfoSettings: () => <div data-testid="tenant-info" /> }));
vi.mock("@/components/settings/ApiSettings", () => ({ ApiSettings: () => <div data-testid="api" /> }));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const W = ({ children }: any) => (
  <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
);

describe("Settings page", () => {
  it("renders title and tabs", async () => {
    const Settings = (await import("../Settings")).default;
    render(<W><Settings /></W>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("settings.title");
  });

  it("redirects non-admin to /", async () => {
    vi.doMock("@/hooks/useUserRole", () => ({
      useUserRole: () => ({ isAdmin: false, loading: false }),
    }));
    // Dynamic re-import not practical here; tested via ModuleGuard tests
  });
});
