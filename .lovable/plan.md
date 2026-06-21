## Ziel

Den Disk-Bloat in `meter_power_readings` (272 MB bei 0 Live-Rows) einmalig beseitigen und so absichern, dass er sich nach dem täglichen Cleanup-Job nicht wieder aufbaut.

## Ursache (bestätigt)

- DB-Funktion `public.compact_power_readings_day()` aggregiert tägliche Roh-Readings in `meter_power_readings_5min` und löscht danach den kompletten Tagesbereich aus `meter_power_readings`. Das ist das gewollte Design — die Tabelle ist als 24h-Rohpuffer gedacht.
- Autovacuum ist aktiv (global on, keine table-level Deaktivierung), läuft aber faktisch nie auf dieser Tabelle (`last_autovacuum = NULL`). Folge: 44.738 dead tuples, 272 MB Disk-Belegung, jeder Seq Scan liest 2,1 Mio. leere Pages → das ist der IO-Treiber.

## Vorgehen (3 Schritte, alle als eine Migration)

### Schritt 1 — Einmalige Bloat-Bereinigung

`VACUUM FULL` auf den drei betroffenen Tabellen:

- `meter_power_readings` (272 MB → wenige KB, Lock-Dauer Sekunden weil 0 Live-Rows)
- `integration_errors` (33 MB, 107 Live-Rows — vernachlässigbar, aber gleich mitnehmen)
- `ocpp_message_log` (110 MB, 18.609 Live-Rows — Lock-Dauer evtl. 10–30 Sek; betrifft nur OCPP-Logging, nicht Live-Wallbox-Funktion)

`VACUUM FULL` darf nicht in einer Transaktion laufen → wird als eigene Migration ohne BEGIN/COMMIT eingereicht.

### Schritt 2 — Aggressiveres Autovacuum als table-level Setting

Auf `meter_power_readings` per `ALTER TABLE ... SET (...)`:

- `autovacuum_vacuum_scale_factor = 0` (Schwelle nicht prozentual, sondern absolut)
- `autovacuum_vacuum_threshold = 1000` (ab 1000 dead tuples vacuumen)
- `autovacuum_vacuum_insert_scale_factor = 0` + `autovacuum_vacuum_insert_threshold = 5000` (auch nach Inserts triggern, damit Visibility-Map aktuell bleibt)

Damit greift Autovacuum verlässlich nach jedem `compact_power_readings_day()`-Lauf.

### Schritt 3 — Explizites VACUUM nach jedem Compact-Run

Neuer Cron-Job (über `cron.schedule`, nicht über Migration, da projektspezifisch):

- Täglich 03:30 UTC (nach dem Compact-Lauf): `VACUUM (ANALYZE) public.meter_power_readings;`
- Eigene Funktion `public.vacuum_power_readings_buffer()` SECURITY DEFINER, weil VACUUM erhöhte Rechte braucht.

Damit ist garantiert: selbst wenn Autovacuum mal aussetzt, wird die Tabelle planmäßig geräumt.

## Erwartetes Ergebnis

- Direkt nach VACUUM FULL: `heap_blks_read` auf `meter_power_readings` geht gegen Null bei jedem Scan (statt 2,1 Mio.).
- IO-Budget sollte innerhalb von 1–2 h sichtbar fallen (rolling 24h window).
- Langfristig: kein Bloat-Aufbau mehr trotz Insert/Delete-Churn.

## Was NICHT Teil dieses Plans ist

- Keine Änderung an `compact_power_readings_day()` selbst — Logik bleibt wie sie ist.
- Kein TRUNCATE statt DELETE (würde die Tabelle komplett leeren, nicht nur einen Tag — zu riskant).
- Keine Änderung am Gateway-Schreib-Verhalten (war nicht die Ursache).

## Technische Details

