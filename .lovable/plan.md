# Performance-Fix: Partial-Index auf `integration_errors`

## Ausgangslage

Im Performance-Check zeigt sich:

- `integration_errors` Abfrage (Filter: `tenant_id` + `resolved_at IS NULL`) läuft im Mittel **~3,4 s**, Spitzen bis 6 s.
- Tabelle ist klein (19 MB Daten, 7 MB Indizes).
- Die langsame Abfrage wird vom Dashboard-Widget (`IntegrationErrorsWidget`), vom Task-System und von Edge Functions regelmäßig ausgeführt.

## Ziel

Einen gezielten Partial-Index anlegen, der nur offene Fehler indexiert und die Abfrage auf wenige Millisekunden beschleunigt.

## Umsetzung

1. **Migration anlegen**
   - Partial-Index auf `integration_errors (tenant_id)`
   - Bedingung: `WHERE resolved_at IS NULL`
   - Name: `idx_integration_errors_unresolved_tenant`

2. **Verifikation**
   - `EXPLAIN (ANALYZE, BUFFERS)` auf die typische Abfrage ausführen.
   - Sicherstellen, dass der Index verwendet wird.

3. **Monitoring**
   - Nach ~30–60 Minuten `slow_queries` erneut prüfen.
   - Sollte `integration_errors` nicht mehr in den Top-Slow-Queries auftauchen.

## Nicht im Scope

- Keine weiteren Indizes oder Schema-Änderungen.
- Keine Logik-Änderung an Widgets oder Edge Functions.
- Kein Backend-Restart (nicht nötig).

## Erwartetes Ergebnis

- Die Abfrage für offene Integrationsfehler sinkt von mehreren Sekunden auf < 50 ms.
- Das Dashboard-Widget und das Task-System reagieren spürbar schneller.
- Kein nennenswerter zusätzlicher Schreib-Overhead, da der Index nur offene Zeilen umfasst.