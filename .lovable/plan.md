## Ursache (verifiziert per DB-Abfrage & Code-Review)

Für die betroffenen Geräte werden Live-Werte in **`sensor_readings_raw`** geschrieben, aber **nicht** in **`meter_power_readings` / `meter_power_readings_5min`** – und genau diese beiden Tabellen füttern den „Leistungsverlauf"-Chart im `MeterDetailDialog`. Beispieldaten (letzte 24 h, DB-Query):

| Gerät | Typ | `sensor_readings_raw` | `meter_power_readings` |
|---|---|---|---|
| Shelly Plug S Energie über HA Gateway (AICONO) | meter, kW/kWh | 1225 | **0** |
| Shelly Plug S Leistung (AICONO) | sensor, W | 1212 | **0** |
| 34987a468340 Zähler (Shelly, `emdata0_total`, kWh) | meter | 2092 | **0** |
| 34987a468340 Leistung (Shelly, `em0_power`, kW) | sensor | 2095 | 1746 ✓ |

Zwei getrennte Lücken im Ingest:

1. **AICONO Gateway** (`gateway-ingest` → `handleDeviceSnapshot`): schreibt eingehende Werte ausschließlich per `persistSensorHistory` nach `sensor_readings_raw`. Es gibt keinen Zweig, der bei verknüpfter `meters`-Zeile (via `sensor_uuid = entity_id`) den numerischen Leistungswert zusätzlich in `meter_power_readings` spiegelt – daher **kein einziger Chart-Punkt** für HA-Gateway-Zähler, obwohl live alles ankommt.
2. **Shelly Cloud** (`shelly-periodic-sync`): schreibt nur Sensoren mit Einheit W/kW/MW nach `meter_power_readings`. Kumulative Energie-Zähler (`emdata0_total`, Einheit kWh) und Temperatur-Sensoren fallen komplett heraus – deshalb sind die „…Zähler"- und „…Temperatur"-Charts leer.

Zusätzlich fehlt im Chart ein Fallback: der Reiter für `device_type=meter` fragt ausschließlich die Power-Tabellen ab und zeigt „Keine Daten", obwohl `sensor_readings_raw` reichlich Werte hat.

## Umsetzung

### 1. Ingest ergänzen – AICONO / HA Gateway
`supabase/functions/gateway-ingest/index.ts`, `handleDeviceSnapshot`:
- Nach `persistSensorHistory` einen zusätzlichen Schritt einführen: alle verknüpften Meter für dieses Gateway laden (`meters` where `location_integration_id = device.location_integration_id`, `capture_type='automatic'`, `is_archived=false`), auf `sensor_uuid → entity_id` mappen.
- Für jedes verknüpfte Meter den Wert numerisch parsen, per `source_unit_power` normalisieren (W→kW, kW→kW, MW→kW, sonst überspringen) und einen Row in `meter_power_readings` einfügen (mit `tenant_id`, `energy_type`, `recorded_at = now()`).
- Delta-Guard analog `sensor_readings_raw`: nur schreiben, wenn der letzte Wert seit ≥ 60 s oder um ≥ 1 % abweicht, damit der IO-Druck niedrig bleibt.
- Cumulative-Counter (Einheit kWh/Wh) werden nicht als Leistung eingefügt; sie laufen weiter über `sensor_readings_raw` und werden im Chart als kumulative Reihe angezeigt (siehe Punkt 3).

### 2. Ingest ergänzen – Shelly Cloud kumulative Zähler
`supabase/functions/shelly-periodic-sync/index.ts`:
- Für Meter, deren Sensor die Einheit kWh liefert (`emdata0_total`), Delta zum letzten Roh-Wert bilden (`sensor_readings_raw` letzter Eintrag desselben Meters) und daraus Momentanleistung in kW rechnen (`ΔkWh / Δh`). Ergebnis in `meter_power_readings` einfügen, wenn Δt zwischen 30 s und 15 min liegt (sonst überspringen, verhindert Ausreißer beim Neustart).
- Temperatur-/Nicht-Energie-Sensoren bleiben wie bisher außen vor – deren Chart läuft über den bereits vorhandenen `SensorHistoryChart`-Zweig.

### 3. Chart-Fallback im `MeterDetailDialog`
`src/components/dashboard/EnergyFlowMonitor.tsx` (MeterDetailDialog-Abschnitt):
- Wenn für `device_type='meter'` weder `meter_power_readings_5min` noch `meter_power_readings` Daten im Zeitraum liefern, transparent auf `sensor_readings_raw` zurückfallen und die Reihe als „Wertverlauf" darstellen (Einheit dynamisch aus `source_unit_power`).
- KPI-Kacheln (Ø / Max / Min / Energie) auf dem Fallback-Datensatz gleich rechnen; Energie-Kachel für kumulative kWh-Reihen als Differenz „Ende − Anfang".
- Beim Öffnen wird kurz protokolliert, aus welcher Quelle die Reihe stammt, damit Diagnose einfach bleibt.

### 4. Backfill (einmalig, optional als Button im Super-Admin)
- Für die 24 h vor dem Deploy-Zeitpunkt die vorhandenen `sensor_readings_raw`-Werte aller AICONO-Gateway-Meter in `meter_power_readings` spiegeln (nur die, die eine `source_unit_power` mit W/kW/MW haben). Damit sind Charts sofort „gefüllt" und nicht erst nach 24 h.
- Wird als kleine SQL-Migration ausgeführt; kein separater Edge-Function-Endpunkt nötig.

## Nicht betroffen / bewusst ausgelassen
- Loxone-Miniserver-Meter: laufen bereits über `loxone-ws-worker` in `meter_power_readings` und funktionieren im Chart.
- Reine Aktoren (Schalter, `switch.*`, `_relay0`): keine Leistungshistorie – bleiben wie gehabt Status-Werte in `sensor_readings_raw`.
- Automations- und Live-Anzeige (Snapshot-Pfad): unverändert, arbeiten bereits korrekt.

## Prüfschritte nach Deploy
1. AICONO-Gateway einmal einen Snapshot schicken lassen → neuer Row in `meter_power_readings` für z. B. `Shelly Plug S Energie über HA Gateway` sichtbar.
2. Backfill-Migration ausführen, Detail-Dialog öffnen → Chart zeigt die letzten 24 h.
3. Shelly-Cumulative-Meter (`emdata0_total`) nach dem nächsten Sync im Chart prüfen.
4. Loxone-Meter zur Kontrolle öffnen: keine Regression.
