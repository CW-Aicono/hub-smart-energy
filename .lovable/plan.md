## Ziel
Der Button "Zum Zähler in der Übersicht" im EnergyFlowMonitor-Popover soll nicht mehr auf `/meters?meter=…` navigieren. Stattdessen: aktuelles Popover schließen und einen großen Detail-Dialog mit ausführlichen Graphen zum ausgewählten Messpunkt öffnen.

## Umsetzung

**Datei:** `src/components/dashboard/EnergyFlowMonitor.tsx`

1. **Button-Verhalten ändern**
   - Statt `<Link to={/meters?meter=…}>` → `onClick`-Handler.
   - Handler setzt lokalen State `detailNode = node`, ruft `onClose()` auf.
   - Icon `ExternalLink` → `Maximize2` (bleibt konsistent).

2. **Neuer Dialog `MeterDetailDialog`** (im selben File)
   - shadcn `Dialog` (`max-w-5xl`, `max-h-[90vh]`, scrollbar).
   - Header: Icon + Rolle + Meter-Name + SOC-Badge (falls Batterie).
   - KPI-Zeile (4 Kacheln): Aktuell (W), Heute (kWh), 24 h Min/Max, 24 h Mittel.
   - Zeitraum-Umschalter: 1 h · 24 h · 7 d · 30 d (Buttongruppe).
     - Query lädt `meter_power_readings` entsprechend, mit passenden Aggregations-Limits.
   - **Chart 1 – Leistungsverlauf** (`AreaChart`, volle Breite, ~300 px):
     - X-Achse: Zeit, Labels lokalisiert de-DE (HH:mm bzw. dd.MM), Achsentitel „Zeit".
     - Y-Achse: Leistung in kW, Achsentitel „Leistung (kW)", `toLocaleString('de-DE')`.
     - Grid, Tooltip mit Zeit + Leistung, Referenzlinie bei 0 wenn bidirektional (negative Werte).
     - Farbe = `node.color`.
   - **Chart 2 – Energie kumuliert** (`BarChart` bei ≥24 h Fenster, sonst LineChart):
     - Integriert Leistung → Energie pro Bucket (Stunde/Tag), zeigt Verbrauch bzw. Einspeisung.
     - Bei bidirektionalen Zählern: zwei Serien (Bezug/Einspeisung, Split-Bars).
   - **SOC-Chart** (nur Rolle `battery`, falls SOC-Historie vorhanden):
     - `LineChart` mit Ladezustand 0-100 %, Y-Achse fix `[0, 100]`, Label „SOC (%)".
     - Datenquelle: `energy_storages.current_soc_pct` snapshots (falls verfügbar) — ansonsten nur der aktuelle Wert als horizontale Referenzlinie im Leistungschart.
   - **Details-Panel** unten: Meter-ID, Rolle, letzte Aktualisierung, Sensor-UUID (mono), Farbe/Legende.
   - Alle Zahlen `toLocaleString('de-DE')`, Einheiten explizit.
   - Kein Navigations-Button; der Dialog wird über `onOpenChange` geschlossen.

3. **State/Wiring im Root-`EnergyFlowMonitor`**
   - Neuer State `const [detailNode, setDetailNode] = useState<FlowNode | null>(null)`.
   - `NodePopover` bekommt Prop `onOpenDetail: (node) => void`; ruft im Button den Handler auf statt `<Link>`.
   - Dialog wird gerendert, wenn `detailNode` gesetzt ist.

4. **Keine Änderungen an**
   - Backend, Migrations, anderen Widgets/Seiten.
   - Bestehendem Popover-Content oder Layout.

## Technisches
- Wiederverwendet vorhandene `recharts`-Importe (`AreaChart`, `BarChart`, `LineChart`, `CartesianGrid`, `ReferenceLine`, `Legend`, `Label`).
- `useQuery`-Key umfasst Zeitraum, damit Umschalter re-fetcht.
- Bidirektionalitäts-Erkennung: `data.some(d => d.v < 0)`.
- SOC-Historie kommt aus `bridge_raw_samples`/`energy_storages` — im ersten Schritt nur Ist-SOC (bestehend), Historie später falls verfügbar; wenn keine Reihe → SOC-Chart einfach weglassen.
