import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditIntegrationDialog } from "../integrations/EditIntegrationDialog";

const invokeMock = vi.fn();
const singleMock = vi.fn();
const eqMock = vi.fn(() => ({ single: singleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/gatewayRegistry", () => ({
  getGatewayDefinition: () => ({
    configFields: [
      {
        name: "api_url",
        label: "API URL",
        required: false,
        type: "text",
        placeholder: "",
      },
    ],
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (name: string, options?: any) => invokeMock(name, options),
    },
    from: (table: string) => fromMock(table),
  },
}));

describe("EditIntegrationDialog", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    singleMock.mockReset();
    eqMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();

    invokeMock.mockResolvedValue({
      data: {
        success: true,
        tunnel_id: "tunnel-1",
        public_url: "https://new-tunnel.aicono.org",
        tunnel_token: "token-123",
      },
      error: null,
    });

    singleMock.mockResolvedValue({
      data: {
        config: {
          api_url: "https://new-tunnel.aicono.org",
        },
      },
      error: null,
    });
  });

  it("keeps the generated token visible when the same integration refetches", async () => {
    const onUpdate = vi.fn().mockResolvedValue({ error: null });
    const onOpenChange = vi.fn();

    const locationIntegration = {
      id: "li-1",
      integration: {
        id: "int-1",
        name: "Gateway",
        type: "home_assistant",
      },
      config: {
        api_url: "https://old-tunnel.aicono.org",
      },
    };

    const { rerender } = render(
      <EditIntegrationDialog
        locationIntegration={locationIntegration as any}
        open
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Tunnel-Token neu generieren/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("token-123")).toBeInTheDocument();
    });

    rerender(
      <EditIntegrationDialog
        locationIntegration={{
          ...locationIntegration,
          updated_at: "2026-04-19T15:55:00.000Z",
          config: {
            api_url: "https://new-tunnel.aicono.org",
          },
        } as any}
        open
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByDisplayValue("token-123")).toBeInTheDocument();
  });
});
