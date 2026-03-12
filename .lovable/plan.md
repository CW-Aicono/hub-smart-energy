

# EMS-Copilot – Investitions-Copilot Umsetzungsplan

## Überblick

Der EMS-Copilot wird eine neue Hauptseite im System, die als KI-gestützter Investitionsberater fungiert. Er kombiniert bestehende Betriebsdaten (Lastprofile, PV-Erzeugung, Speicher, Spot-Preise) mit Markt- und Förderdaten, um konkrete Investitionsempfehlungen mit ROI-Berechnung zu liefern.

---

## Architektur

```text
┌─────────────────────────────────────────────────┐
│  Frontend: /copilot                              │
│  ┌───────────────┬──────────────────────────┐   │
│  │ Standort-     │  Analyse-Ergebnis        │   │
│  │ Auswahl &     │  ├─ Empfehlungen         │   │
│  │ Parameter     │  ├─ ROI-Szenarien        │   │
│  │ (Sidebar)     │  ├─ Förder-Matching      │   │
│  │               │  └─ Projektpipeline      │   │
│  └───────────────┴──────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ supabase.functions.invoke
                       ▼
         ┌─────────────────────────┐
         │ Edge Function:          │
         │ copilot-analysis        │
         │ ├─ Aggregiert Daten     │
         │ ├─ Förderdatenbank-     │
         │ │  Lookup               │
         │ ├─ Lovable AI           │
         │ │  (Gemini 2.5 Pro)     │
         │ └─ Strukturierte        │
         │    Ergebnisse via       │
         │    Tool-Calling         │
         └─────────────────────────┘
```

---

## Datenbank-Änderungen

### Neue Tabelle: `copilot_analyses`

Speichert durchgeführte Analysen pro Standort für Historisierung und Vergleich.

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | UUID PK | |
| tenant_id | UUID FK | |
| location_id | UUID FK | |
| analysis_type | TEXT | `single_location`, `portfolio` |
| input_params | JSONB | Dachfläche, Netzanschluss, etc. |
| recommendations | JSONB | KI-Ergebnis (Technologien, Dimensionierung) |
| funding_matches | JSONB | Passende Förderprogramme |
| roi_scenarios | JSONB | Szenarien-Array |
| total_investment | NUMERIC | |
| total_funding | NUMERIC | |
| best_roi_years | NUMERIC | |
| status | TEXT | `draft` / `confirmed` |
| created_at | TIMESTAMPTZ | |

### Neue Tabelle: `funding_programs`

Statische/editable Förderdatenbank.

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | UUID PK | |
| name | TEXT | z.B. "progres.nrw" |
| level | TEXT | `bund`, `land`, `kommune` |
| state | TEXT | Bundesland (nullable für Bund) |
| municipality | TEXT | Kommune (nullable) |
| technology | TEXT[] | `{pv, battery, heat_pump, ...}` |
| funding_type | TEXT | `zuschuss`, `kredit`, `verguetung` |
| amount_description | TEXT | z.B. "200 €/kWh Speicher" |
| max_amount | NUMERIC | |
| min_capacity | NUMERIC | |
| valid_from | DATE | |
| valid_until | DATE | |
| url | TEXT | Link zum Programm |
| is_active | BOOLEAN | |
| notes | TEXT | |

### Neue Tabelle: `copilot_projects`

Projektpipeline für Investitionsplanung.

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | UUID PK | |
| tenant_id | UUID FK | |
| analysis_id | UUID FK | Verknüpfung zur Analyse |
| location_id | UUID FK | |
| title | TEXT | |
| technology | TEXT | pv, battery, heat_pump, etc. |
| priority | INTEGER | 1-basiert |
| estimated_investment | NUMERIC | |
| estimated_funding | NUMERIC | |
| estimated_roi_years | NUMERIC | |
| estimated_savings_year | NUMERIC | |
| status | TEXT | `planned`, `approved`, `in_progress`, `completed` |
| target_year | INTEGER | |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |

---

## Edge Function: `copilot-analysis`

- JWT-authentifiziert, Tenant-isoliert
- Aggregiert bestehende Daten aus dem System:
  - Lastprofil via `meter_power_readings_5min` (typische Tages-/Wochenkurve)
  - PV-Bestandsdaten via `pv_forecast_settings`
  - Speicher via `energy_storages`
  - Spot-Preise via `spot_prices`
  - Standortdaten (Adresse, Bundesland, Fläche) via `locations`
  - Energiepreise via `energy_prices`
