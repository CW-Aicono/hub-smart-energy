import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ChargePointQrCode from "../charging/ChargePointQrCode";

vi.mock("qrcode", () => ({
  default: {
    toCanvas: vi.fn(),
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mock"),
  },
}));

describe("ChargePointQrCode", () => {
  it("renders icon button by default", () => {
    render(
      <MemoryRouter>
        <ChargePointQrCode ocppId="CP001" name="Ladepunkt 1" />
      </MemoryRouter>
    );
    expect(screen.getByTitle("QR-Code anzeigen")).toBeInTheDocument();
  });

  it("renders full button when variant is button", () => {
    render(
      <MemoryRouter>
        <ChargePointQrCode ocppId="CP001" name="Ladepunkt 1" variant="button" />
      </MemoryRouter>
    );
    expect(screen.getByText("QR-Code")).toBeInTheDocument();
  });

  it("opens dialog showing name", () => {
    render(
      <MemoryRouter>
        <ChargePointQrCode ocppId="CP001" name="Ladepunkt 1" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTitle("QR-Code anzeigen"));
    expect(screen.getByText("QR-Code: Ladepunkt 1")).toBeInTheDocument();
    expect(screen.getByText("CP001")).toBeInTheDocument();
  });
});
