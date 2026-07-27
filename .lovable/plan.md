## Ursache (verifiziert)

Seit der Umstellung des WS-Workers (v1.6) auf reine 5-Min-Bucket-Aggregation schreibt der Loxone-Kanal für viele Zähler nur noch nach `meter_power_readings_5min` und **nicht mehr** nach der Rohtabelle `meter_power_readings`.

DB-Check für heute (aktive PV-Zähler):
- `meter_power_readings`: **0 Zeilen**
- `meter_power_readings_5min`: **233 Zeilen**

Alle Frontend-/Backend-Stellen, die weiterhin nur `meter_power_readings` lesen (Live-Wert, Peak, Historie, Kalibrierung), liefern für diese Zähler leere Ergebnisse und fallen entweder auf 0 zurück oder — im PV-Fall — auf einen Estimate-Pfad, der den Tages-Kumulativwert per Forecast-Gewichten verteilt. Deshalb sehen wir konstanten Test-Wert des PV-Meters als Solar-Peak-Muster.

## Betroffene Stellen (identisches Symptom, alle bestätigt per `rg`)

Ohne bereits vorhandenen Fallback:

- `src/lib/pvActuals.ts` (`fetchMeterPowerReadings`) — Ursprungsproblem, verzerrte Ist-Stundenbalken.
- `src/components/dashboard/EnergyGaugeWidget.tsx` (Zeilen ~123, ~169) — Live-Leistung pro Zähler und heutiger Peak.
- `src/components/dashboard/EnergyFlowMonitor.tsx` (Zeilen ~302, ~1159, ~1545, ~2099) — Live-Flow, 24 h Verläufe, Detail-Charts.
- `src/components/dashboard/CustomWidget.tsx` (Zeile ~349) — Recent-Fenster für Custom-Widgets.
- `src/components/board/BoardEnergyBand.tsx` (Zeile ~79) — Board-Live-Band.
- `src/pages/LiveValues.tsx` (Zeile ~329) — „DB-Polling-Wert"-Kandidat für die Kachel.
- `supabase/functions/pv-forecast/index.ts` (Zeile ~130) — Kalibrierung / AI-Korrekturfaktor beruht auf leerem Ist → verfälschter Prognosekoeffizient.
- `supabase/functions/peak-shaving-scheduler/index.ts` (Zeile ~82) — aktueller Leistungswert für Peak-Shaving-Trigger.

Bereits mit 5-Min-Fallback (nur zur Info, kein Fix nötig):
- `src/hooks/useVirtualBalance.ts` — liest zuerst `meter_power_readings_5min.power_avg`.
- `src/components/charging/DynamicDlmCard.tsx` — Fallback auf Bucket.
- `supabase/functions/_shared/meterPower.ts` — liest 5-Min zuerst.

## Fix

Zwei kleine Änderungen, danach überall wiederverwenden:

1. **Neuer Helper in `src/lib/pvActuals.ts`**
   `fetchMeterPower5min(meterIds, from, to)` liest `meter_power_readings_5min` (`meter_id`, `power_avg` als `power_value`, `bucket` als `recorded_at`) und liefert das gleiche Format wie `fetchMeterPowerReadings`, damit `buildHourlyActuals` unverändert bleibt.
   `fetchPvActualHourly`: nach leerem Raw-Fetch zusätzlich 5-Min lesen; erst wenn beide leer sind, greift der bisherige Estimate-Pfad mit `isEstimated: true`.

2. **Einheitliches Fallback-Muster „Raw → 5-Min" in den restlichen Stellen**
   Jede der oben genannten Frontend-/Edge-Function-Reads bekommt denselben Ablauf:
   - Erst wie bisher `meter_power_readings` im gewünschten Zeitfenster lesen.
   - Wenn leer, dieselbe Query gegen `meter_power_readings_5min` fahren (`bucket` statt `recorded_at`, `power_avg` statt `power_value`, gleiche `meter_id`-/Zeitfilter, `desc/asc`-Sortierung analog).
   - Verarbeitung/Aggregation bleibt bestehen (Latest-Wert = `power_avg` des jüngsten Buckets; Historie = Punktreihe aus Buckets).

   Zusätzlich für die „Latest"-Reads mit `.limit(1)` (`EnergyGaugeWidget`, `EnergyFlowMonitor` Zeile 302, `BoardEnergyBand`, `peak-shaving-scheduler`, `LiveValues`): Fenster auf die letzten 15 Min beschränken, damit ein alter 5-Min-Bucket nicht als „Live" durchgereicht wird.

   Für `pv-forecast/index.ts` (Kalibrierung): identisches Fallback im Ist-Fetch, damit der AI-Korrekturfaktor nicht auf Null-Ist berechnet wird.

## Nicht im Scope

- Keine Backfills nach `meter_power_readings`.
- Keine Änderungen am WS-Worker, an RPCs oder Migrationen.
- Kein UI-Redesign, keine Änderungen an `PvForecastWidget.tsx` außerhalb der reinen Datenquelle.

## Erwartetes Ergebnis

- PV-Widget: bei konstantem Test-Meter zeigen die grünen Ist-Balken pro vergangener Stunde vergleichbare kWh-Werte statt Solar-Peak-Verteilung; Label „Stundenwerte aus Tagessumme geschätzt" verschwindet.
- Dashboards (EnergyGauge, EnergyFlowMonitor, CustomWidget, BoardEnergyBand): Live-/Historien-Werte für Loxone-Zähler erscheinen wieder.
- LiveValues-Kachel: „DB-Polling"-Kandidat liefert wieder aktuelle Werte für Worker-Zähler.
- Peak-Shaving-Scheduler und PV-Forecast-Kalibrierung arbeiten wieder mit realen Ist-Werten.
