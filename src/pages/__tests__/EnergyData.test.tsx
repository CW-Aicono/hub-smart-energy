import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (k: string) => k, language: "de" }),
  TranslationProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({ locations: [], loading: false }),
}));
vi.mock("@/hooks/useMeters", () => ({
  useMeters: () => ({ meters: [], loading: false }),
}));
vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t1" }, loading: false }),
  TenantProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn(() => ({ lte: vi.fn(() => Promise.resolve({ count: 0 })) })) })) })) })) },
}));
vi.mock("@/components/dashboard/DashboardSidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("@/components/energy-data/ReportSchedulesList", () => ({ default: () => <div /> }));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const W = ({ children }: any) => (
  <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
);

describe("EnergyData page", () => {
  it("renders without crashing and shows title", async () => {
    const EnergyData = (await import("../EnergyData")).default;
    render(<W><EnergyData /></W>);
    expect(screen.getByText("energyData.title")).toBeInTheDocument();
  });
});
