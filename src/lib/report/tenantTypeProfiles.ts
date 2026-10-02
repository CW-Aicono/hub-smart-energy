import type { TenantType } from "@/hooks/useTenant";

export type GewerbeFrameworkCode = "EDL-G" | "EnEfG" | "CSRD" | "ISO50001";
export type SonstigeFrameworkCode = "FREIWILLIG" | "DNK" | "EMASEASY";

export interface FrameworkOption {
  code: string;
  label: string;
  legalBasis: string;
  description: string;
}

export const GEWERBE_FRAMEWORKS: Record<GewerbeFrameworkCode, FrameworkOption> = {
  "EDL-G": {
    code: "EDL-G",
    label: "EDL-G Energieaudit (DIN EN 16247-1)",
    legalBasis:
      "Energiedienstleistungsgesetz (EDL-G) – verpflichtendes Energieaudit alle 4 Jahre für Nicht-KMU nach DIN EN 16247-1",
    description:
      "Pflichtaudit für Nicht-KMU; Bericht enthält Energieflüsse, signifikante Verbraucher und wirtschaftliche Maßnahmen.",
  },
  EnEfG: {
    code: "EnEfG",
    label: "EnEfG (Energieeffizienzgesetz 2023)",
    legalBasis:
      "Energieeffizienzgesetz (EnEfG, 2023) – Pflicht-EnMS/UMS ab > 7,5 GWh/a, Veröffentlichungspflicht Endenergie & Einsparmaßnahmen ab > 2,5 GWh/a",
    description:
      "Energie- oder Umweltmanagementsystem (ISO 50001 / EMAS) inkl. Veröffentlichung wirtschaftlicher Maßnahmen.",
  },
  CSRD: {
    code: "CSRD",
    label: "CSRD / ESRS E1 Nachhaltigkeitsbericht",
    legalBasis:
      "Corporate Sustainability Reporting Directive (CSRD) / ESRS E1 – nicht-finanzielle Berichterstattung zu Energieverbrauch und Treibhausgasemissionen (Scope 1/2, optional Scope 3)",
    description:
      "Quantitative Angaben zu Energiemix, THG-Emissionen (marktbasiert + standortbasiert) und Transitionsplan.",
  },
  ISO50001: {
    code: "ISO50001",
    label: "Freiwillig (ISO 50001 / EMAS)",
    legalBasis:
      "Freiwilliger Energiemanagement-Bericht nach ISO 50001 bzw. EMAS – kontinuierliche Verbesserung der energiebezogenen Leistung",
    description:
      "EnPI-basierte Energieleistungsbewertung, Maßnahmenverfolgung und Managementbewertung.",
  },
};

export const SONSTIGE_FRAMEWORKS: Record<SonstigeFrameworkCode, FrameworkOption> = {
  FREIWILLIG: {
    code: "FREIWILLIG",
    label: "Freiwilliger Energie- & Nachhaltigkeitsbericht",
    legalBasis: "Freiwillige Berichterstattung – keine gesetzliche Pflicht",
    description: "Transparenz zu Verbrauch, CO₂-Bilanz und Maßnahmen für Mitglieder/Stakeholder.",
  },
  DNK: {
    code: "DNK",
    label: "Deutscher Nachhaltigkeitskodex (DNK)",
    legalBasis:
      "Deutscher Nachhaltigkeitskodex – Kriterien 11–13 (Inanspruchnahme natürlicher Ressourcen, Ressourcenmanagement, klimarelevante Emissionen)",
    description: "DNK-konforme Darstellung von Ressourcen- und Emissionsdaten.",
  },
  EMASEASY: {
    code: "EMASEASY",
    label: "EMASeasy für kleine Organisationen",
    legalBasis:
      "EMASeasy – vereinfachtes Umweltmanagement nach EMAS-Verordnung (EG) Nr. 1221/2009 für kleine Organisationen",
    description: "Vereinfachte Umwelterklärung mit Energie- und Emissionskennzahlen.",
  },
};

