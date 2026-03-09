import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocationTree } from "../locations/LocationTree";

vi.mock("@/hooks/useFloors", () => ({
  useFloors: () => ({ floors: [], loading: false }),
}));
vi.mock("@/hooks/useFloorRooms", () => ({
  useFloorRooms: () => ({ rooms: [] }),
}));
vi.mock("@/hooks/useMeters", () => ({
  useMeters: () => ({ meters: [] }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false, role: "viewer" }),
}));

describe("LocationTree", () => {
  it("shows empty state when no locations", () => {
    render(
      <MemoryRouter>
        <LocationTree locations={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText("Keine Standorte vorhanden")).toBeInTheDocument();
  });

  it("renders location names", () => {
    const locations = [
      mockLocation({ id: "loc-1", name: "Hauptgebäude", is_main_location: true }),
    ] as any[];
    render(
      <MemoryRouter>
        <LocationTree locations={locations} />
      </MemoryRouter>
    );
    expect(screen.getByText("Hauptgebäude")).toBeInTheDocument();
    expect(screen.getByText("Hauptstandort")).toBeInTheDocument();
  });

  it("calls onSelect when location is clicked", () => {
    const onSelect = vi.fn();
    const locations = [
      mockLocation({ id: "loc-1", name: "Büro", type: "sonstiges" }),
    ] as any[];
    render(
      <MemoryRouter>
        <LocationTree locations={locations} onSelect={onSelect} />
      </MemoryRouter>
    );
    const row = screen.getByText("Büro").closest(".cursor-pointer") as HTMLElement;
    if (row) row.click();
    expect(onSelect).toHaveBeenCalledWith(locations[0]);
  });
});
