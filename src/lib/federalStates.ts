/**
 * Deutsche Bundesländer mit PLZ-basierter Auto-Erkennung.
 * Quelle PLZ-Bereiche: vereinfachte Heuristik, abgleichbar mit Postleitzahlen-Liste.
 */

export type FederalStateCode =
  | "BW" | "BY" | "BE" | "BB" | "HB" | "HH" | "HE" | "MV"
  | "NI" | "NW" | "RP" | "SL" | "SN" | "ST" | "SH" | "TH";

export interface FederalState {
  code: FederalStateCode;
  name: string;
}

export const FEDERAL_STATES: FederalState[] = [
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "BE", name: "Berlin" },
  { code: "BB", name: "Brandenburg" },
  { code: "HB", name: "Bremen" },
  { code: "HH", name: "Hamburg" },
  { code: "HE", name: "Hessen" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SL", name: "Saarland" },
  { code: "SN", name: "Sachsen" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "TH", name: "Thüringen" },
];

export function getFederalStateName(code?: string | null): string | null {
  if (!code) return null;
  return FEDERAL_STATES.find((s) => s.code === code)?.name ?? null;
}

/**
 * PLZ → Bundesland (vereinfachte Bereiche, deckt > 95 % der deutschen PLZ ab).
 * Bei Grenzfällen sollte der Nutzer manuell überschreiben.
 */
export function detectFederalStateFromPostalCode(postalCode?: string | null): FederalStateCode | null {
  if (!postalCode) return null;
  const plz = postalCode.trim().padStart(5, "0").slice(0, 5);
  if (!/^\d{5}$/.test(plz)) return null;
  const n = parseInt(plz, 10);

  // 01000-09999 Sachsen / Sachsen-Anhalt / Thüringen / Brandenburg
  if (n >= 1000 && n <= 1999) return "SN";
  if (n >= 2000 && n <= 2999) return "SN"; // Görlitz region
  if (n >= 3000 && n <= 3999) return "BB";
  if (n >= 4000 && n <= 4999) {
    if (n >= 4600 && n <= 4699) return "ST"; // Sachsen-Anhalt (Bitterfeld)
    return "SN"; // Leipzig
  }
  if (n >= 6000 && n <= 6999) return "ST";
  if (n >= 7000 && n <= 7999) return "TH";
  if (n >= 8000 && n <= 9999) return "SN";
  // 10000-19999 Berlin/Brandenburg/MV
  if (n >= 10000 && n <= 14199) return "BE";
  if (n >= 14400 && n <= 16999) return "BB";
  if (n >= 17000 && n <= 17999) return "MV";
  if (n >= 18000 && n <= 19999) {
    if (n >= 19200 && n <= 19260) return "MV";
    if (n >= 19300 && n <= 19399) return "BB";
    return "MV";
  }
  // 20000-29999 HH / SH / NI
  if (n >= 20000 && n <= 22999) return "HH";
  if (n >= 23000 && n <= 25999) return "SH";
  if (n >= 26000 && n <= 29999) {
    if (n >= 28000 && n <= 28779) return "HB";
    return "NI";
  }
  // 30000-38999 NI
  if (n >= 30000 && n <= 31999) return "NI";
  if (n >= 32000 && n <= 33999) return "NW";
  if (n >= 34000 && n <= 34999) return "HE";
  if (n >= 35000 && n <= 36999) return "HE";
  if (n >= 37000 && n <= 37999) return "NI";
  if (n >= 38000 && n <= 38999) return "NI";
  // 39000-39999 ST
  if (n >= 39000 && n <= 39999) return "ST";
  // 40000-59999 NRW
  if (n >= 40000 && n <= 53999) return "NW";
  if (n >= 54000 && n <= 56999) return "RP";
  if (n >= 57000 && n <= 59999) return "NW";
  // 60000-69999 HE / RP / BW
  if (n >= 60000 && n <= 65999) return "HE";
  if (n >= 66000 && n <= 66999) return "SL";
  if (n >= 67000 && n <= 67999) return "RP";
  if (n >= 68000 && n <= 69999) return "BW";
  // 70000-79999 BW
  if (n >= 70000 && n <= 79999) return "BW";
  // 80000-87999 BY
  if (n >= 80000 && n <= 87999) return "BY";
  if (n >= 88000 && n <= 88099) return "BW";
  if (n >= 88100 && n <= 89999) return "BY";
  if (n >= 90000 && n <= 96999) return "BY";
  if (n >= 97000 && n <= 97999) return "BY";
  if (n >= 98000 && n <= 99999) return "TH";
  return null;
}
