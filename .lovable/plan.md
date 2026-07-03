## Plan: Einstellbare Widget-Höhe per Drag-Resize

### Was der User bekommt
- Jedes Dashboard-Widget zeigt am unteren Rand einen **Resize-Griff** (dünner Bar, sichtbar bei Hover). Ziehen mit der Maus verändert die Höhe in Echtzeit.
- Die eingestellte Höhe wird pro Widget in `dashboard_widgets.config.layout.height` gespeichert (Feld existiert bereits als `WidgetLayout`, wird bislang nicht benutzt).
- Minimalhöhe 200 px, Maximalhöhe 1200 px. Bei Doppelklick auf den Griff: zurück zur Widget-Standardhöhe.
- Der bestehende **Dashboard-Customizer**-Reset ("Layout zurücksetzen") setzt zusätzlich alle Höhen zurück.

### Umfang der Widgets
Einheitlich für **alle** Dashboard-Widgets aus `WIDGET_COMPONENTS` inkl. Custom-Widgets. Grundriss (`floor_plan_explorer`) verhält sich identisch — profitiert am stärksten, weil PDFs/SVGs unterschiedliche Seitenverhältnisse haben.

### Technische Umsetzung

**1. Speicherung** (`src/hooks/useDashboardWidgets.tsx`)
- `WidgetLayout` um `height?: number` (Pixel) erweitern (Feld existiert vermutlich schon als leerer Typ — verifizieren).
- Neue Convenience-Funktion `updateWidgetHeight(widgetType, height)`, die intern `updateWidgetLayout` mit `{ ...layout, height }` aufruft.
- Debounced Persist (300 ms) während des Drags, damit nicht bei jedem Mousemove ein DB-Update geht.

**2. Resize-Wrapper** (neue Komponente `src/components/dashboard/ResizableWidget.tsx`)
- Wrapper mit `style={{ height: heightPx }}` oder `minHeight` als Fallback.
- Griff (`div` absolut unten, `h-2 w-full cursor-ns-resize`, sichtbar via `opacity-0 group-hover:opacity-100`).
- Pointer-Events: `onPointerDown` → `setPointerCapture`, `onPointerMove` berechnet neue Höhe (`startHeight + (clientY − startY)`), clamped auf `[200, 1200]`.
- `onPointerUp` → Persistierung via Callback + `releasePointerCapture`.
- Doppelklick → `onResetHeight()` (setzt `height` auf `undefined`, Widget nutzt Default).

**3. Einbindung** (`src/pages/DashboardContent.tsx`, `src/pages/Demo.tsx`)
- Die beiden bestehenden `<div className="w-full min-w-0 relative group">`-Wrapper (Custom- & Standard-Widget) durch `<ResizableWidget>` ersetzen, das `height={widget.layout?.height}` und `onHeightChange={(h) => updateWidgetLayout(widget.widget_type, { ...widget.layout, height: h })}` bekommt.
- Der bestehende Zoom-Button und Expand-Dialog bleiben unverändert.

**4. Charts füllen die neue Höhe** (nur wo nötig)
- Widgets, die aktuell `ResponsiveContainer height={300}` hart setzen (`EnergyChart`, `PieChartWidget`, `SankeyWidget`, `ForecastWidget`, `SpotPriceWidget`, `PvForecastWidget`, `WeatherNormalizationWidget`), bekommen `height="100%"` und das umschließende `CardContent` erhält `h-full`.
- `FloorPlanDashboardWidget`: der PDF-/Iframe-Container skaliert auf `100%` der verfügbaren Höhe.
- Widgets ohne feste Höhe (KPIs, AlertsList, etc.) bleiben unverändert — die Karte wächst automatisch mit.

**5. Reset im Customizer**
- Vorhandenes „Layout zurücksetzen" erweitern: iteriert `updateWidgetLayout(w.widget_type, { ...w.layout, height: undefined })`.

### Nicht enthalten
- Kein Breiten-Resize (Widget-Breite bleibt über bestehende `WidgetSize` "full/2/3/1/2/1/3" steuerbar).
- Kein Ratio-Preset-Dropdown — nur der direkte Drag-Griff.
- Keine Migration nötig, `config` ist bereits `jsonb`.

### Preview-Frage
Die interne Preview zeigt `/auth` — die Session in der Sandbox ist abgelaufen. Bitte in der Preview neu einloggen; die externe Preview funktioniert deshalb, weil dort noch eine gültige Session im Browser liegt. Kein Codefix nötig.
