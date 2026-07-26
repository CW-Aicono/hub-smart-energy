## Ursache

Die Sensor-Erkennung im `MeterDetailDialog` (`EnergyFlowMonitor.tsx`, Zeile 1380–1390) prüft nur `meters.unit`. Für die betroffenen Shelly-Sensoren sieht die DB so aus:

| Sensor | `unit` | `source_unit_power` | `device_type` |
|---|---|---|---|
| Temperatur | `°C` | `°C` | sensor ✅ neue UI |
| Batterie | *(leer)* | `%` | sensor ❌ alte UI |
| Luftfeuchtigkeit | *(leer)* | `%` | sensor ❌ alte UI |

Aktuelle Logik: `if (!u) return false; // ohne Einheit: altes Verhalten (Zähler)` — damit fällt jeder Sensor mit leerem `unit`-Feld zurück auf die kWh-Ansicht, obwohl `device_type = "sensor"` und `source_unit_power = "%"` klar sagen, dass es kein Zähler ist.

Es liegt also **nicht** am Gateway und **nicht** an der Einheit "%", sondern daran, dass `meters.unit` für viele bestehende Sensoren leer ist (nur `source_unit_power` wurde beim Anlegen gesetzt).

## Fix (nur Frontend)

In `src/components/dashboard/EnergyFlowMonitor.tsx` die `isSensor`-Ableitung härten:

1. **Primäres Signal**: `nodeMeter?.device_type === "sensor" || "actuator"` → sofort `true`.
2. **Fallback Einheit**: statt nur `unit` auch `source_unit_power` heranziehen (Set aus Metering-Einheiten unverändert).
3. **Anzeigeeinheit**: `displayUnit = unit || source_unit_power` — damit der Momentanwert für Batterie/Luftfeuchtigkeit als `85 %` erscheint und der `SensorHistoryChart` das richtige Einheiten-Label bekommt.
4. Alt-Verhalten (leere Einheit + `device_type = meter/undef` → Zähler) bleibt bestehen, um echte Zähler ohne gepflegte Einheit nicht kaputtzumachen.

## Ergebnis

Sobald ein Meter `device_type = "sensor"` oder `"actuator"` hat, greift die neue UI (Momentanwert-KPI + „Sensor-Verlauf"-Graph, keine Leistungs-/Energie-Charts) — unabhängig davon, ob `unit` oder nur `source_unit_power` gepflegt ist. Kein Datenmigration nötig.
