
## Ziel
Der Custom-Widget-Typ „Energieflussmonitor" (`src/components/dashboard/EnergyFlowMonitor.tsx`) soll deutlich reicher, interaktiver und lesbarer werden — inspiriert von modernen Home-Energy-Dashboards (Tesla Powerwall App, Sense, Home Assistant Energy Distribution Card, Enphase Enlighten, SolarEdge mySolarEdge).

## Recherche / Referenzen (Best Practices)
- **Tesla / Sense**: zentrale Icons in Kreisen, farbige animierte Partikel entlang der Verbindungen, Richtung + Geschwindigkeit spiegeln Fluss wider.
- **Home Assistant Energy Distribution**: Klick auf Knoten öffnet Detail-Popover mit Tages-/Monats-KPIs und Mini-Chart.
- **Enphase/SolarEdge**: farbige Rand-Ringe visualisieren Auslastung (0–100 %), inaktive Knoten dezent ausgegraut, klare Legende.
- **Common Pattern**: Partikeldichte + Farbe = Leistung; „glow"-Effekt bei aktivem Fluss; kompakte Zahlen mit Einheitswechsel (W → kW → MW).

## Erweiterungen im Widget

### 1. Zentrale Icons in Kreisen (Fix)
- Icon exakt in Kreismitte (`foreignObject` mittig, ohne Y-Shift), Live-Wert **unter** dem Kreis (zusammen mit Label & Periodensumme in einer sauberen Text-Stack) — nicht mehr im Kreis überlappend.
- Icon-Größe skaliert mit `nodeRadius` (statt fixe `h-6 w-6`).
- Aktive Knoten: gefüllter Farbverlauf-Hintergrund (12 % Opacity), Rand-Ring mit Farbe. Inaktive: dezent grau.

### 2. Klick auf Kreis → Detail-Overlay
- Klick auf einen Knoten öffnet ein Popover (Radix `Popover` oder Inline-Panel, z. B. `Sheet`) mit:
  - Rollen-Titel + Icon + `label`
  - **Aktuelle Leistung** (live, farbcodiert, Vorzeichen)
  - **Tages-/Perioden-Summe** (aus `periodSums`)
  - **Anteil am Fluss** (z. B. „PV deckt 72 % des Hausverbrauchs")
  - **Mini-Chart** der letzten 24 h (kleine Sparkline über `meter_power_readings`, `recharts` `Area`)
  - Link „Zum Zähler-Detail" → `/meters/:id`
- ESC/Klick außerhalb schließt Overlay; nur ein Knoten gleichzeitig geöffnet (`selectedNodeId`).

### 3. Animierte Energieflüsse (Verbesserung)
- Partikel-Dichte skaliert mit Leistung (3 → bis 8 Punkte), Größe wächst leicht mit W.
- Zusätzlich **animierter Gradient-Stroke** (`stroke-dasharray` + `dashoffset`-Animation) für weichen „Fluss-Look" statt nur Punkte.
- Farbe = Quellknoten-Farbe; bei Rückfluss (negativer Wert) automatisch Richtung umkehren + Ziel-Farbe verwenden.
- Bei `flowWatts === 0` oder `null`: nur dünne, gepunktete Linie, keine Animation, `opacity 0.15`.
- Kleine **Fluss-Label** mittig auf der Linie („2,4 kW"), on-hover einblenden.

### 4. Weitere UX-/Feature-Verbesserungen
- **Auto-Layout-Hilfe**: wenn Knoten sich überlappen, kleine Warnung im Designer (kein Layout-Change am Widget selbst).
- **Legende / Aktiv-Ampel**: kleine Ecken-Badge oben rechts „● Live" (grün, pulsierend, wenn Realtime-Werte reinkommen; grau, wenn nur Periodendaten).
- **Selbstverbrauch-KPI-Zeile** unten (nur bei Vorhandensein von `pv`, `grid`, `house`-Rollen): berechnet „Autarkie %" und „Eigenverbrauch %" live aus den Watt-Werten.
- **Deutsche Zahlen** durchgängig via `toLocaleString("de-DE")` (statt `toFixed`) — Kern-Regel des Projekts.
- **Barrierefreiheit**: Knoten sind `<button>`-artig (tabbable, `aria-label` mit Rolle+Wert), Fokus-Ring in Node-Farbe.
- **Reduced Motion**: `@media (prefers-reduced-motion)` → Partikel deaktivieren, statt dessen nur Farbintensität der Linie.

### 5. Vorschau im Designer
- Gleiche Komponente wird in `src/components/settings/WidgetPreview.tsx` verwendet → alle Verbesserungen wirken automatisch auch in der „Vorschau"-Tab (Screenshot 2).

## Technische Umsetzung (kompakt)

```text
EnergyFlowMonitor.tsx
├── State: selectedNodeId
├── Layout-Helfer: getClippedLine (bleibt), plus getMidpoint für Fluss-Label
├── Rendering
│   ├── <defs> Gradient pro Verbindung (Quelle→Ziel-Farbe)
│   ├── Connections
│   │   ├── base line (gepunktet wenn kein Fluss)
│   │   ├── gradient stroke (dashoffset-Animation, prefers-reduced-motion aware)
│   │   ├── particles (Anzahl abhängig von Watt)
│   │   └── flow label (hover)
│   ├── Nodes (als <g> mit onClick → setSelectedNodeId, aria-role="button")
│   │   ├── circle (fill mit Farbverlauf, stroke=Farbe, dimmed wenn inaktiv)
│   │   ├── icon zentriert
│   │   └── label + live-Wert + Periodensumme unter dem Kreis
│   └── KPI-Footer (Autarkie/Eigenverbrauch, wenn PV+grid+house vorhanden)
└── <NodeDetailPopover /> — Radix Popover, positioniert am Knoten
    └── Sparkline: neuer kleiner useQuery auf meter_power_readings (letzte 24h, LTTB-Downsampling optional)
```

- Keine DB-/RLS-Änderungen; Sparkline nutzt bestehende `meter_power_readings`-Tabelle (bereits über `useRealtimePower`/`BoardEnergyBand` erprobt).
- Keine Änderungen an `useCustomWidgetDefinitions` (Datenmodell bleibt gleich).
- Keine neuen Dependencies (Recharts, Radix Popover bereits im Projekt).

## Nicht enthalten
- Änderungen am Designer-Editor (Knoten-Anordnung/Topologie) — nur Optik/Verhalten des gerenderten Widgets.
- Neue Rollen-Typen (bleiben pv/grid/house/battery/wallbox/heatpump/consumer).
- Keine Backend-/Edge-Function-Änderungen.
