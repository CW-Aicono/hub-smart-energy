# Hetzner: Cron-Warnung beim Deploy prüfen

Beim Deploy erscheint im Schritt `3c/6 Analytics-Log-Retention` diese Warnung:

```text
ERROR:  duplicate key value violates unique constraint "job_pkey"
DETAIL:  Key (jobid)=(122) already exists.
```

Der Deploy läuft trotzdem sauber durch. Offen ist nur, ob der Aufräum-Job für die Analytics-Logs überhaupt eingerichtet ist.

## 1. Auf dem Server anmelden

```bash
ssh root@DEINE.SERVER.IP
```

## 2. Prüfung ausführen (liest nur, ändert nichts)

Den folgenden Kasten komplett kopieren und mit Enter ausführen:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
-- A) Hoechste vergebene Job-Nummer
SELECT max(jobid) AS hoechste_job_nummer FROM cron.job;

-- B) Name des Zaehlers, der neue Job-Nummern vergibt
SELECT pg_get_serial_sequence('cron.job', 'jobid') AS zaehler_name;

-- B2) Stand aller Zaehler im cron-Schema
SELECT schemaname, sequencename, last_value AS zaehler_stand
FROM pg_sequences
WHERE schemaname = 'cron';



-- C) Welcher Job blockiert die Nummer 122?
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobid = 122;

-- D) Gibt es bereits einen Retention-/Cleanup-Job fuer Logs?
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname ILIKE '%retention%'
   OR jobname ILIKE '%analytics%'
   OR jobname ILIKE '%log%'
ORDER BY jobid;
SQL
```

## 3. Ergebnis einordnen

Die Ausgabe bitte vollständig zurückmelden. Zwei Fälle sind möglich:

- **Der Zähler (B) ist kleiner oder gleich der höchsten Job-Nummer (A):** Der Zähler ist nicht mehr synchron, typischerweise nach einem Datenbank-Restore. Dann wird er einmalig einmalig korrigiert und der Deploy-Schritt kann erneut laufen.
- **Unter (D) steht bereits ein aktiver Retention-Job:** Dann ist die Aufgabe faktisch bereits eingerichtet und der Deploy-Schritt ist nur noch überflüssiges Rauschen.

Erst nach dieser Ausgabe wird die passende, minimale Korrektur festgelegt. Es werden keine Cron-Jobs blind neu angelegt oder gelöscht.
