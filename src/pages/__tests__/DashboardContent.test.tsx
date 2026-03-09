import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useDashboardWidgets", () => {
  const w = [{ id: "w1", widget_type: "cost_overview", is_visible: true, position: 0, widget_size: "full" }];
  return {
    useDashboardWidgets: () => ({
      widgets: w,
      visibleWidgets: w,
      loading: false,
      toggleWidgetVisibility: vi.fn(),
      reorderWidgets: vi.fn(),
      updateWidgetSize: vi.fn(),
    }),
  };
});
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (k: string) => k, language: "de" }),
  TranslationProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/hooks/useModuleGuard", () => ({
  useModuleGuard: () => ({ isRouteAllowed: () => true, isLoading: false, isModuleEnabled: () => true }),
}));
vi.mock("@/hooks/useDashboardFilter", () => ({
  useDashboardFilter: () => ({ selectedLocationId: null, setSelectedLocationId: vi.fn() }),
  DashboardFilterProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/hooks/useDashboardPrefetch", () => ({
  useDashboardPrefetch: () => {},
}));
vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t1" }, loading: false }),
  TenantProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/components/dashboard/DashboardSidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("@/components/dashboard/DashboardCustomizer", () => ({ default: () => <div data-testid="customizer" /> }));
vi.mock("@/components/dashboard/LocationFilter", () => ({ LocationFilter: () => <div data-testid="filter" /> }));
vi.mock("@/components/dashboard/WidgetErrorBoundary", () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/dashboard/LazyWidget", () => ({ default: ({ children }: any) => <div data-testid="widget">{children}</div> }));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const W = ({ children }: any) => (
  <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
);

describe("DashboardContent page", () => {
  it("renders without crashing and shows sidebar", async () => {
    const DashboardContent = (await import("../DashboardContent")).default;
    render(<W><DashboardContent /></W>);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });
});
