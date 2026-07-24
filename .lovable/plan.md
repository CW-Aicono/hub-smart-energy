
# Akute Auth-Blockade beheben — Restart + Neubewertung

## Ausgangslage (verifiziert aus Auth-Logs)

Der Auth-Dienst kann Postgres nicht mehr erreichen:

```
500: error finding refresh token: failed to connect to
  host=localhost user=supabase_auth_admin database=postgres
  dial error (timeout: dial tcp [::1]:5432: i/o timeout)
```

Zusätzlich antwortet der interne Metrics-Endpoint (`db_health`) nicht. Das ist ein Connection-/Sättigungsproblem auf Infrastruktur-Ebene — nicht durch einen Index sofort lösbar.

## Schritte

1. **Backend neu starten** (`supabase--restart`) — räumt hängende Backends, Locks und den Connection-Pool ab. Kurzer Ausfall (~30–60 s) erwartet.
2. **Status verifizieren** (`supabase--cloud_status`) bis `ACTIVE_HEALTHY`, dann Test-Login.
3. **Neu messen**:
   - `supabase--db_health` — Connections, WAL, Deadlocks.
   - `supabase--slow_queries` — sind es wieder `meter_cumulative_readings` + `integration_errors`?
4. **Wenn die Slow-Query-Liste bestätigt ist**, per Migration nachziehen (Grundlast senken, künftige Blockade unwahrscheinlicher):
   - Index auf `meter_cumulative_readings (meter_id, reading_at DESC)`
   - Partial-Index auf `integration_errors (tenant_id) WHERE resolved_at IS NULL`
   - Anschließend `EXPLAIN (ANALYZE, BUFFERS)` zur Verifikation.
5. **Kurzer Health-Report** an dich: was war Ursache des Ausfalls, was war reine Grundlast.

## Wichtig / Erwartungsmanagement

- Der Restart löst die *akute* Blockade, nicht die *Grundlast*. Schritt 4 ist die eigentliche Nachhaltigkeitsmaßnahme.
- Sollte nach dem Restart die Sättigung sofort wiederkommen, ist die Ursache eher ein Traffic-Peak (Worker/Ingest) — dann sehen wir das in `slow_queries` / `db_health` und passen den nächsten Schritt entsprechend an (z. B. Ingest-Throttling), statt blind Indizes zu bauen.
