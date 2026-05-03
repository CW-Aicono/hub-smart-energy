import { FederalStateCode } from "@/lib/federalStates";

export type ReportSection =
  | "cover"
  | "vorwort"
  | "einleitung"
  | "kostenanalyse"
  | "verbrauch"
  | "co2"
  | "vergleich"
  | "einsparpotenzial"
  | "priorisierung"
  | "einzelanalyse"
  | "ausblick"
  | "anhang_emissionsfaktoren";

export interface FederalStateReportProfile {
  code: FederalStateCode;
  name: string;
  legalBasis: string;
  reportingCycle: number; // Jahre
  weatherCorrection: boolean;
  benchmarkSource: string;
  emissionFactors: string;
  sections: ReportSection[];
  /** Spezielle Pflichtthemen für KI-Texterstellung */
  extraTopics: string[];
}

const COMMON_SECTIONS: ReportSection[] = [
  "cover",
  "vorwort",
  "einleitung",
  "kostenanalyse",
  "verbrauch",
  "co2",
  "vergleich",
  "einsparpotenzial",
  "priorisierung",
  "einzelanalyse",
  "ausblick",
  "anhang_emissionsfaktoren",
];

export const FEDERAL_STATE_REPORT_PROFILES: Record<FederalStateCode, FederalStateReportProfile> = {
  NI: {
    code: "NI",
    name: "Niedersachsen",
    legalBasis: "Niedersächsisches Klimaschutzgesetz (NKlimaG, Dez. 2020) – verpflichtender Energiebericht im 3-Jahres-Turnus",
    reportingCycle: 3,
    weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB Vergleichswerte Nichtwohngebäude (April 2015)",
    emissionFactors: "GEG (Gebäudeenergiegesetz) 8. August 2020",
    sections: COMMON_SECTIONS,
    extraTopics: [],
  },
  BW: {
    code: "BW",
    name: "Baden-Württemberg",
    legalBasis: "Klimaschutz- und Klimawandelanpassungsgesetz BW (KlimaG BW) sowie EWärmeG für Bestandsgebäude",
    reportingCycle: 2,
    weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB Vergleichswerte Nichtwohngebäude (April 2015)",
    emissionFactors: "GEG 2020 / UBA aktuelle Strom-Faktoren",
    sections: COMMON_SECTIONS,
    extraTopics: ["EWärmeG-Pflichtanteil 15 % erneuerbare Wärme bei Heizungstausch"],
  },
  BY: {
    code: "BY",
    name: "Bayern",
    legalBasis: "Bayerisches Klimaschutzgesetz (BayKlimaG)",
    reportingCycle: 2,
    weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB Vergleichswerte Nichtwohngebäude (April 2015)",
    emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS,
    extraTopics: ["Klimaneutrale Staatsverwaltung 2028 als Vorbild"],
  },
  BE: {
    code: "BE",
    name: "Berlin",
    legalBasis: "Energiewendegesetz Berlin (EWG Bln) inkl. Solargesetz Berlin",
    reportingCycle: 2,
    weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB Vergleichswerte Nichtwohngebäude (April 2015)",
    emissionFactors: "GEG 2020 / UBA",
    sections: COMMON_SECTIONS,
    extraTopics: ["Solarpflicht für öffentliche Gebäude (Solargesetz Berlin)"],
  },
  BB: {
    code: "BB", name: "Brandenburg",
    legalBasis: "Brandenburgisches Klimaplangesetz (in Vorbereitung); freiwilliger Energiebericht empfohlen",
    reportingCycle: 3, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: [],
  },
  HB: {
    code: "HB", name: "Bremen",
    legalBasis: "Bremisches Klimaschutz- und Energiegesetz (BremKEG)",
    reportingCycle: 2, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: ["Kommunale Wärmeplanung Bremen"],
  },
  HH: {
    code: "HH", name: "Hamburg",
    legalBasis: "Hamburgisches Klimaschutzgesetz (HmbKliSchG)",
    reportingCycle: 2, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: ["Pflicht zur PV-Anlage bei Neubauten und Dachsanierungen"],
  },
  HE: {
    code: "HE", name: "Hessen",
    legalBasis: "Hessisches Energiegesetz (HEG) und Hessischer Klimaplan",
    reportingCycle: 3, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: [],
  },
  MV: {
    code: "MV", name: "Mecklenburg-Vorpommern",
    legalBasis: "Klimaschutzgesetz MV (in Vorbereitung); kommunale Energieberichte empfohlen",
    reportingCycle: 3, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: [],
  },
  NW: {
    code: "NW", name: "Nordrhein-Westfalen",
    legalBasis: "Klimaschutzgesetz NRW",
    reportingCycle: 2, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: ["Kommunale Wärmeplanung NRW"],
  },
  RP: {
    code: "RP", name: "Rheinland-Pfalz",
    legalBasis: "Landesklimaschutzgesetz RLP (LKSG)",
    reportingCycle: 3, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: [],
  },
  SL: {
    code: "SL", name: "Saarland",
    legalBasis: "Klimaschutzgesetz Saarland (in Vorbereitung)",
    reportingCycle: 3, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: [],
  },
  SN: {
    code: "SN", name: "Sachsen",
    legalBasis: "Sächsisches Energie- und Klimaprogramm (EKP); kommunaler Energiebericht empfohlen",
    reportingCycle: 3, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: [],
  },
  ST: {
    code: "ST", name: "Sachsen-Anhalt",
    legalBasis: "Klima- und Energiekonzept Sachsen-Anhalt",
    reportingCycle: 3, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: [],
  },
  SH: {
    code: "SH", name: "Schleswig-Holstein",
    legalBasis: "Energiewende- und Klimaschutzgesetz SH (EWKG)",
    reportingCycle: 2, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: ["Kommunaler Klimaschutz nach EWKG §7"],
  },
  TH: {
    code: "TH", name: "Thüringen",
    legalBasis: "Thüringer Klimagesetz (ThürKlimaG)",
    reportingCycle: 3, weatherCorrection: true,
    benchmarkSource: "BMWi/BMUB 2015", emissionFactors: "GEG 2020",
    sections: COMMON_SECTIONS, extraTopics: [],
  },
};

export function getReportProfile(code?: string | null): FederalStateReportProfile {
  if (code && code in FEDERAL_STATE_REPORT_PROFILES) {
    return FEDERAL_STATE_REPORT_PROFILES[code as FederalStateCode];
  }
  return FEDERAL_STATE_REPORT_PROFILES.NI;
}
