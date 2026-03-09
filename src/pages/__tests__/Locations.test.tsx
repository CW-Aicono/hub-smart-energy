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
vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    locations: [{ id: "l1", name: "HQ", address: "Street 1", latitude: 50, longitude: 10, is_main_location: true }],
    hierarchicalLocations: [],
    loading: false,
    refetch: vi.fn(),
  }),
  __esModule: true,
}));
vi.mock("@/hooks/useModuleGuard", () => ({
  useModuleGuard: () => ({ isRouteAllowed: () => true, isLoading: false, locationsFullEnabled: true }),
}));
vi.mock("@/hooks/useLocationStatus", () => ({
  useLocationStatus: () => ({ statusMap: {}, loading: false }),
}));
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (k: string) => k, language: "de" }),
  TranslationProvider: ({ children }: any) => <>{children}</>,
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
vi.mock("@/components/locations/LocationsMap", () => ({ LocationsMap: () => <div data-testid="map" /> }));
vi.mock("@/components/locations/LocationTree", () => ({ LocationTree: () => <div data-testid="tree" /> }));
vi.mock("@/components/locations/AddLocationDialog", () => ({ AddLocationDialog: () => <div data-testid="add-dialog" /> }));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const W = ({ children }: any) => (
  <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
);

describe("Locations page", () => {
  it("renders without crashing and shows title", async () => {
    const Locations = (await import("../Locations")).default;
    render(<W><Locations /></W>);
    expect(screen.getByText("locations.title")).toBeInTheDocument();
  });

  it("renders sidebar", async () => {
    const Locations = (await import("../Locations")).default;
    render(<W><Locations /></W>);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });
});
