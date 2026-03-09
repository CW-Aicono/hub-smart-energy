import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CreateRoleDialog } from "../roles/CreateRoleDialog";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "common.cancel": "Abbrechen",
        "createRole.button": "Neue Rolle",
        "createRole.title": "Rolle erstellen",
        "createRole.description": "Beschreibung",
        "createRole.nameLabel": "Name",
        "createRole.namePlaceholder": "Rollenname...",
        "createRole.descLabel": "Beschreibung",
        "createRole.descPlaceholder": "Optional...",
        "createRole.create": "Erstellen",
        "createRole.creating": "Wird erstellt...",
        "createRole.nameRequired": "Name erforderlich",
        "createRole.success": "Rolle erstellt",
        "createRole.errorCreate": "Fehler",
      };
      return map[key] ?? key;
    },
  }),
}));

describe("CreateRoleDialog", () => {
  it("renders trigger button", () => {
    render(
      <MemoryRouter>
        <CreateRoleDialog onCreateRole={vi.fn().mockResolvedValue({ error: null })} />
      </MemoryRouter>
    );
    expect(screen.getByText("Neue Rolle")).toBeInTheDocument();
  });

  it("opens dialog on button click", async () => {
    render(
      <MemoryRouter>
        <CreateRoleDialog onCreateRole={vi.fn().mockResolvedValue({ error: null })} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Neue Rolle"));
    expect(screen.getByText("Rolle erstellen")).toBeInTheDocument();
  });
});
