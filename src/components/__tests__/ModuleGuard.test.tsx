import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ModuleGuard from "../ModuleGuard";

const mockIsRouteAllowed = vi.fn(() => true);
vi.mock("@/hooks/useModuleGuard", () => ({
  useModuleGuard: () => ({
    isRouteAllowed: mockIsRouteAllowed,
    isLoading: false,
  }),
}));

function renderWithRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>Dashboard</div>} />
        <Route
          path="/integrations"
          element={
            <ModuleGuard>
              <div>Integrations Page</div>
            </ModuleGuard>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ModuleGuard", () => {
  it("renders children when route is allowed", () => {
    mockIsRouteAllowed.mockReturnValue(true);
    renderWithRoute("/integrations");
    expect(screen.getByText("Integrations Page")).toBeInTheDocument();
  });

  it("redirects to dashboard when route is not allowed", () => {
    mockIsRouteAllowed.mockReturnValue(false);
    renderWithRoute("/integrations");
    expect(screen.queryByText("Integrations Page")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
