/**
 * Verteilung von Verbrauch/Kosten auf Räume (= Abteilungen) eines Gebäudes.
 * - Direkt: Summe der Zähler, die dem Raum zugeordnet sind.
 * - Rest = Hauptzähler − Summe aller direkt erfassten Räume des Gebäudes.
 * - Rest wird nach Schlüssel verteilt: "area" (m²), "equal" (gleiche Teile) oder "none" (bleibt „Allgemein“).
 * - Negativer Rest (Fehlbetrag) wird nie verteilt, sondern gemeldet.
 */
export type AllocationKey = "area" | "equal" | "none";

export interface AllocationRoom {
  id: string;
  name: string;
  floorId: string;
  area: number | null;
}

export interface AllocationBuildingInput {
  locationId: string;
  key: AllocationKey;
  mainTotal: number | null;
  rooms: AllocationRoom[];
  directByRoom: Record<string, number>;
  pricePerUnit: number | null;
}

export interface AllocatedRoom {
  roomId: string;
  name: string;
  floorId: string;
  direct: number;
  allocated: number;
  total: number;
  cost: number | null;
}

export interface AllocationResult {
  locationId: string;
  rooms: AllocatedRoom[];
  general: number;
  shortfall: number;
  total: number;
  cost: number | null;
}

const cost = (v: number, p: number | null) => (p == null ? null : v * p);

export function allocateBuilding(input: AllocationBuildingInput): AllocationResult {
  const { rooms, directByRoom, key, mainTotal, pricePerUnit } = input;
  const direct = rooms.map((r) => Math.max(0, directByRoom[r.id] ?? 0));
  const directSum = direct.reduce((a, b) => a + b, 0);
  const raw = mainTotal == null ? 0 : mainTotal - directSum;
  const shortfall = raw < 0 ? -raw : 0;
  const remainder = raw > 0 ? raw : 0;

  let weights = rooms.map(() => 0);
  if (key === "equal") weights = rooms.map(() => 1);
  if (key === "area") weights = rooms.map((r) => (r.area && r.area > 0 ? r.area : 0));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const distribute = key !== "none" && wSum > 0;

  const out: AllocatedRoom[] = rooms.map((r, i) => {
    const allocated = distribute ? (remainder * weights[i]) / wSum : 0;
    const total = direct[i] + allocated;
    return { roomId: r.id, name: r.name, floorId: r.floorId, direct: direct[i], allocated, total, cost: cost(total, pricePerUnit) };
  });
  const general = distribute ? 0 : remainder;
  const total = directSum + remainder;
  return { locationId: input.locationId, rooms: out, general, shortfall, total, cost: cost(total, pricePerUnit) };
}

/** Raumfläche: manuell eingetragen, sonst Breite × Tiefe aus dem Grundriss. */
export function roomArea(r: { area_m2?: number | null; width?: number | null; depth?: number | null }): number | null {
  if (r.area_m2 != null && Number(r.area_m2) > 0) return Number(r.area_m2);
  const w = Number(r.width ?? 0), d = Number(r.depth ?? 0);
  return w > 0 && d > 0 ? w * d : null;
}
