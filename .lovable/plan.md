## Diagnose (aus DB verifiziert)

Für den betroffenen Speicher (`Speicher Rathaus`) habe ich die Rohdaten geprüft:

- `energy_storages.current_soc_pct = 100` ✅ (stimmt mit deiner Aussage überein)
- `energy_storages.soc_sensor_uuid = 1ce9f387-0301-df64-ffffed57184a04d2`
- Die letzten Samples zu **genau dieser UUID** in `bridge_raw_samples`:
  ```
  2026-07-13 08:06  →  -0.00365
  2026-07-13 08:05  →  -0.00343
  2026-07-13 08:04  →  -0.00559
  ...
  ```

Das sind **Leistungswerte in kW (leicht negativ, nahe Null)** — **kein SOC in %**. Die als „SOC-Sensor" hinterlegte Loxone-UUID zeigt in Wahrheit auf einen Leistungs-/Ladestrom-Kanal.

### Daraus folgt:
1. **„X-Achse gesplittet"** ist kein Achsen-Bug: Die Zeitachse ist korrekt linear (`scale="time"`). Es entstehen zwei Cluster, weil
   - die *echten* Power-Samples heute ab 03:00 laufen,
   - der falsch verlinkte „SOC-Sensor" gestern zwischen 12:51 – 22:01 zufällig ein paar knapp-positive Werte hatte (die den Filter `> 0` passiert haben) und heute nur noch negative liefert (→ herausgefiltert → nichts nach 22:01).
   → Zwei disjunkte Wolken → sieht optisch aus wie „nebeneinander".
2. **„SOC 0 % statt 100 %"** ist die logische Konsequenz: Es werden ~0,001 – 0,05 „kW" als „SOC %" auf die 0–100-Skala gezeichnet → Linie klebt am Boden.

## Fix-Plan

**Datei:** `src/components/dashboard/EnergyFlowMonitor.tsx` (nur `MeterDetailDialog`)

### 1. Plausibilitäts-Guard für die SOC-Serie
Nach dem Laden aus `bridge_raw_samples` prüfen, ob die Reihe überhaupt wie SOC aussieht:
- Median der Werte muss `>= 1` sein **und**
- mindestens ein Wert `>= 5` (kein reines Rauschen um 0).

Wenn nicht → **komplett verwerfen** (`socSeries = []`, `hasSoc = false`). Damit wird bei falsch verknüpfter UUID gar keine irreführende SOC-Linie mehr gezeichnet und die Zeitachse zeigt nur noch die realen Power-Zeitstempel — das „Split" verschwindet automatisch.

### 2. Fallback: aktueller SOC als Referenz
Wenn `hasSoc = false`, aber `energy_storages.current_soc_pct` existiert:
- rechte Y-Achse (0–100 %) trotzdem einblenden,
- eine dezente horizontale `ReferenceLine` bei `current_soc_pct` mit Label `SOC aktuell: 100 %` zeichnen (blau, gestrichelt).

So bleibt die SOC-Information sichtbar, ohne falsche Historie zu suggerieren.

### 3. Zeitachse robuster
- `XAxis` bekommt `domain={[now - RANGE_MS[range], now]}` (fixer Zeitraum statt `dataMin/dataMax`) → linear und lückenfrei, unabhängig davon wo Datenpunkte liegen.
- `tickCount={8}` explizit für gleichmäßige Ticks (verhindert Ticks-Cluster wie „12:51 13:52").
- `interval="preserveStartEnd"` statt Auto.

### 4. Hinweis-Badge bei defekter SOC-Verknüpfung
Wenn `socSensorUuid` gesetzt ist, aber Guard aus Punkt 1 greift: kleiner gelber Hinweis-Chip oben rechts im Chart:
> „SOC-Sensor liefert unplausible Werte – bitte in den Speicher-Einstellungen prüfen."

Damit ist der Konfig-Fehler für Admins sichtbar (statt still falsch).

### 5. Was NICHT geändert wird
- Keine Datenbank-/Migrations-Änderungen.
- Kein automatisches „Reparieren" der `soc_sensor_uuid` — das muss der Nutzer in den Speicher-Einstellungen korrigieren (dort ist die UUID für „Speicher Rathaus" auf einen Leistungs-Kanal statt SOC-Kanal gesetzt).

## Ergebnis
- Punkt 1 (X-Achse): Achse wird linear über den vollen Zeitraum gerendert, keine „Zwei-Cluster"-Optik mehr.
- Punkt 2 (SOC falsch): Unplausible Serie wird verworfen; stattdessen wird der echte aktuelle SOC (100 %) als Referenzlinie gezeigt, plus Hinweis auf die fehlerhafte Sensor-Zuordnung.
