import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoleCard } from "../roles/RoleCard";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "common.cancel": "Abbrechen",
        "common.delete": "Löschen",
        "roleCard.allRights": "Alle",
        "roleCard.rights": "Rechte",
        "roleCard.deleteTitle": "Rolle löschen",
        "roleCard.deleteDesc": "Möchten Sie {name} wirklich löschen?",
        "roleCard.permError": "Fehler",
        "roleCard.deleteError": "Löschfehler",
        "roleCard.deleteSuccess": "Gelöscht",
        "roleCard.adminNote": "Admin-Hinweis",
      };
      return map[key] ?? key;
    },
    language: "de",
  }),
}));

const mockRole = {
  id: "r-1",
  name: "Editor",
  description: "Kann bearbeiten",
  tenant_id: "t-1",
  is_system_role: false,
  created_at: "",
  updated_at: "",
};

const mockPermissions = [
  { id: "p-1", name: "Standorte lesen", code: "locations.read", category: "locations", description: "" },
  { id: "p-2", name: "Standorte schreiben", code: "locations.write", category: "locations", description: "" },
];

describe("RoleCard", () => {
  it("renders role name and permission count", () => {
    render(
      <MemoryRouter>
        <RoleCard
          role={mockRole}
          permissions={mockPermissions}
          permissionsByCategory={{ locations: mockPermissions }}
          rolePermissions={["p-1"]}
          onTogglePermission={vi.fn().mockResolvedValue({ error: null })}
          onDeleteRole={vi.fn().mockResolvedValue({ error: null })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("1/2 Rechte")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(
      <MemoryRouter>
        <RoleCard
          role={mockRole}
          permissions={mockPermissions}
          permissionsByCategory={{ locations: mockPermissions }}
          rolePermissions={[]}
          onTogglePermission={vi.fn().mockResolvedValue({ error: null })}
          onDeleteRole={vi.fn().mockResolvedValue({ error: null })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Kann bearbeiten")).toBeInTheDocument();
  });

  it("shows admin note when isAdmin is true", () => {
    render(
      <MemoryRouter>
        <RoleCard
          role={mockRole}
          permissions={mockPermissions}
          permissionsByCategory={{ locations: mockPermissions }}
          rolePermissions={[]}
          onTogglePermission={vi.fn().mockResolvedValue({ error: null })}
          onDeleteRole={vi.fn().mockResolvedValue({ error: null })}
          isAdmin
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Alle Rechte")).toBeInTheDocument();
    expect(screen.getByText("Admin-Hinweis")).toBeInTheDocument();
  });
});
