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
vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: [{ id: "t1", title: "Test Task", status: "open", priority: "medium", source: "manual", is_archived: false, created_at: new Date().toISOString() }],
    isLoading: false,
    createTask: vi.fn(),
    updateTask: vi.fn(),
    archiveTask: vi.fn(),
    deleteTask: vi.fn(),
  }),
}));
vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t1" }, loading: false }),
  TenantProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/components/dashboard/DashboardSidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const W = ({ children }: any) => (
  <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
);

describe("Tasks page", () => {
  it("renders without crashing and shows title", async () => {
    const Tasks = (await import("../Tasks")).default;
    render(<W><Tasks /></W>);
    expect(screen.getByText("tasks.title")).toBeInTheDocument();
  });

  it("renders sidebar", async () => {
    const Tasks = (await import("../Tasks")).default;
    render(<W><Tasks /></W>);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });
});
