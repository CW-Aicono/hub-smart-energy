## Beobachtete Probleme in den Screenshots

1. **SOC-Linie farblich nicht unterscheidbar** – SOC-Kurve nutzt fast dieselbe gelb-grüne Farbe wie die Leistungs-Fläche, dadurch optisch kaum trennbar (Screenshot 1, rechts).
2. **Fehlerhafter SOC-Wert 0 % im Tooltip bei 21:39** – vor dem eigentlichen SOC-Verlauf (~75 %) erscheint ein Nullpunkt. Ursache: Beim Merge werden Zeitstempel aus dem Leistungs-Chart ohne SOC-Wert mit `null` befüllt, aber der allererste SOC-Punkt wird über `connectNulls`/Interpolation an 0 gezogen bzw. der Rohdatensatz enthält einen initialen 0-Wert aus dem Bridge-Sample (Rohwert = 0 als „unbekannt"/Reset), der ungefiltert übernommen wird.
3. **Tooltip zeigt nur SOC, keine Leistung** – bei Hover in einem Bereich ohne Leistungspunkt wird nur SOC gerendert; die Leistungs-Serie fehlt im Tooltip komplett.
4. **Legenden-/Achsen-Label-Kollision** – „Zeit"-Label der X-Achse überlappt sowohl im Leistungs- als auch im Energie-Chart mit der Legende (`Leistung (kW) / Ladezustand (SOC %)` bzw. `Bezug / Einspeisung`).
5. **Energie-Chart mit Lücken** – zwischen 07:00 und 12:00 werden keine Balken angezeigt, obwohl SOC/Leistung Daten liefern. Ursache: Bucketing bricht bei fehlenden Leistungswerten ab, statt leere Stunden als 0 kWh darzustellen bzw. den letzten vorhandenen Bucket sauber abzuschließen.

## Fix-Plan

**Datei:** `src/components/dashboard/EnergyFlowMonitor.tsx` (nur `MeterDetailDialog` + zugehörige Query-Merger)

### 1. SOC-Serie visuell klar trennen
- SOC-Linie fest auf **`hsl(217 91% 60%)`** (Blau, konträr zur Node-Farbe) mit `strokeWidth={2.5}`, `dot={false}`, `activeDot`.
- Legenden-Label bleibt „Ladezustand (SOC %)".

### 2. SOC-Daten säubern
- In der SOC-History-Query: Werte `<= 0` oder `> 100` als ungültig verwerfen (aktuell nur geclamped).
- Beim Merge: `soc` bleibt `null` für Zeitstempel ohne echten SOC-Messwert.
- Auf der `<Line>` **kein** `connectNulls` (damit keine Null-Verbindungslinie an 0 %).
- Zusätzlich: erste/letzte gültige SOC-Werte definieren die sichtbare Range; Null-Buckets werden übersprungen.

### 3. Tooltip-Robustheit
- Custom `RTooltip content`-Renderer, der beide Serien immer anzeigt (falls Wert vorhanden), mit deutscher Formatierung:
  - `Leistung: 1,23 kW` (nur wenn `power != null`)
  - `SOC: 78 %` (nur wenn `soc != null`)
- Damit funktioniert der Tooltip in gemischten Bereichen korrekt.

### 4. Layout: Legende ↔ Achsentitel
- `Legend` mit `verticalAlign="top"` (statt unten), `wrapperStyle={{ paddingBottom: 8 }}`.
- X-Achsen-Label „Zeit" bleibt unten, dadurch keine Kollision mehr.
- Gleiche Umstellung für den Energie-Chart.

### 5. Energie-Chart lückenlos
- Bucket-Erzeugung: über gesamten Zeitraum vorab alle Stunden-Buckets (bzw. Tages-Buckets bei 7d/30d) mit `bezug=0, einspeisung=0` initialisieren, danach Leistungspunkte per Trapezregel darauf integrieren.
- Damit sind auch Stunden ohne Messwert sichtbar (0-Balken/Grid-Slot) und der Chart wirkt vollständig.

### 6. Kleinkorrekturen
- KPI „Ø Leistung" Vorzeichen behalten (bidirektional gewollt), aber Tooltip-Label ergänzen: `Ø Leistung (netto)`.
- Y-Achse SOC: `ticks={[0,25,50,75,100]}`, `domain={[0,100]}` explizit.

## Nicht betroffen
- Keine Backend-/Migrations-Änderungen.
- Andere Widgets, Popover, Routen bleiben unverändert.
