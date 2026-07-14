/**
 * Radiales Default-Layout für den Energieflussmonitor.
 * Gibt Prozentkoordinaten (0..100) relativ zum Container zurück.
 * Erster Knoten liegt oben (12 Uhr), weitere im Uhrzeigersinn.
 */
export const ENERGY_FLOW_CENTER = { x: 50, y: 50 } as const;
export const ENERGY_FLOW_RADIUS_PCT = 34;

export function computeRadialDefault(index: number, total: number): { x: number; y: number } {
  if (total <= 0) return { x: ENERGY_FLOW_CENTER.x, y: ENERGY_FLOW_CENTER.y };
  const angle = (-90 + (index * 360) / total) * (Math.PI / 180);
  // Bildschirm-Aspekt ~16:9 → y etwas stärker skalieren, damit der Kreis rund wirkt
  const rx = ENERGY_FLOW_RADIUS_PCT;
  const ry = ENERGY_FLOW_RADIUS_PCT;
  return {
    x: Math.round(ENERGY_FLOW_CENTER.x + Math.cos(angle) * rx),
    y: Math.round(ENERGY_FLOW_CENTER.y + Math.sin(angle) * ry),
  };
}

/**
 * Verteilt eine Knoten-Liste radial neu (behält Reihenfolge).
 */
export function applyRadialLayout<T extends { x?: number; y?: number }>(nodes: T[]): T[] {
  return nodes.map((n, i) => ({ ...n, ...computeRadialDefault(i, nodes.length) }));
}
