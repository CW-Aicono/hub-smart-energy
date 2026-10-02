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

## 3. Ergebnis vom 01.08.2026 (ausgewertet)

| Prüfung | Ergebnis | Bedeutung |
| --- | --- | --- |
| A) höchste Job-Nummer | 122 | Nummer 122 ist vergeben |
| B) `pg_get_serial_sequence` | leer | Der Zähler gehört formal nicht zur Spalte — deshalb die frühere Fehlermeldung. Der Zähler heißt `cron.jobid_seq`. |
| B2) Zählerstand | `cron.jobid_seq` = 122 | Der Zähler hing hinterher und wurde beim fehlgeschlagenen Versuch auf 122 hochgezogen |
| C) Job 122 | `ems-cron-bundle`, aktiv | Der Blocker ist der reguläre Bundle-Job — er darf bleiben |
| D) Retention-Jobs | 6 aktive Cleanup-Jobs, **kein** Analytics-Log-Job | Der Schritt 3c hat seinen Job noch nicht angelegt |

Fazit: Es ist kein Datenverlust und kein Defekt entstanden. Der Zähler war nach einem Restore nicht synchron; er steht jetzt auf 122 und würde als nächstes 123 vergeben.

## 4. Einmalige Korrektur (sicher, ändert nur den Zähler)

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT setval('cron.jobid_seq', (SELECT max(jobid) FROM cron.job), true);
SELECT last_value, is_called FROM cron.jobid_seq;
SQL
```

Erwartet: `last_value = 122`, `is_called = t` — die nächste neue Job-Nummer ist damit 123.

## 5. Danach: Deploy-Schritt 3c erneut laufen lassen

Einfach den nächsten Deploy starten. Der Schritt `3c/6 Analytics-Log-Retention` muss dann ohne Warnung durchlaufen. Zur Kontrolle danach:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c \
  "SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname ILIKE '%analytics%';"
```

Kommt hier eine Zeile zurück, ist die Sache erledigt. Es werden weiterhin keine Cron-Jobs blind gelöscht.

