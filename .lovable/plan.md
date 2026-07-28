## Problem

Im Meter-Detail-Dialog (`EnergyFlowMonitor.tsx` → `MeterDetailDialog`) werden Sensor-Kennzahlen falsch beschriftet:

- KPI-Kacheln zeigen **„Ø Leistung / Max / Min in kW"** — auch bei reinen Sensoren wie Spannung (V), Temperatur (°C), Feuchte (%), Strom (A), Frequenz (Hz), Luftdruck (hPa), Lux, CO₂ etc.
- Grund 1: `rateUnit`-Ableitung (Zeile 1405) liest nur `meterUnitRaw`, ignoriert aber `source_unit_power`. Bei Sensoren ist `unit` oft leer → Fallback liefert `"kW"` (Zeile 1430).
- Grund 2: Für Sensoren fehlt eine separate KPI-Beschriftung. Labels sind fest auf „Leistung" verdrahtet.
- Grund 3: Generischer `${u}/h`-Fallback (Zeile 1432) würde z. B. für °C ein sinnloses „°C/h" erzeugen.
- Chart 1 („Leistung") und dessen Tooltip/Legende/Y-Achse verwenden ebenfalls `rateUnit` + festen Text „Leistung" — bei Sensoren doppelt falsch, zumal darunter bereits ein passender `SensorHistoryChart` gerendert wird.

Der Energie-Bucket-Chart ist bereits per `!isSensor` ausgeblendet — Chart 1 aber nicht.

## Verifizierter Umfang

Ripgrep bestätigt: `rateUnit` / `energyUnit` existieren nur in `src/components/dashboard/EnergyFlowMonitor.tsx`. Kein weiterer Chart betroffen. `SensorHistoryChart` nutzt bereits die per Prop übergebene Sensor-Einheit korrekt.

## Änderungen (nur `src/components/dashboard/EnergyFlowMonitor.tsx`, `MeterDetailDialog`)

1. **Einheiten-Ableitung härten**
   - Für Sensoren (`isSensor === true`) `rateUnit` und `energyUnit` **nicht** aus Leistungslogik ableiten, sondern beide auf die tatsächliche Sensor-Einheit setzen (`displayUnit` = `unit || source_unit_power`, sonst leer). Keine `/h`-Anhänge, kein kW-Fallback.
   - Für Zähler den bestehenden Power-/Volumen-Mapping-Zweig beibehalten. Den generischen `${u}/h`-Fallback (Zeile 1432) entfernen und stattdessen konservativ auf `{ rateUnit: displayUnit, energyUnit: displayUnit }` fallen, wenn keine bekannte Zuordnung greift (verhindert erfundene Einheiten wie `°C/h`).
   - `isSensor`-Erkennung bleibt unverändert.

2. **KPI-Kacheln kontextabhängig beschriften**
   - Bei Sensoren die Labels auf **„Ø Wert / Max / Min"** umstellen und statt `rateUnit` die Sensor-Einheit anzeigen.
   - Bei Zählern unverändert „Ø Leistung / Max / Min" in `rateUnit`.
   - „Momentanwert" bleibt für Sensoren; „Energie" bleibt für Zähler.

3. **Chart 1 „Leistung"**
   - Bei `isSensor` komplett ausblenden (analog zum bereits gehandhabten Energie-Chart). Der darunter gerenderte `SensorHistoryChart` (Zeile 2108) übernimmt die Sensor-Visualisierung mit korrekter Einheit.
   - Damit entfällt für Sensoren auch die falsche Y-Achsen-/Tooltip-/Legenden-Beschriftung „Leistung (kW)".

## Verifikation

- `tsgo` (Typecheck).
- Manuell im Preview: Detail-Dialog für einen Volt-Sensor (Screenshot-Fall), Temperatur-Sensor, Wirkleistungs-Zähler (kW), Wasser-Zähler (m³) und Gas-Zähler prüfen — Einheiten/Labels müssen jeweils passen.

## Nicht enthalten

- Keine Änderungen an `SensorHistoryChart`, Widget-Designer, LiveValues-Kacheln oder Dashboard-Widgets — Analyse zeigt, dass diese die Einheit bereits korrekt aus dem Meter/Sensor übernehmen.
- Keine DB-/Backend-Änderungen.
