import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BulkActionsToolbar } from "../tasks/BulkActionsToolbar";

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    bulkUpdateFields: { mutate: vi.fn() },
    bulkUpdateStatus: { mutate: vi.fn() },
    deleteTask: { mutate: vi.fn() },
    tenantUsers: [],
    tasks: [],
  }),
}));
vi.mock("@/hooks/useExternalContacts", () => ({
  useExternalContacts: () => ({
    contacts: [],
    findMatches: () => [],
    createContact: { mutate: vi.fn() },
  }),
}));
vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t-1" } }),
}));

describe("BulkActionsToolbar", () => {
  it("renders nothing when no items selected", () => {
    const { container } = render(
      <MemoryRouter>
        <BulkActionsToolbar selectedIds={[]} onClearSelection={vi.fn()} />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows count and action buttons when items selected", () => {
    render(
      <MemoryRouter>
        <BulkActionsToolbar selectedIds={["a", "b", "c"]} onClearSelection={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText("3 ausgewählt")).toBeInTheDocument();
    expect(screen.getByText("Löschen")).toBeInTheDocument();
    expect(screen.getByText("Zuweisen")).toBeInTheDocument();
    expect(screen.getByText("Fällig")).toBeInTheDocument();
  });
});
