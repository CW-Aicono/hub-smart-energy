# Fix: PV-Prognose Widget zeigt zu niedrigen "Heute (Ist)"-Wert

## Beobachtung

- Kachel "Aktuelle Werte → Erzeugung": **887,89 kWh Gesamt heute** (stimmt exakt mit Loxone überein)
- Dashboard "PV-Prognose → Heute (Ist)": **537,7 kWh** (zu niedrig)

Beide beziehen sich auf denselben PV-Zähler, denselben Tag.

## Ursache

Es werden zwei verschiedene Datenquellen verwendet:

| Anzeige | Quelle | Berechnung |
|---|---|---|
| Live-Kachel "Gesamt heute" | `meter_period_totals` (period_type=`day`) | Differenz Zählerstand 00:00 → jetzt (kumulativ, exakt) |
| Dashboard "Heute (Ist)" + Balken | `meter_power_readings` via `fetchPvActualHourly` | Summe aus 5-min Leistungswerten × Intervall (Integration) |

Die Integration aus 5-min-Leistungswerten verliert systematisch Energie, weil:
- Loxone-Peak-Filter einzelne 5-min-Samples verwirft (siehe Memory "Loxone Integration / Chart Aggregation")
- Gaps zwischen Samples > 5 min werden mit Default 5 min eingesetzt (Unterschätzung)
- der kumulative Zählerstand vom Gerät ist die einzige verlustfreie Quelle

Für **vergangene Tage** existiert bereits `pv_actual_hourly` (stored), das stimmt. Das Problem betrifft ausschließlich den **laufenden Tag**.

## Fix

### 1. Authoritativer Tages-Ist-Wert aus kumulativem Zählerstand

In `src/lib/pvActuals.ts → fetchPvActualHourly`: Wenn der angefragte Tag = heute ist und `meterIds` vorhanden, zusätzlich den kumulativen Tages-Total aus `meter_period_totals` (period_type=`day`, period_start=heute) lesen — genau die Quelle der Live-Kachel.

### 2. Stündliche Balken proportional skalieren

Die aus `meter_power_readings` berechneten Stundenwerte werden als **Verteilungsmuster** behalten (zeigen die Tageskurve korrekt), aber so skaliert, dass ihre Summe = authoritativer Tages-Total ist:

```text
factor = authoritative_total / sum(integrated_hourly)
hourly[h] = integrated_hourly[h] * factor
```

Falls `sum(integrated_hourly) == 0` (z.B. ganz früh morgens, Live-Total aber > 0): Verteilung wie heute über `estimateHourlyActualsFromDailyTotal` mit Prognose-Gewichten.

### 3. Daily-Totals-Hook angleichen

In `fetchPvActualDailyTotals` (Zeile 337–349): heute-Branch ersetzt aktuell `dayMap[todayStr]` per `buildDailyActualTotal(todayReadings)`. Hier ebenfalls den kumulativen Wert aus `meter_period_totals` bevorzugen.

### 4. Keine Änderung an

- Live-Kachel (ist korrekt)
- Stündliche Speicherung `pv_actual_hourly` (Backend-Job, läuft nachträglich)
- Vergangene Tage (verwenden `stored` Pfad)

## Technische Details

- Neue Hilfsfunktion `fetchTodayCumulativeKwh(meterIds)`:
  ```sql
  SELECT SUM(total_value) FROM meter_period_totals
  WHERE meter_id = ANY($1) AND period_type='day' AND period_start = CURRENT_DATE
  ```
- Skalierungslogik in `buildHourlyActuals` als optionaler Parameter `authoritativeTotalKwh`
- Keine DB-Migration nötig — nur Frontend-`lib`-Änderung
- Betroffen: `src/lib/pvActuals.ts` (einzige Datei)

## Erwartetes Ergebnis

- "Heute (Ist)" zeigt 887,9 kWh (= Live-Kachel = Loxone)
- Grüne Balken behalten ihr Tagesprofil, summieren sich aber zu 887,9 kWh statt 537,7 kWh
- Δ zur PV-Prognose (981 kWh) wird realistisch (~−10 % statt +82 %)