/** BDEW-Richtwerte Durchschnittshaushalt (kWh/a) */
export const BDEW_HOUSEHOLD_ELECTRICITY: Record<number, { min: number; max: number; avg: number }> = {
  1: { min: 1300, max: 2300, avg: 1800 },
  2: { min: 2000, max: 3500, avg: 2800 },
  3: { min: 2700, max: 4500, avg: 3600 },
  4: { min: 3200, max: 5500, avg: 4300 },
  5: { min: 4000, max: 6500, avg: 5200 },
};

/** Richtwerte Heizenergie (kWh/m²·a) nach grobem Gebäudestandard */
export const HEATING_BENCHMARKS_KWH_M2 = {
  unsaniert: 220,
  teilsaniert: 150,
  saniert: 100,
  neubau_geg: 55,
  kfw55: 40,
  kfw40: 25,
};

export interface TenantTypeProfile {
  type: TenantType;
  label: string;
  reportTitle: string;
  reportSubtitle: string;
  defaultLegalBasis: string;
  aiSections: { key: string; label: string }[];
}

export const TENANT_TYPE_PROFILES: Record<TenantType, TenantTypeProfile> = {
  kommune: {
    type: "kommune",
    label: "Kommune",
    reportTitle: "Kommunaler Energiebericht",
    reportSubtitle:
      "Bericht nach landesrechtlichen Vorgaben (Klimaschutzgesetze) mit Liegenschaftssteckbriefen, Benchmarking und CO₂-Bilanz",
    defaultLegalBasis: "Landes-Klimaschutzgesetz (siehe Bundesland-Profil)",
    aiSections: [
      { key: "vorwort", label: "Vorwort" },
      { key: "einleitung", label: "Einleitung" },
      { key: "ausblick", label: "Ausblick" },
    ],
  },
  gewerbe_industrie: {
    type: "gewerbe_industrie",
    label: "Gewerbe / Industrie",
    reportTitle: "Energiebericht Gewerbe & Industrie",
    reportSubtitle:
      "Energie- und CO₂-Bericht nach EDL-G, EnEfG, CSRD/ESRS E1 oder ISO 50001 mit Scope-1/2-Bilanz und Maßnahmen-ROI",
    defaultLegalBasis: GEWERBE_FRAMEWORKS.EnEfG.legalBasis,
    aiSections: [
      { key: "executive_summary", label: "Executive Summary" },
      { key: "methodik_audit", label: "Methodik & Bilanzraum" },
      { key: "massnahmen_roi", label: "Maßnahmen & Wirtschaftlichkeit" },
      { key: "ausblick_dekarbonisierung", label: "Dekarbonisierungspfad" },
    ],
  },
  privat: {
    type: "privat",
    label: "Privat",
    reportTitle: "Persönlicher Energiebericht",
    reportSubtitle:
      "Verbrauchs- und CO₂-Übersicht für Ihren Haushalt mit Vergleich zum BDEW-Durchschnitt und Spartipps",
    defaultLegalBasis: "Freiwilliger Haushaltsbericht (Orientierung an GEG & BDEW-Kennwerten)",
    aiSections: [
      { key: "zusammenfassung", label: "Zusammenfassung" },
      { key: "vergleich_durchschnitt", label: "Vergleich Durchschnittshaushalt" },
      { key: "spartipps", label: "Spartipps" },
    ],
  },
  sonstige: {
    type: "sonstige",
    label: "Sonstige",
    reportTitle: "Energie- & Nachhaltigkeitsbericht",
    reportSubtitle:
      "Freiwilliger Bericht für Vereine, Stiftungen, Kirchen und vergleichbare Organisationen – wahlweise nach DNK oder EMASeasy",
    defaultLegalBasis: SONSTIGE_FRAMEWORKS.FREIWILLIG.legalBasis,
    aiSections: [
      { key: "vorwort", label: "Vorwort" },
      { key: "nachhaltigkeitskontext", label: "Nachhaltigkeitskontext" },
      { key: "massnahmen", label: "Maßnahmen" },
      { key: "ausblick", label: "Ausblick" },
    ],
  },
};

export function getTenantTypeProfile(type: TenantType): TenantTypeProfile {
  return TENANT_TYPE_PROFILES[type] ?? TENANT_TYPE_PROFILES.kommune;
}
