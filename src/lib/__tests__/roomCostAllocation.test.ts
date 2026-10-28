import { describe, it, expect } from "vitest";
import { allocateBuilding, roomArea } from "../roomCostAllocation";

const rooms = [
  { id: "a", name: "Einkauf", floorId: "f", area: 30 },
  { id: "b", name: "Vertrieb", floorId: "f", area: 10 },
];

describe("allocateBuilding", () => {
  it("verteilt den Rest nach Fläche", () => {
    const r = allocateBuilding({ locationId: "l", key: "area", mainTotal: 100, rooms, directByRoom: { a: 20 }, pricePerUnit: 0.3 });
    expect(r.rooms[0].total).toBeCloseTo(20 + 60);
    expect(r.rooms[1].total).toBeCloseTo(20);
    expect(r.general).toBe(0);
    expect(r.rooms[0].cost).toBeCloseTo(24);
  });
  it("verteilt den Rest zu gleichen Teilen", () => {
    const r = allocateBuilding({ locationId: "l", key: "equal", mainTotal: 100, rooms, directByRoom: {}, pricePerUnit: null });
    expect(r.rooms[0].allocated).toBe(50);
    expect(r.rooms[1].allocated).toBe(50);
  });
  it("ohne Verteilung bleibt der Rest Allgemein", () => {
    const r = allocateBuilding({ locationId: "l", key: "none", mainTotal: 100, rooms, directByRoom: { b: 10 }, pricePerUnit: null });
    expect(r.general).toBe(90);
    expect(r.rooms[1].total).toBe(10);
  });
  it("Fehlbetrag wird gemeldet und nicht verteilt", () => {
    const r = allocateBuilding({ locationId: "l", key: "area", mainTotal: 50, rooms, directByRoom: { a: 40, b: 20 }, pricePerUnit: null });
    expect(r.shortfall).toBe(10);
    expect(r.rooms[0].allocated).toBe(0);
  });
  it("Fläche aus Grundriss, wenn keine manuelle Fläche", () => {
    expect(roomArea({ width: 4, depth: 5 })).toBe(20);
    expect(roomArea({ area_m2: 12, width: 4, depth: 5 })).toBe(12);
  });
});
