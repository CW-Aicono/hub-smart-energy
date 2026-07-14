## Ziel
Der Energieflussmonitor-Designer erzwingt künftig, dass **zuerst genau eine Liegenschaft** und **mindestens ein Gateway dieser Liegenschaft** ausgewählt werden, bevor Knoten hinzugefügt oder Zähler zugeordnet werden können. Zählerauswahl wird auf die ausgewählten Gateways beschränkt.

## Umsetzung in `src/components/settings/EnergyFlowDesigner.tsx`

### 1) Pflicht-Auswahl oben im Designer
Neuer, kompakter Konfigurationsblock ganz oben (vor Layout-Canvas):

- **Liegenschaft** (Single-Select, Pflicht) — aus `useLocations()`. Nur eine Auswahl möglich. Kein „Alle Liegenschaften".
- **Gateways** (Multi-Select, Pflicht, mindestens 1) — geladen via neue Query auf `gateway_devices` gefiltert nach `location_id` der gewählten Liegenschaft (analog zur Fallback-Auflösung im Monitor). Anzeige mit Statusfarbe & Gerätename.
  - Wenn keine Gateways in der Liegenschaft existieren: Hinweis „Für diese Liegenschaft ist noch kein Gateway eingerichtet" + Deep-Link zur Integrations-Seite.

### 2) Speicherung der Auswahl
Erweiterung des Widget-Configs (Typ `EnergyFlowNode[]`/`EnergyFlowConnection[]` bleibt), zusätzlicher Config-Bereich:
- `location_id: string`
- `gateway_device_ids: string[]`

Wird in `useCustomWidgetDefinitions` als Teil der Widget-Config persistiert. `onChange` bekommt die neuen Felder mit (Signatur um dritten Parameter oder ein Config-Objekt erweitern — konsistent zum aktuellen Aufrufer in `WidgetDesigner.tsx`; existierender Aufrufer wird mitgezogen).

### 3) Zählerauswahl auf gewählte Gateways einschränken
- Beim Filtern der Zähler zusätzlich prüfen: Zähler ist relevant, wenn `meter.location_id === location_id` **und** entweder
  - `meter.gateway_device_id ∈ gateway_device_ids`, **oder**
  - Zähler hängt indirekt über `location_integration_id` an einer Integration, die zu einem der gewählten Gateways gehört (via `location_integrations` derselben Location — nur relevant für Loxone-Sub-Outputs / manuelle Zähler dieser Liegenschaft).
- Der bestehende Liegenschafts-Filter im „Zähler-Filter"-Block entfällt (redundant, Location ist bereits fixiert). Kategorie- und Energieart-Filter bleiben erhalten.

### 4) UI-Gating
Solange keine Liegenschaft und kein Gateway gewählt ist:
- „Knoten hinzufügen"-Button ist deaktiviert (Tooltip: „Erst Liegenschaft und mindestens ein Gateway auswählen").
- Canvas zeigt eine leere-Zustands-Meldung statt Kreis.
- Die Knotenliste + Zählerauswahl werden ausgeblendet.

Wenn die Liegenschaft nachträglich gewechselt wird:
- Bestehende Knoten werden nicht automatisch gelöscht, aber Meter-IDs, die nicht mehr zur neuen Liegenschaft/Gateway-Auswahl passen, werden auf `""` zurückgesetzt (mit Hinweis-Toast).
- Beim Entfernen aller Gateways gilt dieselbe Regel.

### 5) Übernahme im Monitor
`EnergyFlowMonitor.tsx` bleibt funktional gleich. Er kann die neue `location_id` / `gateway_device_ids` aus der Config nutzen, um die Gateway-Detail-Query gezielt zu machen (statt Fallback über Meter). Das behebt zugleich den grauen Status-Fall aus dem Screenshot (falls kein Meter eine `gateway_device_id` hat, greifen jetzt die explizit ausgewählten Gateway-IDs).

## Nicht Teil der Änderung
- Kein Umbau von Backend-Tabellen, keine Migration.
- Keine Änderungen an Partikel-Animation, Layout-Persistenz, anderen Widgets.
- Keine Änderungen an `useGatewayDevices` (der Designer nutzt eine eigene, schmalere Query).

## Verifikation
- Neues Widget anlegen: „Knoten hinzufügen" ist deaktiviert, bis Liegenschaft + ≥1 Gateway gewählt sind.
- Liegenschaft ohne Gateway: klarer Hinweis, keine Knoten möglich.
- Nach Auswahl: Zählerauswahl zeigt ausschließlich Zähler dieser Liegenschaft, deren Datenquelle zu den gewählten Gateways gehört.
- Vorhandene Widgets ohne `location_id`/`gateway_device_ids`: rückwärtskompatibel — beim Öffnen des Designers werden die Felder als leer geführt, die Auswahl muss einmalig nachgezogen werden (Hinweisbanner im Designer).
