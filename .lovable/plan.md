

# Erweiterung Kommunaler Energiebericht -- Implementierungsplan

## Uebersicht

Zehn Erweiterungen, die den bestehenden Energiebericht von einem statischen Stammdaten-Bericht zu einem vollwertigen Analyse-Werkzeug fuer kommunale Energiemanager machen. Keine neuen Datenbanktabellen noetig -- alle Erweiterungen nutzen vorhandene Tabellen (`meter_period_totals`, `meters`, `locations`, `energy_benchmarks`, `co2_emission_factors`, `energy_prices`).

---

## 1. Echtdaten-Integration in PropertyProfile und Bericht

**Problem:** PropertyProfile zeigt aktuell nur Stammdaten, keine Verbraeuche.

**Loesung:** Neuer Hook `useLocationYearlyConsumption(locationIds, year)` der fuer jede Liegenschaft die Jahressummen aus `meter_period_totals` (period_type='day' oder 'month') pro Energietraeger laedt. Ergebnis: `Record<locationId, Record<energyType, totalKwh>>`.

**Aenderungen:**
- Neuer Hook `src/hooks/useLocationYearlyConsumption.tsx` -- RPC `get_meter_period_sums` je Liegenschaft aufrufen, Zaehler-IDs via `meters` nach `location_id` filtern
- `PropertyProfile.tsx` erhaelt neue Prop `consumption: Record<string, number>` und zeigt Verbrauchstabelle (Strom / Waerme / Gas / Wasser) mit kWh-Werten an
- `EnergyReport.tsx` ruft den Hook auf und reicht Daten an PropertyProfile und die Management Summary weiter
- PDF-Druckbereich: Platzhalter-Hinweis wird durch echte Verbrauchstabelle ersetzt

---

## 2. Mehrjahresvergleich (3-5 Jahre Trend)

**Loesung:** Der Hook aus Punkt 1 wird erweitert auf mehrere Jahre. Neuer Hook `useMultiYearConsumption(locationIds, fromYear, toYear)` der fuer bis zu 5 Jahre die Summen laedt.

**Aenderungen:**
- `useLocationYearlyConsumption.tsx` erhaelt optionalen Parameter `years: number[]` statt nur `year`
- Neue Komponente `src/components/report/ConsumptionTrendTable.tsx` -- Tabelle mit Spalten: Energietraeger | Jahr-3 | Jahr-2 | Jahr-1 | Berichtsjahr | Trend (Pfeil hoch/runter + Prozent)
- Neue Komponente `src/components/report/ConsumptionTrendChart.tsx` -- Balkendiagramm (Recharts BarChart) mit gruppierten Balken pro Jahr und Energietraeger
- Integration in PropertyProfile und in die Portfolio-Uebersicht des Berichts
- PDF: SVG-Balkendiagramm inline generieren (wie bestehende `buildBarChartSVG` in `exportUtils.ts`)

---

## 3. Wasser-Benchmarks ergaenzen

**Aenderungen:**
- Seed-Daten per INSERT in `energy_benchmarks` fuer `energy_type = 'wasser'`:
  - Verwaltung: 100 / 150 / 250 l/m2a
  - Schule: 80 / 130 / 220 l/m2a
  - Kita: 100 / 160 / 260 l/m2a
  - Sportstaette: 200 / 350 / 550 l/m2a
- `BenchmarkIndicator.tsx` und `useBenchmarks.tsx` funktionieren bereits generisch -- keine Code-Aenderung noetig, nur Daten einfuegen

---

## 4. Massnahmen-Tracking

**Datenbank-Migration:** Neue Tabelle `energy_measures`:

```text
id (uuid PK), tenant_id (uuid FK), location_id (uuid FK),
title (text), description (text), category (text),
implementation_date (date), investment_cost (numeric),
estimated_annual_savings_kwh (numeric),
estimated_annual_savings_eur (numeric),
energy_type (text), status (text: planned/in_progress/completed),
created_at, updated_at
```

RLS: Tenant-basiert, lesen fuer alle authentifizierten Nutzer des Mandanten, schreiben fuer Admins.