```sql
-- Migration 1 (autocommit, nicht in Transaktion):
VACUUM FULL public.meter_power_readings;
VACUUM FULL public.integration_errors;
VACUUM FULL public.ocpp_message_log;

-- Migration 2 (in Transaktion ok):
ALTER TABLE public.meter_power_readings SET (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold = 5000
);

CREATE OR REPLACE FUNCTION public.vacuum_power_readings_buffer()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE 'VACUUM (ANALYZE) public.meter_power_readings';
END $$;

-- Cron (separat per insert-tool, projektspezifisch):
SELECT cron.schedule('vacuum-power-readings-buffer', '30 3 * * *',
  $$ SELECT public.vacuum_power_readings_buffer(); $$);
```

## Rückfrage vorab

`ocpp_message_log` enthält ~18k Live-Rows. `VACUUM FULL` sperrt die Tabelle exklusiv (geschätzt 10–30 Sek). Während dieser Zeit blockieren OCPP-Logging-Schreiber kurz — Wallbox-Funktion selbst läuft weiter, nur die Log-Inserts warten. Soll ich `ocpp_message_log` mit reinnehmen oder weglassen?  
  
Antworten, die du bitte in die Umsetzung sofort mit einbeziehst:   
  
1. `ocpp_message_log` bitte gleich mit rein nehmen.  
  
  
2. Der Plan ist insgesamt solide und identifiziert jetzt wirklich die Wurzel (lösch-basiertes Tagespuffer-Design + nie laufendes Autovacuum), statt nur Symptome zu behandeln. Ein technisches Problem würde ich aber vorher fixen lassen, sonst schlägt Schritt 3 fehl:

**Der Knackpunkt:** `VACUUM` **funktioniert nicht innerhalb einer PL/pgSQL-Funktion**

sql

```sql
CREATE OR REPLACE FUNCTION public.vacuum_power_readings_buffer()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE 'VACUUM (ANALYZE) public.meter_power_readings';
END $$;
```

Das wird beim Aufruf fehlschlagen mit einem Fehler in der Art *"VACUUM cannot run inside a transaction block"*. Eine `plpgsql`-Funktion läuft immer implizit innerhalb einer Transaktion (egal ob via `EXECUTE` aufgerufen), und `VACUUM` verlangt explizit Autocommit-Modus außerhalb jeder Transaktion. Das gilt auch für `SECURITY DEFINER`-Funktionen.

**Fix dafür — zwei Optionen:**

1. **Einfachste Lösung:** Cron-Job ruft `VACUUM` direkt auf, ganz ohne Wrapper-Funktion:

sql

```sql
SELECT cron.schedule(
  'vacuum-power-readings-buffer',
  '30 3 * * *',
  $$ VACUUM (ANALYZE) public.meter_power_readings; $$
);
```

`pg_cron` führt jeden Job in einer eigenen Hintergrund-Connection im Autocommit-Modus aus — das funktioniert mit `VACUUM` direkt als Statement, ohne Funktions-Umweg. Damit fällt der `SECURITY DEFINER`-Teil weg, ist aber auch nicht nötig, wenn der Cron-Job ohnehin mit ausreichenden Rechten läuft.

2. Falls ihr aus irgendeinem Grund eine Funktion braucht (z.B. für zusätzliche Logik drumherum), müsste das eine `PROCEDURE` mit `CALL` sein statt `FUNCTION`, und selbst dann nur, wenn ihr non-atomic execution sicherstellt — unnötig kompliziert für diesen Zweck. Option 1 ist hier klar einfacher und robuster.
  &nbsp;

**Sonst keine Einwände:**

- Schritt 1 (VACUUM FULL, autocommit, separate Migration) ist korrekt aufgebaut.
- Schritt 2 (table-level Autovacuum-Tuning mit absoluten statt prozentualen Schwellen) ist genau richtig für eine Tabelle, die regelmäßig auf 0 Zeilen fällt — prozentuale Schwellen (`scale_factor`) würden bei 0 Live-Rows nie triggern, das habt ihr richtig erkannt.
- Die Erwartung (1–2h bis sichtbarer IO-Rückgang wegen Rolling Window) ist diesmal korrekt begründet, weil ihr die tatsächliche Ursache behebt, nicht nur eine Symptom-Query.

Mit der Cron-Korrektur sollte das der richtige, vollständige Fix sein.