- Ermittelt passende Förderprogramme via `funding_programs`
- Sendet aggregierten Kontext an **Lovable AI** (Gemini 2.5 Pro) mit Tool-Calling für strukturierte Ausgabe:
  - `suggest_investments`: Technologie, Dimensionierung, geschätzte Kosten
  - `calculate_roi`: Szenarien mit/ohne Förderung, Amortisation
  - `match_funding`: Zuordnung Förderprogramme
- Speichert Ergebnis in `copilot_analyses`

---

## Frontend-Komponenten

### 1. Neue Seite: `/copilot` (EMS-Copilot)

Sidebar-Eintrag mit Sparkles-Icon zwischen "Arbitrage Trading" und "Mieterstrom".

### 2. Seitenstruktur

**Linke Spalte: Eingabeparameter**
- Standort-Auswahl (Dropdown oder Multi-Select für Portfolio)
- Zusätzliche Parameter (optional, erweiterbar):
  - Verfügbare Dachfläche (m²)
  - Netzanschlussleistung (kVA)
  - Budget-Obergrenze (€)
  - Bundesland (auto aus Standort)
- Button "Analyse starten" → ruft Edge Function

**Rechte Spalte: Ergebnisse**
- **Empfehlungs-Cards**: Technologie + Dimensionierung + Konfidenz-Badge
- **ROI-Szenarien-Tabelle**: Vergleich verschiedener Kombinationen (wie im Beispiel)
- **Förder-Matching**: Auflistung Bund/Land/Kommune mit Beträgen
- **Gesamtübersicht**: Investment, Förderung, Einsparung/Jahr, ROI
- **Projektpipeline**: Empfohlene Projekte als sortierbare Liste mit Status-Tracking

### 3. Portfolio-Modus (Kommunen/Multi-Standort)

- Mehrere Standorte gleichzeitig analysieren
- Aggregierte Darstellung: Gesamt-PV-Potenzial, Gesamt-CO₂-Einsparung
- Priorisierte Projektliste über alle Standorte

### 4. Analyse-Historie

- Vergangene Analysen einsehen und vergleichen
- Export als PDF (spätere Erweiterung)

---

## Hook: `useCopilotAnalysis`

- Triggert Edge Function mit Standort-ID + Parametern
- Speichert/Lädt Analysen aus `copilot_analyses`
- Verwaltet Loading/Error-State

## Hook: `useFundingPrograms`

- CRUD für Förderdatenbank (Admin-only Pflege)
- Filter nach Bundesland, Technologie, Gültigkeit

## Hook: `useCopilotProjects`

- CRUD auf `copilot_projects`
- Statusverwaltung der Projektpipeline

---

## Umsetzungsreihenfolge

| # | Aufgabe | Größe |
|---|---------|-------|
| 1 | DB-Migration: 3 Tabellen + RLS | klein |
| 2 | Edge Function `copilot-analysis` (Datenaggregation + AI) | groß |
| 3 | Hook `useCopilotAnalysis` | mittel |
| 4 | Copilot-Seite: Eingabe + Empfehlungs-UI | groß |
| 5 | ROI-Szenarien-Visualisierung (Tabelle + Chart) | mittel |
| 6 | Förder-Matching UI + `useFundingPrograms` | mittel |
| 7 | Projektpipeline + `useCopilotProjects` | mittel |
| 8 | Portfolio-Modus (Multi-Standort) | mittel |
| 9 | Sidebar-Eintrag + i18n | klein |
| 10 | Förderdatenbank-Verwaltung (Admin) | mittel |

---

## Hinweise

- **Förderdatenbank**: Initial mit den wichtigsten Bundesprogrammen (KfW, BAFA, EEG) befüllt. Landesprogramme als editierbare Tabelle, die Admins pflegen können. Automatische Aktualisierung wäre ein späteres Feature.
- **Automatischer Förderantrag** (Punkt 10 der Vision): Als spätere Erweiterung geplant – erfordert template-basierte Dokumentgenerierung.
- **Netzanschluss-Optimierung**: Wird in der ersten Version als Parameter berücksichtigt; aktives Peak-Shaving-Modelling als Folge-Feature.
- **KI-Disclaimer**: Alle Empfehlungen werden mit `<AiDisclaimer />` versehen, da wirtschaftliche Entscheidungen betroffen sind.

