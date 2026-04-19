import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocationIntegrationsList } from "../integrations/LocationIntegrationsList";

const mockUseLocationIntegrations = vi.fn();

vi.mock("@/hooks/useIntegrations", () => ({
  useLocationIntegrations: (...args: unknown[]) => mockUseLocationIntegrations(...args),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "locationIntegrations.title": "Integrationen",
        "locationIntegrations.subtitle": "Verwalte Integrationen",
        "locationIntegrations.none": "Keine Integrationen",
        "locationIntegrations.addHint": "Füge eine Integration hinzu",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock("../integrations/IntegrationCard", () => ({
  IntegrationCard: ({ locationIntegration }: { locationIntegration: { integration?: { name?: string } } }) => (
    <div>{locationIntegration.integration?.name ?? "Integration Card"}</div>
  ),
}));

vi.mock("../integrations/AddIntegrationDialog", () => ({
  AddIntegrationDialog: () => <button>Integration hinzufügen</button>,
}));

describe("LocationIntegrationsList", () => {
  beforeEach(() => {
    mockUseLocationIntegrations.mockReset();
  });

  it("keeps existing integrations visible during background refetch", () => {
    mockUseLocationIntegrations.mockReturnValue({
      locationIntegrations: [
        {
          id: "li-1",
          integration: { name: "Test AICONO Gateway V2 (Cloudflare)" },
        },
      ],
      loading: true,
      refetch: vi.fn(),
      updateIntegration: vi.fn(),
      removeIntegration: vi.fn(),
    });

    render(<LocationIntegrationsList locationId="loc-1" />);

    expect(screen.getByText("Test AICONO Gateway V2 (Cloudflare)")).toBeInTheDocument();
    expect(screen.queryByText("Keine Integrationen")).not.toBeInTheDocument();
  });
});
