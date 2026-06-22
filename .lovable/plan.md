## Problem

Beim Reload zeigt die Kachel "Zähler Gesamtverbrauch" niedrigere Monats-/Jahreswerte (z.B. 131,06 MWh statt 193,3 MWh) als kurz nach dem Live-Sync.

## Ursache (verifiziert per DB-Query)

In `meter_period_totals` existiert pro `(meter_id, period_type, period_start)` nur **eine** Zeile (Unique-Constraint). Aktuell:

```
period_type=year  source=computed_5min  total=131.063 kWh   updated_at=12:25:00
period_type=month source=computed_5min  total= 21.427 kWh   updated_at=12:25:00
```

Ablauf:
1. `loxone-api` Cron schreibt korrekt `source='loxone_live'` mit Loxone-Zählerstand (193 MWh) → Chunk-Fix funktioniert.
2. Direkt danach läuft `refresh_meter_period_totals_5min()` (Aggregator aus 5-Min-Buckets) und **überschreibt** die Zeile mit `source='computed_5min'` und dem aus 5-Min-Power-Buckets berechneten, niedrigeren Wert.

Im Aggregator (`supabase/migrations/20260620022305_*.sql`):

- Day-Upsert preserviert `('loxone','loxone_backfill','manual','smart_meter_mscons')` — aber **nicht** `loxone_live`.
- Month-Upsert preserviert nur `('manual','smart_meter_mscons')` — Loxone-Werte werden komplett überschrieben.
- Year-Upsert: gleiche Lücke wie Month.

Live-Broadcast aktualisiert UI im Hintergrund auf die "richtigen" 193 MWh; nach Reload liest LiveValues `meter_period_totals` und bekommt wieder den niedrigeren computed-Wert → Sprung nach unten.

## Fix

Eine neue Migration, die `refresh_meter_period_totals_5min()` so anpasst, dass Loxone-Direktwerte (vom Miniserver gemeldete Zählerstände) **nie** durch die 5-Min-Aggregation überschrieben werden.

Änderungen ausschließlich in den `DO UPDATE … WHERE`-Klauseln:

| Block | alt | neu |
|---|---|---|
| Day  (Zeile 50)  | `NOT IN ('loxone','loxone_backfill','manual','smart_meter_mscons')` | + `'loxone_live'` |
| Month (Zeile 91) | `NOT IN ('manual','smart_meter_mscons')` | + `'loxone','loxone_live','loxone_backfill'` |
| Year (Zeile 132) | `NOT IN ('manual','smart_meter_mscons')` | + `'loxone','loxone_live','loxone_backfill'` |

Effekt:
- Solange `loxone-api` aktuelle `loxone_live`-Werte schreibt, bleibt der Miniserver-Zählerstand als Quelle der Wahrheit erhalten.
- `computed_5min` füllt weiterhin alle Meter ohne Loxone-Quelle (Modbus, MQTT, Shelly, …).
- Bestehende historische `computed_5min`-Zeilen werden beim nächsten regulären `loxone-api`-Lauf (alle 15 min) korrekt überschrieben (loxone_live → DB).

Keine Schema-Änderung, kein Daten-Backfill, keine Frontend-Anpassung nötig. ~3 geänderte SQL-Zeilen.

## Erwartetes Ergebnis

Innerhalb von ≤15 Min (nächster loxone-api Lauf) zeigt die Kachel auch nach Reload Monat 21,57 MWh / Jahr 193,3 MWh stabil — Live-Wert und gespeicherter Wert sind identisch.
