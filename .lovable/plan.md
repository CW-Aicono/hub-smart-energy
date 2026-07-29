# AICONO Analytics Studio

## Vision
Ein neuer, dedizierter Analyse-Arbeitsbereich unter **Energiedaten → Analyse-Studio** (neuer Sub-Menüpunkt). Nutzer bauen sich ihre Analyse wie auf einem Bento-Board selbst zusammen: Geräte per Drag & Drop auf eine Canvas ziehen, Zeitreihen überlagern, Zeitversätze vergleichen, Korrelationen entdecken und Workspaces speichern/teilen.

Das Tool nutzt die bestehende Dateninfrastruktur (5-Min-Buckets, stündliche/tägliche Aggregationen, virtuelle Zähler, Sensoren) und ergänzt sie um eine freie, kreative Analyseebene — ohne das Dashboard zu ersetzen.

## Konzept: „Analyse-Canvas"
````text
┌─────────────────────────────────────────────────────────────┐
│  AICONO Analytics Studio                    [Speichern] [Teilen]
├──────────────┬──────────────────────────────────────────────┤
│              │                                               │
│  DATEN-      │   ┌─────────────┐   ┌─────────────┐        │
│  BIBLIOTHEK  │   │  Chart #1   │   │  Chart #2   │        │
│              │   │  Leistung   │   │  Korrelation│        │
│  🔍 Suche    │   │  heute vs.  │   │  Temp vs.   │        │
│              │   │  gestern    │   │  Heizung    │        │
│  📍 Standort A│  └─────────────┘   └─────────────┘        │
│    ├─ Zähler 1│  ┌─────────────────────────────────┐     │
│    ├─ Sensor X│  │         Kombinierte Formel        │     │
│    └─ Wallbox │  │   PV - Verbrauch = Eigenverbrauch │     │
│  📍 Standort B│  └─────────────────────────────────┘     │
│    ├─ ...     │  ┌─────────────┐   ┌─────────────┐        │
│              │   │   Heatmap   │   │   KPI-Karte │        │
│              │   │ Wochenprofil│   │  Min/Max/Ø  │        │
│              │   └─────────────┘   └─────────────┘        │
└──────────────┴──────────────────────────────────────────────┘
````

## Kern-Features (MVP)

### 1. Drag-&-Drop-Datenbibliothek
- Linke Seitenleiste mit durchsuchbarem Gerätebaum: **Standorte → Zähler / Sensoren / Aktoren / Wallboxen / virtuelle Zähler**
- Filter nach Energietyp (Strom, Gas, Wärme, Wasser), Geräteklasse und Status
- Gerät auf Canvas ziehen → erzeugt automatisch einen Chart-Block
- Multi-Select per Checkbox für schnelles Hinzufügen mehrerer Serien

### 2. Freie Canvas-Blöcke
Jeder Block ist ein analysierbares Element:
- **Zeitreihen-Chart** (Linien, Balken, Fläche, gestapelt)
- **KPI-Karte** (Min, Max, Ø, Summe, Standardabweichung)
- **Heatmap** (Verbrauch nach Wochentag/Stunde oder Monat/Tag)
- **Korrelations-Scatterplot** (zwei Messgrößen gegeneinander)
- **Vergleichs-Chart** (Zeitversatz: Heute vs. Gestern, diese Woche vs. Vorwoche, Jahr vs. Vorjahr)
- **Formel-Block** (virtuelle Kanäle aus beliebigen Messwerten: +, −, ×, ÷, Durchschnitt)

### 3. Intelligente Achsen & Einheiten
- Automatische Y1/Y2-Achse, wenn unterschiedliche Einheiten gemischt werden (z. B. kW + °C)
- Einheit wird pro Serie aus `meterUnits.ts` abgeleitet
- Deutsche Zahlenformate auf allen Achsen, Tooltips und KPIs

### 4. Zeitsteuerung
- Globaler Zeitraum für den ganzen Canvas (Tag / Woche / Monat / Quartal / Jahr / Frei)
- Schnellauswahl: „Letzte 24h“, „Diese Woche“, „Letztes Jahr“, „Benutzerdefiniert"
- Jeder Block kann optional einen eigenen Zeitraum oder Zeitversatz erhalten

### 5. Annotationen & Events
- Auf Zeitachsen markieren: „Heizung ausgeschaltet", „Neues Gerät in Betrieb", „Strompreis-Alarm"
- Events aus bestehenden `monitoring_alert_events` oder manuell erfasst
- Hilft, Ursachen für Peaks oder Einsparungen visuell zu erklären

