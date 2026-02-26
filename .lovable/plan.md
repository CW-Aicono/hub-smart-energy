

# Plan: Tagessummen speichern und daraus Wochen-/Periodenwerte aggregieren

## Problemanalyse

Loxone liefert **keine Wochenwerte** (`totalWeek` ist immer `null`). Die verfuegbaren Periodenwerte von Loxone sind:
- `totalDay` (heute)
- `totalDayConsumption/Delivery` (gestern = "yesterday" ueber `Rldc`/`Rldd`)
- `totalMonth` (laufender Monat)
- `totalMonthLast` (Vormonat, wird bereits archiviert)
- `totalYear` (laufendes Jahr)
- `totalYearLast` (Vorjahr)

Es fehlen: Woche, vorletzter Monat, beliebige historische Zeitraeume.

## Loesung: Tagessummen persistent speichern

Ja, es macht absolut Sinn, **Tagessummen zu speichern und daraus beliebige Zeitraeume zu aggregieren**. Die Tabelle `meter_period_totals` existiert bereits mit `period_type` und `period_start` und wird aktuell nur fuer Monatswerte (`month`) genutzt. Wir erweitern sie um `period_type = 'day'`.

### Datenquellen fuer Tagessummen

1. **Primaer: Loxone `totalDay` am Tagesende** -- der Miniserver liefert den kumulierten Tageswert. Am Ende jedes Tages (kurz vor Mitternacht oder frueh am naechsten Morgen) wird dieser als `period_type = 'day'` gespeichert.
2. **Sekundaer/Fallback: Berechnung aus `meter_power_readings_5min`** -- Die bereits vorhandenen 5-Minuten-Aggregate koennen zu Tagessummen verdichtet werden (Durchschnittsleistung x 5 min = Energiemenge). Nuetzlich fuer Backfill oder bei Ausfaellen.
3. **Backfill vom Miniserver**: Loxone liefert `totalMonthLast` und `totalYearLast` -- damit koennen zumindest abgeschlossene Monate/Jahre rueckwirkend gesichert werden (wie bisher).

### Architektur

```text
+---------------------+       +------------------------+       +------------------+
| Loxone Miniserver   | ----> | loxone-api (Edge Fn)   | ----> | meter_period_    |
| totalDay, totalMonth|       | Archiviert bei jedem   |       | totals           |
| totalYear, etc.     |       | Sync-Lauf              |       | period_type=day  |
+---------------------+       +------------------------+       +------------------+
                                                                        |
                                                                        v
+---------------------+       +------------------------+       +------------------+
| meter_power_        | ----> | DB-Funktion            | ----> | Fallback:        |
| readings_5min       |       | (Cron oder manuell)    |       | Tagessumme aus   |
|                     |       |                        |       | 5min-Aggregaten  |
+---------------------+       +------------------------+       +------------------+
                                                                        |
                                                                        v
                              +------------------------+       +------------------+
                              | Frontend / EnergyChart | <---- | SUM(total_value) |
                              | Beliebige Zeitraeume:  |       | WHERE period_type|
                              | Woche, Monat, Quartal  |       | = 'day' AND      |
                              |                        |       | period_start     |
                              |                        |       | BETWEEN x AND y  |
                              +------------------------+       +------------------+
```

## Umsetzungsschritte

### 1. Tagessummen in `loxone-api` archivieren

**Datei:** `supabase/functions/loxone-api/index.ts`

Neben dem bestehenden `totalMonthLast`-Upsert zusaetzlich bei jedem Sync-Lauf:
- Den **gestrigen** Tageswert (`totalDayConsumption` bzw. `Rldc`/`Rldd`) als `period_type = 'day'`, `period_start = gestern` upserten
- Loxone liefert "Reading yesterday consumption" (`Rldc`) -- damit ist der Wert fuer den abgeschlossenen Vortag verfuegbar

So entsteht automatisch eine lueckenlose Historie von Tagessummen.

### 2. Fallback-Funktion: Tagessummen aus 5-Minuten-Aggregaten berechnen

**Neue DB-Funktion:** `compute_daily_totals_from_5min`

- Berechnet fuer jeden Meter die Tagessumme als `SUM(power_avg * 5/60)` (kW x Stunden = kWh) aus `meter_power_readings_5min`
- Wird nur fuer Tage ausgefuehrt, fuer die noch kein Eintrag in `meter_period_totals` existiert (kein Ueberschreiben von Loxone-Werten)
- Als taeglicher Cron-Job (nach dem bestehenden Compaction-Job) oder manuell aufrufbar

### 3. RPC-Funktion fuer aggregierte Periodenwerte

**Neue DB-Funktion:** `get_meter_period_sums(meter_ids UUID[], from_date DATE, to_date DATE)`

- Aggregiert `SUM(total_value)` aus `meter_period_totals` WHERE `period_type = 'day'`
- Gruppiert nach `meter_id`
- Damit kann das Frontend beliebige Zeitraeume abfragen: aktuelle Woche, letzter Monat, vorletztes Jahr, etc.

### 4. EnergyChart auf gespeicherte Tagesdaten umstellen

**Datei:** `src/components/dashboard/EnergyChart.tsx`

- Fuer Wochen-/Monats-/Quartals-/Jahresansicht: DB-Abfrage der Tagessummen statt Abhaengigkeit von Live-Loxone-Werten (`totalWeek` etc.)
- Live-Werte (`totalDay` vom heutigen Tag) werden weiterhin fuer den **aktuellen, noch nicht abgeschlossenen Tag** aus den Loxone-Sensoren gezogen und zu den gespeicherten Daten addiert
- Offset-Navigation (vorherige Woche, vorletzter Monat) funktioniert damit sofort, da die Daten in der DB liegen

### 5. Historische Daten initial befuellen (Backfill)

**Datei:** `supabase/functions/loxone-api/index.ts` oder separate Edge Function

- Einmaliger Backfill der vorhandenen `meter_power_readings_5min`-Daten zu Tagessummen
- Zusaetzlich: Bestehende Monatswerte aus `meter_period_totals` (period_type=month) als Validierung nutzen

### 6. useEnergyData und verwandte Hooks anpassen

**Datei:** `src/hooks/useEnergyData.tsx`

- `energyTotals`, `costOverview`, `energyDistribution` und `monthlyData` koennen kuenftig auf die gespeicherten Periodensummen zurueckgreifen statt nur auf Live-Werte
- Das macht die Darstellung stabiler und unabhaengig von der Browser-Session

## Vorteile

- **Wochenwerte** funktionieren ohne Loxone-Support (SUM der 7 Tageswerte)
- **Historische Navigation** (vorletzter Monat, vorletztes Jahr) wird moeglich
- **Ausfallsicherheit**: Daten werden persistent gespeichert, nicht nur im RAM des Browsers
- **Fallback-Kette**: Loxone-Wert > 5min-Aggregat > Interpolation
- Bestehende Monatswerte in `meter_period_totals` bleiben kompatibel

## Reihenfolge

1. DB-Migration: Unique-Constraint fuer `period_type = 'day'` pruefen (existiert bereits via `onConflict`)
2. `loxone-api`: Gestrigen Tageswert archivieren
3. DB-Funktion: Fallback-Berechnung aus 5min-Daten + Cron-Job
4. RPC-Funktion fuer Frontend-Abfragen
5. `EnergyChart` auf DB-basierte Periodensummen umstellen
6. Backfill-Migration fuer vorhandene historische Daten
7. `useEnergyData` konsolidieren

