import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CreateTaskDialog } from "../tasks/CreateTaskDialog";

const mockMutateAsync = vi.fn().mockResolvedValue({});
vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    createTask: { mutateAsync: mockMutateAsync, isPending: false },
    tenantUsers: [],
  }),
}));

describe("CreateTaskDialog", () => {
  it("renders dialog content when open", () => {
    render(
      <MemoryRouter>
        <CreateTaskDialog open={true} onOpenChange={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText("Neue Aufgabe erstellen")).toBeInTheDocument();
    expect(screen.getByText("Titel *")).toBeInTheDocument();
    expect(screen.getByText("Erstellen")).toBeInTheDocument();
  });

  it("does not submit without title", () => {
    render(
      <MemoryRouter>
        <CreateTaskDialog open={true} onOpenChange={vi.fn()} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Erstellen"));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("submits with title filled", async () => {
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <CreateTaskDialog open={true} onOpenChange={onOpenChange} />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText("Aufgabentitel...");
    fireEvent.change(input, { target: { value: "Neue Aufgabe" } });
    fireEvent.click(screen.getByText("Erstellen"));
    // Wait for async submit
    await vi.waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
  });
});
