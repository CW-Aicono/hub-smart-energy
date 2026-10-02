/**
 * Kurzbeschreibungen je Board-Kachel.
 * Werden auf der Detailseite (/board/tile/:id) angezeigt, damit User
 * den Kontext der Zahl ohne Wechsel ins Operativ-Dashboard verstehen.
 */
export interface TileInfo {
  /** 1-Satz-Erklärung was die Kennzahl aussagt */
  description: string;
  /** Wie wird die Zahl berechnet / woher kommt sie */
  methodology: string;
  /** Was kann der User daraus ableiten / typische Aktionen */
  insights: string[];
}

export const TILE_INFO: Record<string, TileInfo> = {
  cost_today: {
    description:
      "Summe aller Energiekosten (Strom, Gas, Wärme, Wasser) für den heutigen Tag über alle Standorte.",
    methodology:
      "Energiemengen × tagesaktueller Tarif (inkl. dynamischer Spot-Preise, sofern aktiviert).",
    insights: [
      "Vergleicht den heutigen Verbrauch mit dem Tagesmittel des Monats",
      "Frühindikator für ungewöhnlichen Verbrauch (Leckagen, Defekte)",
    ],
  },
  cost_month: {
    description: "Aufgelaufene Energiekosten im laufenden Monat über alle Standorte und Energiearten.",
    methodology: "Tägliche Kosten summiert vom 1. des Monats bis heute.",
    insights: [
      "Wird hochgerechnet auf die Prognose Monatsende",
      "Vergleich mit Vormonat und Vorjahresmonat möglich",
    ],
  },
  cost_ytd: {
    description: "Year-to-Date Energiekosten – alle Kosten seit dem 1. Januar.",
    methodology: "Summe aller Tageskosten ab Jahresbeginn.",
    insights: [
      "Basis für die Einsparungs-Berechnung ggü. Vorjahr",
      "Liefert die Trendlinie für das Geschäftsjahres-Budget",
    ],
  },
  savings_vs_last_year: {
    description: "Differenz der YTD-Kosten zum gleichen Zeitraum des Vorjahres.",
    methodology: "Kosten YTD aktuelles Jahr − Kosten YTD Vorjahr (negativ = mehr).",
    insights: [
      "Positive Werte = Einsparung",
      "Hilfreich um den ROI von Effizienzmaßnahmen zu zeigen",
    ],
  },
  forecast_eom: {
    description: "Hochrechnung der Energiekosten zum Monatsende.",
    methodology: "Lineare Extrapolation: Kosten Monat / Tage bisher × Tage gesamt.",
    insights: [
      "Frühwarnung wenn Budget-Korridor verlassen wird",
      "Vergleich mit Vormonatskosten gibt Trend",
    ],
  },
  co2_month: {
    description: "CO₂-Äquivalente Emissionen aller Energiearten im laufenden Monat.",
    methodology: "Verbrauch × deutscher Strommix-Faktor bzw. Gas-Faktor (BAFA).",
    insights: [
      "Pflicht-Kennzahl für ESG-Reporting (CSRD)",
      "Direkter Hebel: PV-Anteil und Wärmepumpe erhöhen",
    ],
  },
  co2_ytd: {
    description: "Aufaddierte CO₂-Emissionen seit Jahresbeginn.",
    methodology: "Summe aller Monatswerte ab Januar.",
    insights: [
      "Basis für jährlichen Nachhaltigkeitsbericht",
      "Zielkorridor für Klimastrategie überprüfen",
    ],
  },
  co2_avoided_tons: {
    description: "Durch eigene PV-Erzeugung vermiedene CO₂-Emissionen.",
    methodology: "Eigenverbrauchte PV-kWh × deutscher Strommix-Faktor.",
    insights: [
      "Marketing-relevant für Nachhaltigkeits-Kommunikation",
      "Steigt mit Eigenverbrauchsquote",
    ],
  },
  self_consumption_ratio: {
    description: "Anteil der PV-Erzeugung, der selbst verbraucht wird (statt eingespeist).",
    methodology: "(PV-Erzeugung − Einspeisung) / PV-Erzeugung × 100.",
    insights: [
      "Höher = wirtschaftlicher (Einspeisevergütung < Strompreis)",
      "Speicher und Lastmanagement steigern den Wert",
    ],
  },
  self_sufficiency: {
    description: "Anteil des Gesamtverbrauchs, der aus eigener PV gedeckt wird.",
    methodology: "Eigenverbrauchte PV-kWh / Gesamtverbrauch × 100.",
    insights: [
      "Misst die Unabhängigkeit vom Stromnetz",
      "Speicher und PV-Erweiterung sind die größten Hebel",
    ],
  },
  pv_yield_month: {
    description: "Erzeugte PV-Energie im laufenden Monat über alle Anlagen.",
    methodology: "Summe der Erzeugungs-Zähler (Plus-Werte).",
    insights: [
      "Vergleich mit Prognose zeigt Anlagen-Performance",
      "Auffälliger Rückgang = Verschmutzung / Defekt",
    ],
  },
  top_locations: {
    description: "Die drei kostenintensivsten Standorte im laufenden Monat.",
    methodology: "Aggregation der Monatskosten je Standort, sortiert absteigend.",
    insights: [
      "Schnelles Ranking wo Effizienzmaßnahmen den größten Hebel haben",
      "Vergleichbarkeit über kWh / m² verbessert Aussage",
    ],
  },
  alerts_open: {
    description: "Anzahl unbestätigter Integrations-Fehler (Gateways, Schnittstellen).",
    methodology: "Tasks mit category=integration_error und status≠done.",
    insights: [
      "Hohe Zahl = Datenqualität gefährdet",
      "Auto-Resolve schließt Fehler bei erneuter Verbindung",
    ],
  },
  gateway_availability: {
    description: "Anteil der Gateways mit Heartbeat ≤ 3 Minuten (Online-Quote).",
    methodology: "Online-Gateways / Gesamt-Gateways × 100.",
    insights: [
      "Unter 95 % = Daten-Lücken im Monitoring",
      "Häufige Ursache: Netzwerkprobleme vor Ort",
    ],
  },
  cp_stability: {
    description: "Durchschnittliche Online-Quote der Ladepunkte über 30 Tage.",
    methodology: "5-Minuten-Snapshots aus charge_point_uptime_snapshots, gemittelt.",
    insights: [
      "Wichtig für Servicelevel-Versprechen an Endkunden",
      "Werte < 95 % deuten auf Hardware- oder Netzproblem",
    ],
  },
  charging_revenue_month: {
    description: "Insgesamt geladene Energie an allen Ladepunkten im laufenden Monat.",
    methodology: "Summe der abgeschlossenen Ladevorgänge (Wh → kWh).",
    insights: [
      "Basis für Umsatz-Hochrechnung",
      "Vergleich mit PV-Erzeugung zeigt Solar-Lade-Quote",
    ],
  },
  trading_pnl_month: {
    description: "Gewinn/Verlust durch Spot-Markt-Arbitrage im laufenden Monat.",
    methodology: "Erlöse aus Hoch-Preis-Phasen − Kosten aus Lade-Phasen.",
    insights: [
      "Nur sinnvoll mit Speicher oder flexibler Last",
      "Stark abhängig von Spot-Preis-Volatilität",
    ],
  },
  invoices_open: {
    description: "Offene, nicht beglichene Ausgangsrechnungen.",
    methodology: "Rechnungen mit Status issued/sent ohne Zahlungseingang.",
    insights: [
      "Cash-Flow-Indikator – frühzeitig mahnen",
      "Über 30 Tage offen = Mahnstufe 1 ausstoßen",
    ],
  },
  tasks_open: {
    description: "Alle offenen Aufgaben quer durch alle Standorte.",
    methodology: "Tasks mit status in (open, in_progress).",
    insights: [
      "Sollte sich nicht aufbauen über die Zeit",
      "Filter nach Priorität für nächste Sprint-Planung",
    ],
  },
  tasks_overdue: {
    description: "Aufgaben, deren Fälligkeitsdatum überschritten ist.",
    methodology: "Tasks mit due_date < heute und status ≠ done.",
    insights: [
      "Kritisches Eskalations-Signal",
      "Direkt an Verantwortliche erinnern",
    ],
  },
};
