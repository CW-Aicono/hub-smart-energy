# Disk-IO Tiefenfix (Loxone-Sync)

Ziel: Die drei identifizierten Hauptverursacher des Disk-IO-Verbrauchs eliminieren, ohne Funktionalität zu verändern. Die 56 nicht zugeordneten Loxone-Geräte werden **nicht** angefasst — sie schreiben ohnehin keine Power-Daten in die DB.

## Was geändert wird

### 1. `location_integrations` Status-Storm stoppen
**Datei:** `supabase/functions/loxone-periodic-sync/index.ts`

- Alle direkten `UPDATE location_integrations SET last_sync_at = ...` entfernen.
- Stattdessen ausschließlich die bestehende RPC `touch_location_integration_sync` verwenden (die bereits Throttling/Status-Logik enthält).
- Erwartung: 2,37 Mio. Updates auf 11 Zeilen → drastische Reduktion.

### 2. `meter_period_totals` nur bei tatsächlicher Wertänderung schreiben
**Datei:** `supabase/functions/loxone-api/index.ts`

- Vor jedem Upsert in `meter_period_totals` den aktuellen Wert für (`meter_id`, `period_type`, `period_start`) lesen.
- Upsert nur ausführen, wenn `total_value` sich geändert hat oder `source`/`type` abweichen.
- Erwartung: 9,77 Mio. Updates auf 5.676 Zeilen → drastische Reduktion (Werte ändern sich pro Tag/Woche meist gar nicht mehr nach Tagesende).

### 3. `integration_errors` Dedup reparieren
**Datei:** `supabase/functions/loxone-periodic-sync/index.ts`

- Bestehende Lookup-Logik bei Fehler-Erzeugung erweitern: Match auf `location_integration_id + error_type + sensor_name + ignored=false` statt nur `sensor_name`.
- `sensor_name IS NULL` korrekt mit `.is("sensor_name", null)` behandeln (statt `.eq(..., null)`, was nie matcht und Duplikate erzeugt).
- Erwartung: Keine 95–97 neuen Duplikat-Fehler/Stunde mehr für identische Probleme.

## Was bewusst NICHT geändert wird

- Loxone `/all`-Abfrage am Miniserver bleibt (Cron holt alle Controls). Begründung: betrifft nur HTTP-Last, nicht Disk-IO. Optimierung wäre separater Punkt — laut Nutzer aktuell nicht nötig.
- Keine spekulativen Index-Anlagen. Indizes nur, falls nach dem Fix `EXPLAIN ANALYZE` auf konkreten Slow Queries einen Bedarf zeigt.
- Keine Schema-Änderungen.

## Validierung nach dem Fix

Direkt nach Deploy und dann nach 1h / 8h jeweils prüfen:

1. `supabase--db_health` → Disk-IO-Budget, WAL, rolled-back transactions
2. `supabase--slow_queries` → kein `meter_period_totals`/`location_integrations` mehr in Top 10
3. SQL-Check: `n_tup_upd` auf `location_integrations` und `meter_period_totals` (Delta zur Baseline = nahe 0 bei unveränderten Werten)
4. SQL-Check: `COUNT(*)` neuer `integration_errors` letzte Stunde — sollte deutlich unter 95 liegen
5. Funktional: Eine Liegenschaft mit Loxone-Gateway öffnen, Live-Werte und Tages-Chart kurz prüfen — keine Regression sichtbar.

## Rollback-Strategie

Alle Änderungen sind reine Edge-Function-Änderungen ohne Schema-Migration. Bei Problemen: vorherige Versionen der beiden Edge Functions wiederherstellen, sofort wirksam.

## Aufwand

3 Edge-Function-Änderungen, kein Migration-Approval nötig. Validierung nach Deploy dauert wegen Wartezeiten (1h, 8h) verteilt über den Tag.