### 6. Workspace-Speicherung
- Jeder Canvas wird als `analysis_workspace` gespeichert (Name, Layout, Blöcke, Konfiguration)
- Benutzer können mehrere Workspaces anlegen (z. B. „Wochenbericht", „PV-Optimierung", „Wärmeanalyse")
- Workspaces sind tenant-spezifisch, optional geteilt mit anderen Nutzern

## Innovative „Wow"-Features (Phase 2)

### A. KI-Erklärung per Klick
- Auf einen Peak oder eine Abweichung klicken → „Was ist hier passiert?"
- Lovable AI Gateway analysiert benachbarte Daten (Wetter, Spotpreise, Automationen, Alerts) und liefert eine natürlichsprachliche Erklärung

### B. „Was-wäre-wenn"-Simulation
- Virtuellen Kanal mit Schiebereglern versehen (z. B. „PV-Leistung +20 %")
- Sofortige Neuberechnung von Eigenverbrauch, Einspeisung oder Kosten

### C. Story-Modus
- Workspaces als Präsentation abspielen: Canvas-Blöcke werden nacheinander eingeblendet, mit eigenen Texten/Insights
- Perfekt für Berichte an Geschäftsführung oder Kommunen

### D. Vorlagenmarktplatz
- Vordefinierte Templates: „PV-Eigenverbrauch", „Heizungsanalyse", „Wallbox-Nutzung", „Benchmark Standorte"
- Tenant-Admin kann Templates für alle Nutzer freigeben

## Technische Architektur

### Neue Tabellen
```sql
analysis_workspaces
- id uuid pk
- tenant_id uuid not null
- created_by uuid not null
- name text not null
- description text
- layout jsonb not null          -- Grid-Positionen & Größen der Blöcke
- blocks jsonb not null          -- Konfiguration aller Analyse-Blöcke
- is_shared boolean default false
- created_at, updated_at

analysis_workspace_shares
- workspace_id uuid
- user_id uuid
- can_edit boolean
- pk(workspace_id, user_id)
```

### Wiederverwendung bestehender Infrastruktur
- Datenabruf via bestehenden RPCs: `get_power_readings_5min`, `get_meter_daily_totals_split_with_fallback`, `get_meter_period_sums_with_fallback`
- Sensor-Daten aus `sensor_readings_5min / hourly / daily`
- Einheitenumrechnung aus `src/lib/meterUnits.ts`
- Deutsche Formatierung zentral über `toLocaleString("de-DE")`
- Farbsystem aus `ENERGY_CHART_COLORS` und Custom-Widget-Farbpalette

### Neue Komponenten
```text
src/pages/AnalyticsStudio.tsx              -- Hauptseite
src/components/analytics/
  ├─ AnalyticsSidebar.tsx                  -- Geräte-Bibliothek
  ├─ AnalyticsCanvas.tsx                   -- Grid-Layout mit Drag & Drop
  ├─ AnalysisBlock.tsx                     -- Wrapper für jeden Block
  ├─ blocks/
  │   ├─ TimeSeriesBlock.tsx
  │   ├─ KpiBlock.tsx
  │   ├─ HeatmapBlock.tsx
  │   ├─ CorrelationBlock.tsx
  │   ├─ ComparisonBlock.tsx
  │   └─ FormulaBlock.tsx
  ├─ TimeRangeToolbar.tsx
  ├─ WorkspaceSaver.tsx
  └─ WorkspaceSelector.tsx
src/hooks/
  ├─ useAnalysisWorkspaces.ts
  ├─ useAnalyticsData.ts                   -- universeller Daten-Fetcher
  └─ useDeviceTree.ts                      -- Gerätebaum für Sidebar
```

### Datenabruf-Strategie
- Pro Block ein separater Query, damit große Zeiträume nicht das ganze Canvas blockieren
- `useTransition` für flüssiges Umschalten des Zeitraums
- Stale-Time 60s, `keepPreviousData` für sichtbare Blöcke
- Limit 5.000 Punkte pro Serie; bei Überschreitung automatisch auf nächstgröbere Aggregation wechseln

## UI/UX-Details

### Visuelle Sprache
- Dunkles, raumgreifendes Canvas (nahezu schwarz) als Kontrast zum hellen Dashboard
- Blöcke mit leichtem Glassmorphismus, abgerundeten Ecken, dezenten Schatten
- Farbige Serie-Indikatoren mit Icon + Gerätename
- Hover: Block bekommt einen leuchtenden Rahmen, Ziehgriff erscheint

### Interaktion
- Blöcke verschieben und in der Größe ändern (Grid: 12 Spalten, Höhe frei)
- Doppelklick auf Block öffnet Konfigurations-Drawer
- Serie im Chart anklicken → aus-/einblenden
- Rechtsklick auf Datenpunkt: „Von hier zoomen", „Annotation hinzufügen", „In Dashboard-Widget verwandeln"

## Phasenplan

### Phase 1 — MVP (ca. 2–3 Wochen)
1. Datenmodell & RLS-Policies für `analysis_workspaces`
2. Seite `/analytics-studio` + Sidebar-Menüeintrag
3. Geräte-Bibliothek (Gerätebaum)
4. Canvas-Grid mit Drag & Drop
5. Zeitreihen-Block (Linien/Balken/Fläche)
6. KPI-Block
7. Workspace speichern/laden/umbenennen/löschen
8. Globaler Zeitraum-Selector

### Phase 2 — Erweiterungen (ca. 2 Wochen)
1. Heatmap-Block
2. Korrelations-Scatterplot
3. Zeitversatz-Vergleich
4. Formel-Block
5. Annotationen auf Zeitachse

### Phase 3 — KI & Vertrieb (ca. 2 Wochen)
1. „Was ist hier passiert?"-KI-Erklärung
2. Was-wäre-wenn-Simulation
3. Story-Modus
4. Vorlagenmarktplatz

## Risiken & Abfangmaßnahmen
- **Performance bei vielen Blöcken:** Jeder Block eigener Query + Lazy-Loading außerhalb des Viewports
- **Datenmenge:** Automatische Aggregation je nach Zoom (raw → 5min → hourly → daily)
- **Komplexität für Einsteiger:** Vorlagen + Onboarding-Tour beim ersten Öffnen
- **Mobile Nutzung:** Canvas auf Mobil primierend lesend; Bearbeitung nur Desktop

## Verkaufsargumente
- „Ihr persönliches Energie-Labor"
- „Vergleichen Sie beliebige Messstellen — ohne SQL, ohne Export"
- „Erkennen Sie Muster, die im Standard-Dashboard unsichtbar sind"
- „Speichern und präsentieren Sie Ihre Analysen als Story"

## Nächster Schritt
Ich empfehle, mit Phase 1 zu starten. Soll ich direkt einen technischen Feinplan für Phase 1 erstellen und mit der Implementierung beginnen? Oder möchtest du zuerst eine visuelle Richtung (Design-Directions) für das Analytics Studio sehen?