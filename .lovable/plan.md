## Ziel

Charts sollen je nach gewähltem Zeitraum die jeweils gröbste passende Aggregationsstufe lesen, damit niemals mehr als ~30–90 Zeilen pro Zähler aus der DB geholt werden müssen. Die 5-Min-Rohdaten werden nur noch in der Tagesansicht direkt angefasst.

## Architektur: 3 Aggregationsstufen

```text
meter_power_readings_5min  (Rohdaten, nur Tagesansicht)
        │  (nightly job + on-demand)
        ▼
meter_daily_totals_mv      (1 Zeile/Tag/Zähler  → Wochen-/30-Tage-Ansicht)
        │  (nightly job)
        ▼
meter_weekly_totals        (1 Zeile/ISO-Woche/Zähler → Quartals-/Halbjahres-Ansicht)
        │
        ▼
meter_monthly_totals       (1 Zeile/Monat/Zähler → Jahres-/Mehrjahres-Ansicht)
```

Alle drei Tabellen speichern `consumption_kwh` und `export_kwh` getrennt (bidirektionale Zähler), plus `samples_count` / `coverage_ratio` für Datenqualitäts-Hinweise im Copilot.

## Auswahl-Regel (Frontend + RPC)


| Zeitraum gewählt               | Quelle                                        |
| ------------------------------ | --------------------------------------------- |
| Heute / 1 Tag                  | `meter_power_readings_5min` (5-Min Auflösung) |
| 2–31 Tage (Woche/Monat)        | `meter_daily_totals_mv`                       |
| 32–180 Tage (Quartal/Halbjahr) | `meter_weekly_totals`                         |
| >180 Tage (Jahr, Mehrjahr)     | `meter_monthly_totals`                        |


Eine zentrale Hilfsfunktion `pickAggregationLevel(from, to)` in `src/lib/aggregation.ts` entscheidet einmalig — sowohl Dashboard (`EnergyChart.tsx`) als auch `copilot-analytics` nutzen dieselbe Logik.

## Befüllung

- **meter_daily_totals_mv**: existiert bereits als Plan; wird als echte Tabelle (nicht MV) angelegt, damit Upserts möglich sind. Nightly Cron um 00:15 für gestern + on-demand Trigger nach `meter_period_totals`-Insert.
- **meter_weekly_totals** / **meter_monthly_totals**: Nightly Cron um 00:30 aggregiert aus `meter_daily_totals_mv` (sehr schnell, da nur ~30 Tage/Zähler).
- **Backfill-Migration** läuft einmalig über vollständige Historie (einmaliger Aufwand, danach inkrementell).

## RPC-Anpassungen

- Neue RPC `get_meter_totals_auto(meter_ids, from, to)` wählt intern die richtige Stufe und gibt ein einheitliches Format `{ bucket_start, consumption_kwh, export_kwh, coverage_ratio }` zurück.
- Die alten Funktionen `get_meter_period_sums_with_fallback` / `get_meter_daily_totals_split_with_fallback` bleiben bestehen, rufen aber intern die neue Logik auf — keine Breaking Changes für anderen Code.

## Copilot-Integration

`copilot-analytics` nutzt ausschließlich die neuen Aggregat-Tabellen für Jahres-/Monats-Fragen. `coverage_ratio < 0.8` löst einen Hinweis im AI-Prompt aus („Datenbasis lückenhaft").

## Erwartete Performance

- Jahresansicht für 9 Zähler: heute ~35 s → künftig ~12 Zeilen × 9 = 108 Rows, <100 ms.
- Speicherzuwachs: ~20 KB/Zähler/Jahr (vernachlässigbar).

## Schritte

1. Migration: Tabellen `meter_daily_totals_mv`, `meter_weekly_totals`, `meter_monthly_totals` (inkl. GRANT, RLS, Indizes auf `(meter_id, bucket_start)`).
2. Migration: Aggregations-Funktionen + neue RPC `get_meter_totals_auto`.
3. Insert-Tool: Einmaliger Backfill aus `meter_period_totals` + `meter_power_readings_5min`.
4. Insert-Tool: Zwei `pg_cron`-Jobs (00:15 daily, 00:30 weekly/monthly).
5. Frontend: `src/lib/aggregation.ts` + Umstellung von `EnergyChart.tsx` auf neue RPC.
6. Edge Function: `copilot-analytics` auf neue RPC umstellen + Coverage-Hinweis in den System-Prompt.
7. Validierungs-SQL: Vergleich Summen `daily` vs `weekly` vs `monthly` vs `meter_period_totals` → Report in der Antwort.

## Offene Frage

Soll ich `meter_weekly_totals` mit **ISO-Wochen** (Mo–So) oder **gleitenden 7-Tages-Fenstern** befüllen? Empfehlung: ISO-Wochen, weil sie mit der vorhandenen UI-Wochenauswahl konsistent sind.  
  
Antwort: ISO-Wochen.  
   
  
  
  
  