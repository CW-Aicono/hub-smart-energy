/**
 * KMU-Klassifikation nach EU-Empfehlung 2003/361/EG (relevant für §42c EnWG).
 * Vereinfacht: ein Unternehmen ist KMU, wenn Mitarbeiter < 250 UND (Umsatz ≤ 50 Mio. EUR ODER Bilanz ≤ 43 Mio. EUR).
 */
export type CustomerClass = "privat" | "kleinst" | "klein" | "mittel" | "gross" | "jur_oer";

export interface KmuInput {
  employees?: number | null;
  annual_revenue_eur?: number | null;
  annual_balance_eur?: number | null;
}

export interface KmuResult {
  klass: CustomerClass;
  eligible: boolean; // teilnahmeberechtigt nach §42c Abs. 2 EnWG
  label: string;
  reason: string;
}

export function classifyKmu(input: KmuInput): KmuResult {
  const e = input.employees ?? 0;
  const u = input.annual_revenue_eur ?? 0;
  const b = input.annual_balance_eur ?? 0;

  // Kleinstunternehmen: < 10 MA und (Umsatz oder Bilanz ≤ 2 Mio. EUR)
  if (e > 0 && e < 10 && (u <= 2_000_000 || b <= 2_000_000)) {
    return { klass: "kleinst", eligible: true, label: "Kleinstunternehmen", reason: "< 10 Beschäftigte, max. 2 Mio. EUR" };
  }
  // Kleines Unternehmen: < 50 MA und (Umsatz oder Bilanz ≤ 10 Mio. EUR)
  if (e > 0 && e < 50 && (u <= 10_000_000 || b <= 10_000_000)) {
    return { klass: "klein", eligible: true, label: "Kleines Unternehmen", reason: "< 50 Beschäftigte, max. 10 Mio. EUR" };
  }
  // Mittleres Unternehmen: < 250 MA und (Umsatz ≤ 50 Mio. ODER Bilanz ≤ 43 Mio.)
  if (e > 0 && e < 250 && (u <= 50_000_000 || b <= 43_000_000)) {
    return { klass: "mittel", eligible: true, label: "Mittleres Unternehmen", reason: "< 250 Beschäftigte, ≤ 50 Mio. EUR Umsatz oder ≤ 43 Mio. EUR Bilanz" };
  }
  // Großunternehmen (nicht teilnahmeberechtigt nach §42c Abs. 2)
  if (e >= 250 || u > 50_000_000 || b > 43_000_000) {
    return { klass: "gross", eligible: false, label: "Großunternehmen", reason: "≥ 250 Beschäftigte oder > 50 Mio. EUR Umsatz / > 43 Mio. EUR Bilanz — nicht teilnahmeberechtigt" };
  }
  // Keine Angaben → annehmen Privatperson
  return { klass: "privat", eligible: true, label: "Privatperson / nicht klassifiziert", reason: "Standard-Annahme" };
}

export const CUSTOMER_CLASS_LABELS: Record<CustomerClass, string> = {
  privat: "Privatperson",
  kleinst: "Kleinstunternehmen",
  klein: "Kleines Unternehmen",
  mittel: "Mittleres Unternehmen",
  gross: "Großunternehmen (nicht zulässig)",
  jur_oer: "Juristische Person öffentl. Rechts",
};

export const IMSYS_STATUS_LABELS: Record<string, string> = {
  missing: "Nicht vorhanden",
  requested: "Beantragt",
  installed: "Installiert",
};

export const METERING_TYPE_LABELS: Record<string, string> = {
  zaehlerstandsgang: "Zählerstandsgang",
  "15min_leistung": "15-Min Leistungsmessung",
};

export const BUILDING_TYPE_LABELS: Record<string, string> = {
  efh: "Einfamilienhaus",
  mfh: "Mehrfamilienhaus",
  sonstige: "Sonstiges",
};

/** Liefert "Frist endet am …" Datum: 4 Monate nach Antrag (MsbG §34 Abs. 2 Nr. 1). */
export function imsysDeadline(requestedAt: string | null | undefined): Date | null {
  if (!requestedAt) return null;
  const d = new Date(requestedAt);
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + 4);
  return d;
}

/** Prüft, ob Anlagengröße unter Erleichterungsgrenze fällt (kein Stromlieferantenstatus). */
export function isSmallPlant(capacityKw: number, buildingType: string | null | undefined): { small: boolean; threshold: number } {
  const threshold = buildingType === "mfh" ? 100 : 30;
  return { small: capacityKw > 0 && capacityKw < threshold, threshold };
}
