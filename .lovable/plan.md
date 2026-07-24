## Ziel

Wasser-/Gaszähler sollen konsistent mit ihrer echten Einheit (m³ bzw. m³/h) statt kW/kWh angezeigt werden. Die Einheit aus dem Loxone-Miniserver soll als Default übernommen, in den Geräteeinstellungen aber überschreibbar sein — und die dort gesetzte Einheit ist überall die alleinige Anzeigequelle.

## Was aktuell nicht passt (verifiziert)

- **Loxone-Import** (`supabase/functions/loxone-api/index.ts`, Zeilen 50–60): `CONTROL_TYPE_MAPPINGS.Meter` liefert hart `primaryUnit: "kW"` / `secondaryUnit: "kWh"`. Der tatsächliche Formatstring der Loxone-Ausgänge (`Pf` = `m³/h`, `Mr` = `m³`) wird ignoriert → Wasserzähler bekommen bei der Discovery `unit: "kW"` mitgegeben.
- **AssignMeterDialog** (Zeile 82): übernimmt `s.unit` — bekommt also fälschlich "kW" statt "m³".
- **EditMeterDialog** (`src/components/locations/EditMeterDialog.tsx`, Zeilen 199–207, 603–615): Bei Energieart „Wasser" wird `unit` fest auf `"m³"` gesetzt und über ein Freitext-`Input` angezeigt — keine Auswahl m³ / m³/h.
- **SOURCE_UNIT_GROUPS** (`src/lib/sensorUnits.ts`): „Durchfluss"-Gruppe bietet `m³/h`, aber die Gruppe „Energie / Leistung" enthält nur `m³` (ohne `m³/h`). Für einen Wasserzähler ist die Gateway-Rate `m³/h` — nicht offensichtlich auffindbar.
- **MeterDetailDialog** (`EnergyFlowMonitor.tsx`, Zeilen 1361–1370) leitet zwar `rateUnit`/`energyUnit` aus `meter.unit` ab (m³ → m³/h) — funktioniert also, sobald `meter.unit` korrekt gesetzt ist. Das erklärt die kW-Anzeige im Screenshot: der Zähler wurde mit `unit="kW"` importiert.

## Umsetzung

### 1. Loxone-Discovery: echte Einheit übernehmen
`supabase/functions/loxone-api/index.ts`
- Beim Auslesen der Controls die Formatstrings der zugehörigen Ausgänge (`Pf` für Leistung/Rate, `Mr` für Totalzähler) auslesen. Das Loxone-`/data/LoxAPP3.json` liefert pro Control ein `details.format` oder pro State ein `format` wie `"%.3f m³/h"` bzw. `"%.3f m³"`.
- Hilfsfunktion `extractUnitFromFormat(fmt: string): string | null` → Regex nach dem Trailer nach `%…f` extrahieren (`m³/h`, `m³`, `kW`, `kWh`, `°C`, `%`, `l/min`, …).
- Wenn `Pf`-Format eine Nicht-`kW`-Einheit liefert (z. B. `m³/h`, `l/min`), diese in `unit` (primary) statt hartkodiertem `kW` zurückgeben; analog `secondaryUnit` aus `Mr`.
- Fallback bleibt das bestehende `CONTROL_TYPE_MAPPINGS`.

### 2. Zuordnung: passende Energieart automatisch setzen
`src/components/integrations/AssignMeterDialog.tsx`
- Wenn `s.unit` auf `m³` / `m³/h` / `l` / `l/min` endet → Default `energyType = "wasser"` (bzw. bei explizit gasähnlichem Namen `gas`), sonst wie bisher „strom".
- `unit` bleibt der übernommene Wert; für Rate-Einheiten (`m³/h`, `l/min`) wird zusätzlich der Totalzähler-Wert (`m³`, `l`) über `deriveEnergyUnit` als `unit` gespeichert, damit die zentrale Anzeige-Logik greift.

### 3. Einheiten-Dropdown im Gerätedialog erweitern
`src/components/locations/EditMeterDialog.tsx` und `AddMeterDialog.tsx`
- Für Energieart **Wasser** und **Gas** ein `<Select>` mit den Optionen `m³` und `m³/h` anzeigen (statt Freitext bei Wasser bzw. m³/kWh bei Gas).
  - Wasser: Optionen `m³`, `m³/h`. Default `m³`.
  - Gas: Optionen `m³`, `m³/h`, `kWh`. Default `m³`.
- Auto-Set-Effekt (Zeilen 199–207) anpassen: bei Wechsel auf „wasser" nur setzen, wenn aktueller Wert nicht bereits eine gültige Wasser-Einheit ist (User-Override respektieren).

### 4. `SOURCE_UNIT_GROUPS` bereinigen
`src/lib/sensorUnits.ts`
- In der Gruppe „Durchfluss" die vorhandene Option `m³/h` behalten und zusätzlich `m³` (Totalzähler) ergänzen, damit Loxone-Impulszähler-Ausgänge auf beide Varianten sauber gemappt werden können.
- `deriveEnergyUnit`: `m³/h` → `m³`, `l/min` → `l` ergänzen.

### 5. Bestandsdaten korrigieren (einmalige Migration)
Nur wenn `energy_type IN ('wasser','gas')` **und** `unit = 'kWh'`: `unit` auf `m³` setzen, `source_unit_power` auf `m³/h` (falls leer). Damit erscheinen bereits importierte Zähler wie der „Wasserzähler Hausanschluss" sofort korrekt (`MeterDetailDialog` leitet dann automatisch `m³/h`/`m³` ab).

## Wirkungsnachweis nach dem Bau
- Neu-Discovery eines Loxone-Wasserzählers → Assign-Dialog schlägt Energieart „Wasser" + Einheit `m³` vor.
- Editieren: Dropdown „Einheit" zeigt `m³` / `m³/h`, Standard `m³`.
- Detail-Dialog & Widget-Kachel des Wasserzählers zeigen Ø/Max/Min in `m³/h`, Energie/Zählerstand in `m³`, Y-Achse `Leistung (m³/h)`.
- Bestandszähler nach Migration ebenfalls in `m³` / `m³/h`.

## Nicht enthalten
- Umrechnung m³ ↔ kWh für Wasser (technisch nicht sinnvoll). Für Gas bleibt die vorhandene Brennwert-Logik unverändert.
- Änderungen am Widget-Designer über `WIDGET_UNIT_OPTIONS` hinaus.
