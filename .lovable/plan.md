# Log-Scan-Plan: Ist die 74%-Anzeige real oder stale?

## Ausgangslage

Ich habe direkten Zugriff auf alle Lovable-Cloud-Logs (kein Download nötig). Eine erste Stichprobe der letzten 3 Tage zeigt bereits:

- **PostgreSQL-Logs:** Nur 4 Checkpoint-Events, **keine** WAL-Warnungen, **keine** autovacuum-Warnungen, **keine** Temp-File-Warnungen
- **Edge-Function-Calls (3 Tage gesamt):** gateway-ingest nur 20 Calls, loxone-api 12, automation-scheduler 7 — extrem geringe Aktivität
- Bestätigt: meter_power_readings hat seit 5. Juni keinen neuen Eintrag

Das ist die **dritte unabhängige Bestätigung**, dass die 74%-Anzeige nichts mit aktueller Last zu tun haben kann.

## Geplanter Scan (4 Abfragen, alle read-only, ~1 Minute)

### 1. PostgreSQL-Fehler-/Warnungs-Histogramm (3 Tage)
Welche DB-Fehler/Warnungen treten in den letzten 72 h auf, gruppiert nach Severity und Häufigkeit. Findet:
- Lock-Timeouts
- Connection-Saturation
- Deadlocks
- Slow-Query-Logs

### 2. Edge-Function-Aufrufe (Top 30, sortiert nach Gesamtzeit)
Welche Funktion verbraucht am meisten kumulierte Laufzeit (= indirekter Proxy für DB-Last). Vergleich gegen die `pg_stat_statements`-Top-Liste.

### 3. Auth-Logs (3 Tage)
Anomalien bei Authentifizierung, die zu Retry-Storms führen könnten (Token-Refresh-Schleifen, etc.).

### 4. Cron-Job-Übersicht (PostgreSQL)
Welche pg_cron-Jobs laufen wie oft, mit welcher Laufzeit. Findet:
- Jobs, die alle paar Sekunden refresh_materialized_view ausführen
- Jobs, die Aggregationen ohne Index ausführen

## Erwartetes Ergebnis

Eines von zwei Szenarien:

**A) Logs zeigen aktive Last** → Es gibt einen versteckten Verursacher, den wir bisher nicht angefasst haben (z. B. ein pg_cron-Job, ein vergessener Worker, eine triggerbasierte Schreibkaskade). Dann liefere ich einen konkreten Fix-Vorschlag.

**B) Logs sind ruhig (wahrscheinlich, Stand jetzt)** → Beweislage ist erdrückend, die Anzeige ist stale/kumulativ. Empfehlung: Lovable-Support mit den 4 Fragen aus der vorherigen Runde anschreiben. Keine weiteren Code-Änderungen.

## Was ich NICHT mache

- Keine Migrations
- Keine Code-Änderungen
- Keine VACUUMs / Index-Erstellungen
- Keine Instance-Upgrades empfehlen

Nur lesen, auswerten, berichten.
