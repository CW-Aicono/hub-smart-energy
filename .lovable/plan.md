
# Kommunaler Energiebericht -- Implementierungsplan

## Uebersicht

Implementierung eines umfassenden kommunalen Energieberichts mit vier Saeulen: erweiterte Stammdaten, Witterungsbereinigung (existiert bereits teilweise), Benchmarking mit Vergleichswerten und CO2-Emissionsberechnung. Das Ergebnis ist ein PDF-Bericht mit Management Summary, Gesamtportfolio-Analyse und Liegenschaftssteckbriefen.

---

## Phase 1: Stammdaten der Liegenschaften erweitern

### Datenbank-Migration

Neue Spalten in der `locations`-Tabelle:

| Spalte | Typ | Beschreibung |
|---|---|---|
| `construction_year` | integer | Baujahr |
| `renovation_year` | integer | Letztes Sanierungsjahr |
| `net_floor_area` | numeric | Nettogrundfläche (NGF) in m2 |
| `gross_floor_area` | numeric | Bruttogrundfläche (BGF) in m2 |
| `heating_type` | text | Heizungsart (z.B. Gas-Brennwert, Fernwaerme, Waermepumpe) |
| `photo_url` | text | Gebäudefoto-URL |

### Code-Aenderungen

- **`useLocations.tsx`**: Interface `Location` um die neuen Felder erweitern
- **`EditLocationDialog.tsx`**: Formular um Eingabefelder fuer Baujahr, Sanierungsjahr, NGF, BGF, Heizungsart erweitern (in einem Collapsible-Bereich "Gebaeudedaten")
- **`AddLocationDialog.tsx`**: Optionale Felder fuer die Stammdaten ergaenzen
- **`LocationDetail.tsx`**: Neue Karte "Gebaeudedaten" mit Baujahr, Flaeche, Heizungsart anzeigen
- **Gebäudefoto-Upload**: Upload-Funktion in den `tenant-assets`-Bucket, Anzeige im Steckbrief

---

## Phase 2: CO2-Emissionsfaktoren

### Datenbank-Migration

Neue Tabelle `co2_emission_factors`:

```text
+---------------------------+
| co2_emission_factors      |
+---------------------------+
| id (uuid, PK)             |
| tenant_id (uuid, FK)      |
| energy_type (text)        |  -- strom, gas, waerme, fernwaerme
| factor_kg_per_kwh (numeric)| -- kg CO2 pro kWh
| factor_kg_per_m3 (numeric) | -- kg CO2 pro m3 (fuer Gas)
| source (text)              | -- z.B. "BAFA 2024", "Oekostrom"
| valid_from (date)          |
| valid_until (date)         |
| is_default (boolean)       |
| created_at, updated_at     |
+---------------------------+
```

RLS: Tenant-basiert, Admins koennen Faktoren pflegen.

### Standard-Emissionsfaktoren (Seed-Daten)

Vorbefuellte Defaults nach BAFA/GEMIS:

| Energietraeger | kg CO2/kWh | Quelle |
|---|---|---|
| Strom (Bundesmix) | 0.420 | UBA 2023 |
| Erdgas H | 0.201 | GEMIS |
| Fernwaerme | 0.180 | Durchschnitt |
| Heizoel | 0.266 | GEMIS |

### Code-Aenderungen

- **Neuer Hook `useCo2Factors.tsx`**: CRUD fuer Emissionsfaktoren
- **UI-Komponente `Co2FactorSettings.tsx`**: Verwaltung der Faktoren pro Energietraeger (in den Einstellungen oder pro Liegenschaft)
- **Berechnungslogik in `lib/co2Calculations.ts`**: Funktion `calculateCo2(energyKwh, energyType, factors)` --> kg CO2

---

## Phase 3: Benchmarking mit Vergleichswerten

### Datenbank-Migration

Neue Tabelle `energy_benchmarks`:

```text
+---------------------------+
| energy_benchmarks         |
+---------------------------+
| id (uuid, PK)             |
| usage_type (enum)         |  -- verwaltungsgebaeude, schule, etc.
| energy_type (text)        |  -- strom, waerme, wasser
| target_value (numeric)    |  -- Zielwert kWh/m2*a (gruen)
| average_value (numeric)   |  -- Mittelwert kWh/m2*a (gelb)
| high_value (numeric)      |  -- Grenzwert kWh/m2*a (rot)
| unit (text)               |  -- kWh/m2*a oder l/m2*a
| source (text)             |  -- z.B. "ages 2024", "EnEV"
| valid_year (integer)      |
+---------------------------+
```

### Vorbefuellte Vergleichswerte (ages/VDI 3807)

| Gebaeudetyp | Strom (kWh/m2a) Ziel/Mittel/Hoch | Waerme (kWh/m2a) Ziel/Mittel/Hoch |
|---|---|---|
| Verwaltung | 15 / 25 / 40 | 50 / 90 / 140 |
| Schule | 10 / 18 / 30 | 50 / 85 / 130 |
| Kita | 12 / 20 / 35 | 60 / 95 / 150 |
| Sportstaette | 25 / 40 / 65 | 80 / 130 / 200 |
| Universitaet | 20 / 35 / 55 | 55 / 100 / 160 |

### Code-Aenderungen