**Aenderungen:**
- Neuer Hook `src/hooks/useEnergyMeasures.tsx` -- CRUD fuer Massnahmen
- Neue Komponente `src/components/report/MeasuresTable.tsx` -- Tabelle mit Status-Badges, Investition, erwarteter Einsparung
- Neue Komponente `src/components/report/AddMeasureDialog.tsx` -- Formular zum Anlegen/Bearbeiten
- Integration in `PropertyProfile` (Abschnitt "Umgesetzte Massnahmen")
- Integration in EnergyReport PDF (Anhang oder pro Liegenschaft)

---

## 5. Finanzielle Bewertung (Kostenentwicklung)

**Loesung:** Bestehende `useEnergyPrices` nutzen, Verbrauch * aktiver Preis pro Energietraeger berechnen.

**Aenderungen:**
- Neue Hilfsfunktion in `src/lib/co2Calculations.ts` (oder eigene Datei `costCalculations.ts`): `calculateEnergyCost(consumptionKwh, energyType, prices, year)` -- findet den gueltigen Preis und multipliziert
- `PropertyProfile.tsx`: Neuer Abschnitt "Energiekosten" mit Tabelle: Energietraeger | Verbrauch | Preis/kWh | Gesamtkosten
- Management Summary: Gesamtkosten aller Liegenschaften als KPI-Box
- PDF: Kostentabelle pro Liegenschaft und Gesamtsumme in der Summary

---

## 6. Liegenschafts-Ranking (Top-Verbraucher)

**Aenderungen:**
- Neue Komponente `src/components/report/LocationRanking.tsx` -- Sortierbare Tabelle: Rang | Name | Typ | NGF | Kennwert (kWh/m2a) | Ampel | Verbrauch absolut
- Sortierung nach spezifischem Verbrauch (kWh/m2a), getrennt fuer Strom und Waerme
- Integration in EnergyReport Tab "Vorschau" als eigener Abschnitt zwischen Summary und Steckbriefen
- PDF: Ranking-Tabelle im Kapitel "Portfolio-Uebersicht"

---

## 7. Berichts-Archivierung und Versionierung

**Datenbank-Migration:** Neue Tabelle `energy_report_archive`:

```text
id (uuid PK), tenant_id (uuid FK),
report_year (integer), title (text),
location_ids (uuid[]), generated_at (timestamptz),
generated_by (uuid FK auth.users), report_config (jsonb),
pdf_storage_path (text), created_at
```

RLS: Tenant-basiert, nur Admins koennen erstellen/loeschen.

**Aenderungen:**
- Neuer Hook `src/hooks/useReportArchive.tsx` -- Speichern/Laden/Loeschen archivierter Berichte
- Beim PDF-Generieren: HTML-Blob zusaetzlich als Datei in den `tenant-assets` Storage-Bucket hochladen, Pfad in `energy_report_archive` speichern
- Neuer Tab "Archiv" in `EnergyReport.tsx` -- Liste gespeicherter Berichte mit Download-Link und Loeschen-Button
- Versionierung: Jede Generierung erzeugt einen neuen Eintrag, aeltere bleiben erhalten

---

## 8. Primaerenergiefaktoren

**Aenderungen:**
- `co2_emission_factors` Tabelle um Spalte `primary_energy_factor` (numeric, nullable) erweitern per Migration
- Seed-Daten: Strom = 1.8, Gas = 1.1, Fernwaerme = 0.7, Heizoel = 1.1 (nach EnEV/GEG)
- `useCo2Factors.tsx`: Interface `Co2Factor` um `primary_energy_factor` erweitern
- Neue Funktion `calculatePrimaryEnergy(kwh, energyType, factors)` in `co2Calculations.ts`
- `Co2FactorSettings.tsx`: Zusaetzliche Spalte in der Tabelle fuer Primaerenergiefaktor
- `PropertyProfile.tsx`: Primaerenergiebedarf (kWh/m2a) als zusaetzlichen Kennwert anzeigen
- PDF: Primaerenergie in der Kennwerte-Tabelle und im Anhang

---

## 9. Datenqualitaets-Indikatoren

**Loesung:** Pro Liegenschaft und Monat pruefen, ob Verbrauchsdaten vorhanden sind. Vollstaendigkeit als Prozent und als farbcodierte Monats-Matrix anzeigen.

