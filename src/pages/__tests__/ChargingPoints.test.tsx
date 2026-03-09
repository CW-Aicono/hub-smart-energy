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
vi.mock("@/hooks/useChargePoints", () => ({
  useChargePoints: () => ({
    chargePoints: [{ id: "cp1", name: "Charger 1", status: "available", ocpp_id: "CP001", max_power_kw: 22, connector_count: 2, connector_type: "Type2" }],
    isLoading: false,
    addChargePoint: vi.fn(),
    updateChargePoint: vi.fn(),
    deleteChargePoint: vi.fn(),
  }),
}));
vi.mock("@/hooks/useChargerModels", () => ({
  useChargerModels: () => ({ chargerModels: [], vendors: [], getModelsForVendor: () => [] }),
}));
vi.mock("@/hooks/useChargingSessions", () => ({
  useChargingSessions: () => ({ sessions: [], isLoading: false }),
}));
vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t1" }, loading: false }),
  TenantProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/contexts/DemoMode", () => ({
  useDemoMode: () => false,
  useDemoPath: () => (p: string) => p,
  DemoModeDetector: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/components/dashboard/DashboardSidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("@/components/charging/ChargingOverviewStats", () => ({ default: () => <div data-testid="stats" /> }));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const W = ({ children }: any) => (
  <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
);

describe("ChargingPoints page", () => {
  it("renders without crashing and shows charging title", async () => {
    const ChargingPoints = (await import("../ChargingPoints")).default;
    render(<W><ChargingPoints /></W>);
    expect(screen.getByText("charging.title")).toBeInTheDocument();
  });
});