- **Hook `useBenchmarks.tsx`**: Laedt Vergleichswerte passend zum `usage_type` der Liegenschaft
- **Komponente `BenchmarkIndicator.tsx`**: Ampel-Darstellung (gruen/gelb/rot) mit Balken, der den aktuellen Kennwert im Verhaeltnis zu Ziel/Mittel/Hoch zeigt
- **Integration in LocationDetail**: Neue Karte "Energiekennwerte" mit Ampel-Bewertung fuer Strom und Waerme
- **Berechnung**: `spezifischerKennwert = Jahresverbrauch_kWh / NGF_m2`

---

## Phase 4: Energiebericht-Generator

### Neue Seite `/energy-report`

Erreichbar ueber die Sidebar (Modul "energy_report"). Bericht-Konfiguration:

1. **Berichtsjahr** auswaehlen
2. **Liegenschaften** auswaehlen (alle oder Auswahl)
3. **Energietraeger** auswaehlen
4. **Bericht generieren** (PDF, oeffnet im neuen Tab)

### PDF-Berichtsstruktur

Der Bericht wird client-seitig als HTML generiert (wie bestehende `downloadPDF`-Funktion in `exportUtils.ts`) und per `window.print()` als PDF gespeichert.

**Gliederung:**

```text
1. Deckblatt
   - Titel, Berichtsjahr, Mandantenlogo, Erstellungsdatum

2. Management Summary (1 Seite)
   - Gesamtverbrauch Strom/Waerme/Wasser mit Vorjahresvergleich
   - Gesamte CO2-Emissionen mit Trend
   - Gesamtkosten (sofern Energiepreise hinterlegt)
   - Top-3 Verbraucher

3. Portfolio-Uebersicht
   - Balkendiagramm: Verbrauch pro Liegenschaft
   - Karte aller Liegenschaften (optional, als Screenshot)
   - Tabellarische Uebersicht: Name, Typ, NGF, Strom, Waerme, CO2

4. Witterungsbereinigung
   - Erklaerung der Methode
   - Tabelle: Monat, Ist-HGT, Referenz-HGT, Ist-Verbrauch, bereinigter Verbrauch
   - Gesamtbilanz: Ist vs. bereinigt

5. Liegenschaftssteckbriefe (je 1 Seite pro Gebaeude)
   - Gebaeudedaten: Name, Adresse, Baujahr, NGF, Heizungsart, Foto
   - Verbrauchstabelle: Strom/Waerme/Wasser der letzten 3 Jahre
   - Kennwerte: kWh/m2*a mit Ampel-Bewertung
   - CO2-Emissionen mit Trend-Pfeil
   - Witterungsbereinigter Waermeverbrauch (Chart)
   - Kostenentwicklung (wenn Preise hinterlegt)

6. Anhang
   - Verwendete CO2-Faktoren
   - Quellenangaben (ages, BAFA, UBA)
```

### Code-Aenderungen

- **Neue Datei `src/lib/energyReportBuilder.ts`**: Kernlogik zur Datensammlung und HTML-Generierung
- **Neue Seite `src/pages/EnergyReport.tsx`**: Konfigurationsseite mit Vorschau
- **Neue Komponente `src/components/report/EnergyReportPreview.tsx`**: Live-Vorschau des Berichts
- **Neue Komponente `src/components/report/PropertyProfile.tsx`**: Einzelner Liegenschaftssteckbrief
- **Route in `App.tsx`**: `/energy-report` hinzufuegen
- **Sidebar-Eintrag in `DashboardSidebar.tsx`**: Neuer Menuepunkt "Energiebericht"
- **Uebersetzungen in `translations.ts`**: Alle Labels fuer den Bericht (DE/EN/ES/NL)

---

## Technische Details

### Datenfluss fuer den Bericht

```text
Jahresverbrauch (meter_period_totals, period_type='month')
  + NGF (locations.net_floor_area)
  --> Kennwert (kWh/m2*a)
  + Benchmarks (energy_benchmarks, nach usage_type)
  --> Ampelbewertung

Waermeverbrauch
  + Gradtagszahlen (weather_degree_days via Edge Function)
  --> Witterungsbereinigter Verbrauch

Verbrauch * CO2-Faktor (co2_emission_factors)
  --> CO2-Emissionen in kg/t
```

### Bestehende Infrastruktur die genutzt wird

- `useWeatherNormalization` -- bereits implementiert, wird direkt wiederverwendet
- `useEnergyPrices` -- fuer Kostenberechnung im Bericht
- `meter_period_totals` -- Monats-/Jahresaggregate
- `exportUtils.ts` -- PDF-Generierungsmuster (HTML + print)
- `weather-degree-days` Edge Function -- fuer Gradtagszahlen
- `formatEnergy` / `formatEnergyByType` -- Einheitenformatierung

### Reihenfolge der Implementierung

1. DB-Migration: Locations-Stammdaten erweitern
2. UI: Stammdaten-Formulare und Anzeige
3. DB-Migration: `co2_emission_factors` + Seed-Daten
4. Hook + UI: CO2-Faktor-Verwaltung
5. DB-Migration: `energy_benchmarks` + Seed-Daten
6. Hook + UI: Benchmarking-Komponente mit Ampel
7. Energiebericht-Seite mit PDF-Generator
8. Uebersetzungen ergaenzen

