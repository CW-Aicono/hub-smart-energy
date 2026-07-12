# Fix: Energieflussmonitor — Live-Werte, Animation, Tagessummen

## Diagnose

**1) Keine Animation, keine Live-Werte (5,7 kW etc.)**
Das Widget bezieht Live-Leistung aus zwei Quellen:
- `useRealtimePower` — nur Realtime-INSERT-Events auf `meter_power_readings` (nach dem Mount)
- `useGatewayLivePower` — überspringt explizit Loxone (`loxone-api` und `gateway-ingest` sind ausgeschlossen, siehe `src/hooks/useGatewayLivePower.ts` Z. 119)

Solange also kein frischer 5-min-INSERT nach dem Öffnen des Dashboards eintrifft, ist `latestByMeter` leer → `flowWatts = null` → `hasFlow = false` → keine Partikel/Dash-Animation, keine Watt-Anzeige. Genau das Verhalten im Screenshot.

`BoardEnergyBand` löst das bereits sauber: initialer **Seed-Query** auf `meter_power_readings` der letzten 10 Minuten, Realtime nur als Overlay darüber.

**2) Tagessummen weichen von Loxone-App ab (111,2 vs. 49,3 kWh)**
Zeitzonen-Bug in `EnergyFlowMonitor`:
```ts
from.setHours(0, 0, 0, 0);                 // Berlin-Mitternacht (lokal)
p_from_date: from.toISOString().split("T")[0];  // ← UTC-Datum!
```
Berlin 00:00 → UTC 22:00 des Vortags. `toISOString()` liefert den **Vortag** als Datum. Damit fragt die RPC `get_meter_daily_totals_with_fallback` mit `p_from_date = gestern`, `p_to_date = heute` an und summiert **zwei** Tage. 49,3 (heute) + ~62 (gestern) ≈ 111 kWh — exakt der beobachtete Wert.

## Änderungen (nur `src/components/dashboard/EnergyFlowMonitor.tsx`)

### A) Seed für Live-Leistung ergänzen
Neuen `useQuery`-Block einbauen, analog zu `BoardEnergyBand`:
- Query: `meter_power_readings` (`meter_id`, `power_value`, `recorded_at`), `in("meter_id", meterIds)`, `gte("recorded_at", now-10min)`, `order desc`, `limit 2000`.
- Reduzieren auf `seedByMeter: Record<string, number>` (jeweils neuester Wert pro Meter, in **kW** — wie in DB gespeichert).
- `staleTime: 60_000`, `refetchInterval: 60_000` (Sicherheitsnetz, Realtime übernimmt).

`getLiveWatts` wird um den Seed erweitert (Reihenfolge: Realtime → Gateway-API → Seed):
```
latestByMeter[id]  (bereits W)
→ livePowerByMeter[id]  (Einheiten-Umrechnung)
→ seedByMeter[id] * 1000  (kW → W)
```
Damit erscheinen Live-Werte sofort nach dem Öffnen, Animation läuft, und Realtime aktualisiert sie sub-sekündlich sobald ein neuer Datenpunkt landet.

### B) Zeitzonen-korrektes Datum für Tagessummen
Kleine Helper-Funktion im File:
```ts
function toBerlinDateString(d: Date): string {
  // sv-SE liefert 'YYYY-MM-DD', erzwungen in Europe/Berlin
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}
```
`getDateRange` weiterhin für Datumsobjekte nutzen, aber in der RPC-Query:
```ts
p_from_date: toBerlinDateString(from),
p_to_date:   toBerlinDateString(to),
```
Für `period === "day"` liefert das exakt `heute` = `heute` → nur der heutige Tag wird summiert und deckt sich mit der Loxone-App.

### C) Kein Refactor der Animation nötig
Sobald A) greift, ist `flowWatts != null` → `hasFlow = true` → Dash-Animation und Partikel laufen wie geplant. Kein Eingriff in die SVG-Logik.

## Nicht betroffen
- `useGatewayLivePower`, `useRealtimePower`, `BoardEnergyBand` — bleiben unverändert.
- RPC `get_meter_daily_totals_with_fallback` — funktioniert korrekt, der Bug liegt beim Aufrufer.
- Widget-Designer / Node-Filter — bleiben unverändert.

## Verifikation nach dem Fix
1. Dashboard neu laden → PV/Netz/Gebäude/Speicher zeigen sofort kW-Wert unter dem Kreis.
2. Fließende Verbindungen zeigen Partikel + Watt-Label am Mittelpunkt.
3. „Heute"-Summe für PV ≈ 49 kWh (Loxone-App-Referenz), nicht mehr 111 kWh.