**Aenderungen:**
- Neuer Hook `src/hooks/useDataCompleteness.tsx` -- Fuer jede Liegenschaft und jeden Monat im Berichtsjahr pruefen: Hat `meter_period_totals` einen Eintrag fuer jeden Hauptzaehler? Ergebnis: `Record<locationId, { monthsComplete: number, totalMonths: number, missingMonths: string[] }>`
- Neue Komponente `src/components/report/DataCompletenessIndicator.tsx` -- Farbige Monats-Kacheln (gruen = komplett, gelb = teilweise, rot = fehlend) mit Gesamt-Prozent
- Integration in PropertyProfile als Badge/Indikator oben rechts
- Management Summary: Durchschnittliche Datenqualitaet als KPI
- PDF: Completeness-Grid pro Liegenschaft

---

## 10. Visuelle Analytik im PDF

**Aenderungen:**
- Neue Hilfsfunktionen in `src/lib/exportUtils.ts`:
  - `buildStackedBarChartSVG()` -- Gestapelte Balken fuer Energiemix
  - `buildTrendLineSVG()` -- Liniendiagramm fuer Mehrjahrestrend
  - `buildTrafficLightSVG()` -- Ampel-Grafik fuer Benchmark-Bewertung
  - `buildDonutChartSVG()` -- Kreisdiagramm fuer Energieverteilung
- PDF Kapitel "Portfolio-Uebersicht": Gestapeltes Balkendiagramm aller Liegenschaften
- PDF Steckbrief: Trend-Linie (3 Jahre) und Ampel-Grafik inline
- PDF Summary: Donut-Chart fuer Energieverteilung

---

## Reihenfolge der Implementierung

1. **Echtdaten-Hook** (`useLocationYearlyConsumption`) -- Grundlage fuer fast alle weiteren Punkte
2. **Mehrjahresvergleich** -- Erweitert den Hook, Trend-Tabelle und -Chart
3. **Datenqualitaet** -- Wichtig, damit der Nutzer weiss, welche Daten fehlen
4. **PropertyProfile mit Echtdaten** -- Verbrauchstabelle, Kennwerte, CO2
5. **Finanzielle Bewertung** -- Kostenberechnung aus Preisen
6. **Liegenschafts-Ranking** -- Top-Verbraucher-Tabelle
7. **Wasser-Benchmarks** -- Nur Seed-Daten einfuegen
8. **Primaerenergiefaktoren** -- DB-Migration + UI-Erweiterung
9. **Massnahmen-Tracking** -- Neue Tabelle, Hook, UI
10. **Berichts-Archivierung** -- Neue Tabelle, Storage-Upload
11. **Visuelle Analytik PDF** -- SVG-Chart-Funktionen und Integration

---

## Zusammenfassung neue Dateien

| Datei | Zweck |
|---|---|
| `src/hooks/useLocationYearlyConsumption.tsx` | Jahresverbrauch pro Liegenschaft und Energietraeger |
| `src/hooks/useDataCompleteness.tsx` | Datenqualitaet pro Monat pruefen |
| `src/hooks/useEnergyMeasures.tsx` | CRUD fuer energetische Massnahmen |
| `src/hooks/useReportArchive.tsx` | Archivierte Berichte verwalten |
| `src/components/report/ConsumptionTrendTable.tsx` | Mehrjahres-Verbrauchstabelle |
| `src/components/report/ConsumptionTrendChart.tsx` | Balkendiagramm Mehrjahresvergleich |
| `src/components/report/LocationRanking.tsx` | Top-Verbraucher-Ranking |
| `src/components/report/MeasuresTable.tsx` | Massnahmen-Uebersicht |
| `src/components/report/AddMeasureDialog.tsx` | Massnahme anlegen/bearbeiten |
| `src/components/report/DataCompletenessIndicator.tsx` | Monats-Kacheln Datenqualitaet |
| `src/lib/costCalculations.ts` | Kostenberechnung aus Verbrauch + Preise |

## DB-Migrationen

1. Tabelle `energy_measures` (Massnahmen-Tracking)
2. Tabelle `energy_report_archive` (Berichts-Archivierung)
3. Spalte `primary_energy_factor` in `co2_emission_factors`
4. Seed-Daten: Wasser-Benchmarks in `energy_benchmarks`
5. Seed-Daten: Primaerenergiefaktoren in `co2_emission_factors` (UPDATE)

