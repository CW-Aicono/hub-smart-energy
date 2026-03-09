import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TaskCard } from "../tasks/TaskCard";

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    updateTask: { mutate: vi.fn() },
    deleteTask: { mutate: vi.fn() },
    bulkUpdateStatus: { mutate: vi.fn() },
  }),
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t-1" } }),
  TenantProvider: ({ children }: any) => children,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u-1" }, session: {} }),
  AuthProvider: ({ children }: any) => children,
}));

const baseTask = {
  id: "t-1",
  title: "Zähler prüfen",
  description: "Monatliche Prüfung",
  status: "open" as const,
  priority: "high" as const,
  source_type: "manual" as const,
  source_id: null,
  source_label: null,
  tenant_id: "ten-1",
  created_at: "2025-01-15T10:00:00Z",
  updated_at: "2025-01-15T10:00:00Z",
  due_date: null,
  assigned_to: null,
  assigned_to_name: null,
  external_contact_name: null,
  external_contact_email: null,
  external_contact_phone: null,
  completed_at: null,
  created_by: null,
  created_by_name: null,
};

describe("TaskCard", () => {
  it("renders title and priority badge", () => {
    render(
      <MemoryRouter>
        <TaskCard task={baseTask} />
      </MemoryRouter>
    );
    expect(screen.getByText("Zähler prüfen")).toBeInTheDocument();
    expect(screen.getByText("Hoch")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <MemoryRouter>
        <TaskCard task={baseTask} />
      </MemoryRouter>
    );
    expect(screen.getByText("Monatliche Prüfung")).toBeInTheDocument();
  });

  it("shows overdue indicator when due date is past", () => {
    const overdueTask = {
      ...baseTask,
      due_date: "2024-01-01",
    };
    render(
      <MemoryRouter>
        <TaskCard task={overdueTask} />
      </MemoryRouter>
    );
    expect(screen.getByText(/überfällig/)).toBeInTheDocument();
  });

  it("shows duplicate count when provided", () => {
    render(
      <MemoryRouter>
        <TaskCard task={baseTask} duplicateCount={3} duplicateIds={["t-1", "t-2", "t-3"]} />
      </MemoryRouter>
    );
    expect(screen.getByText("(3×)")).toBeInTheDocument();
  });
});
