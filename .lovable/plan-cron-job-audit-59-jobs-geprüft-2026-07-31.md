# Cron-Job-Audit: 59 Jobs geprüft

Alle 59 Zeitpläne wurden live ausgelesen (`cron.job`) und mit den Laufzeiten der letzten 24 Stunden (`cron.job_run_details`) abgeglichen. Ergebnis: 49 aktiv, 10 dauerhaft deaktiviert. Es gibt drei Problemklassen — Altlasten, Minuten-Kollisionen und ein zu dichtes Nachtwartungsfenster.

## 1. Altlasten: 10 deaktivierte Jobs entfernen

Diese Jobs stehen auf `active = false` und belegen nur noch Zeilen im Scheduler. Ihre Aufgaben laufen inzwischen im Sammeljob `ems-cron-bundle`:

`automation-scheduler-every-2min`, `dlm-scheduler-every-minute`, `solar-charging-scheduler-every-2min`, `cheap-charging-scheduler-every-5min`, `power-limit-scheduler-every-5min`, `gateway-power-readings-sync`, `brighthub-intraday-sync`, `brighthub-readings-sync`

Zusätzlich zwei echte Dubletten:
- `fetch-spot-prices-hourly` (inaktiv) ist die alte Fassung von `ems-fetch-spot-prices` — löschen.
- `brighthub-readings-sync` / `brighthub-intraday-sync` sind durch den Bundle-Aufruf `brighthub-periodic-sync` ersetzt.

Aktion: dauerhaft `cron.unschedule`, damit sie nicht versehentlich reaktiviert werden.

## 2. Kollisionen: Jobs, die sich gegenseitig behindern

Mehrere Jobs starten auf dieselbe Minute und konkurrieren um dieselben Worker und Tabellen:

```text
Minute 05 (stündlich)  sensor-rollup-hourly
                       aggregate-pv-actual-hourly
                       charge-point-auto-reboot-hourly     -> 3 gleichzeitig
Minute 17 (stündlich)  bridge_event_log_cleanup_daily
                       cleanup-bridge-raw-samples-hourly   -> beide auf bridge-Tabellen
Minute 00 (stündlich)  lexware-sync-status-hourly          -> Minute 0 generell meiden
03:15                  cleanup-node-metrics-daily
                       dlm-control-log-cleanup-daily
03:30                  cleanup-charge-point-uptime
                       sensor-cleanup-hourly
                       vacuum-power-readings-buffer        -> VACUUM parallel zu DELETEs
```

Besonders kritisch ist 03:30: dort läuft ein `VACUUM` gleichzeitig mit zwei Löschjobs auf denselben Bereichen — das erzeugt genau die IO-Spitzen, die zuletzt zu Login-Ausfällen geführt haben.

Aktion: jeden dieser Jobs auf eine eigene, freie Minute legen; Minute 0 und 30 bleiben frei.

## 3. Nachtfenster entzerren (03:00–03:50)

Zwölf Wartungsjobs liegen in 50 Minuten. Sie werden auf 02:00–05:00 verteilt, mit fester Reihenfolge: erst Löschen/Bereinigen, danach `VACUUM`/`ANALYZE` — nie gleichzeitig.

## 4. Fragwürdige Frequenzen prüfen und anpassen

- `ems-rollup-power-hourly` läuft alle 10 Minuten (`5-59/10`) und ist damit ein Rest aus der Backfill-Phase. Prüfen, ob stündlich reicht; falls ja, umstellen.
- `peak-shaving-event-prep-10min` (`8-59/10`) liegt nur 3 Minuten neben dem Rollup — Offset vergrößern.
- `refresh-meter-period-totals-5min` läuft zweimal stündlich (14, 44) — beibehalten, aber gegen die 15er-Gruppe versetzen.
- `bridge_event_log_cleanup_daily` heißt „daily", läuft aber stündlich — umbenennen bzw. auf täglich reduzieren.

## 5. Überlappungsschutz für die Langläufer

Sechs Jobs hatten in den letzten 24 h Laufzeiten über 20 Minuten (Spitze 44 min, überwiegend während des Worker-Sturms). Diese bekommen einen Advisory-Lock, damit ein neuer Lauf nicht startet, solange der vorherige noch läuft:

`charge-point-auto-reboot-hourly`, `sensor-rollup-hourly`, `aggregate-pv-actual-hourly`, `cleanup-bridge-raw-samples-hourly`, `ems-rollup-power-hourly`, `peak-shaving-event-prep-10min`

## Technische Umsetzung

Eine einzige Migration:
1. `cron.unschedule` für die 10 toten Jobs.
2. `cron.alter_job` (bzw. Neu-Schedule per Name, keine festen Job-IDs) für alle kollidierenden Zeitpläne mit eindeutigen Minuten-Offsets.
3. Wrapper-Funktionen mit `pg_try_advisory_xact_lock` für die sechs Langläufer.
4. Abschließende Prüfquery, die Zeitplan-Kollisionen auflistet, damit künftige Migrationen nicht erneut auf besetzte Minuten legen.

Keine Datenlöschung, keine Änderung an der 5-Minuten-Historie, keine Änderung am Frontend.

## Validierung

- Nach der Migration Kollisionsliste erneut abfragen: muss leer sein.
- Zwei bis drei Stunden `cron.job_run_details` beobachten: keine `job startup timeout`, keine Überschneidungen.
- Verbindungsauslastung und Login prüfen.
