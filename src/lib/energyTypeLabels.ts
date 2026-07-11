// Zentrale, sprachlich korrekte Anzeige-Beschriftung für Energiearten.
const MAP: Record<string, string> = {
  strom: "Strom",
  electricity: "Strom",
  gas: "Gas",
  wasser: "Wasser",
  water: "Wasser",
  wärme: "Wärme",
  waerme: "Wärme",
  heat: "Wärme",
  district_heating: "Fernwärme",
  fernwaerme: "Fernwärme",
  heating_oil: "Heizöl",
  oel: "Heizöl",
  öl: "Heizöl",
  heat_pump: "Wärmepumpe",
  wood_pellets: "Pellets",
  pellets: "Pellets",
  co2: "CO₂",
};

export function formatEnergyType(value: string | null | undefined): string {
  if (!value) return "–";
  const key = String(value).trim().toLowerCase();
  if (MAP[key]) return MAP[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}
