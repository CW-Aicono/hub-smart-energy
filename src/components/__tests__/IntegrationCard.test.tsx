import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IntegrationCard } from "../integrations/IntegrationCard";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "common.edit": "Bearbeiten",
        "common.cancel": "Abbrechen",
        "intCard.error": "Fehler",
        "intCard.notConfigured": "Nicht konfiguriert",
        "intCard.connected": "Verbunden",
        "intCard.pending": "Ausstehend",
        "intCard.syncing": "Synchronisiert",
        "intCard.showSensors": "Sensoren anzeigen",
        "intCard.removeTitle": "Integration entfernen",
        "intCard.removeDesc": "Möchten Sie {name} wirklich entfernen?",
        "intCard.remove": "Entfernen",
        "intCard.removing": "Wird entfernt...",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

vi.mock("../integrations/SensorsDialog", () => ({
  SensorsDialog: () => null,
}));

vi.mock("../integrations/MiniserverStatus", () => ({
  MiniserverStatus: () => null,
}));

vi.mock("../integrations/EditIntegrationDialog", () => ({
  EditIntegrationDialog: () => null,
}));

const mockLocationIntegration = {
  id: "li-1",
  location_id: "loc-1",
  integration_id: "int-1",
  is_enabled: true,
  sync_status: "success" as const,
  last_sync_at: null,
  config: { host: "192.168.1.1" },
  integration: {
    id: "int-1",
    name: "Loxone Miniserver",
    type: "loxone_miniserver",
    category: "smart_home",
    description: "Smart Home Integration",
    is_active: true,
    created_at: "",
    updated_at: "",
  },
  created_at: "",
  updated_at: "",
};

describe("IntegrationCard", () => {
  it("renders integration name", () => {
    render(
      <MemoryRouter>
        <IntegrationCard
          locationIntegration={mockLocationIntegration as any}
          onUpdate={vi.fn().mockResolvedValue({ error: null })}
          onDelete={vi.fn().mockResolvedValue({ error: null })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Loxone Miniserver")).toBeInTheDocument();
  });

  it("shows not-configured badge when required fields missing", () => {
    render(
      <MemoryRouter>
        <IntegrationCard
          locationIntegration={mockLocationIntegration as any}
          onUpdate={vi.fn().mockResolvedValue({ error: null })}
          onDelete={vi.fn().mockResolvedValue({ error: null })}
        />
      </MemoryRouter>
    );
    // The gateway config fields require more than just "host", so it shows "Nicht konfiguriert"
    expect(screen.getByText("Nicht konfiguriert")).toBeInTheDocument();
  });

  it("reduces opacity when disabled", () => {
    const disabled = { ...mockLocationIntegration, is_enabled: false };
    const { container } = render(
      <MemoryRouter>
        <IntegrationCard
          locationIntegration={disabled as any}
          onUpdate={vi.fn().mockResolvedValue({ error: null })}
          onDelete={vi.fn().mockResolvedValue({ error: null })}
        />
      </MemoryRouter>
    );
    const card = container.querySelector(".opacity-60");
    expect(card).toBeTruthy();
  });
});
