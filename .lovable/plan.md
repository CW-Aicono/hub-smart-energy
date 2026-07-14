## Beweis (aus `pg_stat_statements`, nicht geraten)

Rangliste nach **physischen Disk-Reads** (nicht nach CPU-Zeit — Disk-Reads ist genau das, was das IO-Budget belastet):

| Rang | Disk gelesen | Calls | ⌀ Zeit | Query |
|-----:|-------------:|------:|-------:|-------|
| **1** | **23 152 MB** | 768 | 2 321 ms | `SELECT id FROM meter_power_readings WHERE created_at >= $1 LIMIT $2 OFFSET $3` + `COUNT(*)` mit gleichem Filter |
| 2 | 2 677 MB | 5,2 M | 5 ms | INSERT in `meter_power_readings` (nur Schreib-Volumen — unvermeidbar) |
| 3 | 1 295 MB | 23 | 1 951 ms | `VACUUM (ANALYZE) meter_power_readings` (Wartung) |
| 4 | 1 201 MB | 292 | 65 ms | Gleiche Query wie #1, andere Variante mit `LIMIT` im Count-Zweig |
| 5 | 1 111 MB | 6 584 | 190 ms | INSERT in `meter_power_readings_5min` (Aggregator, korrekt) |
| 6 | 505 MB | 8 946 | 343 ms | `EnergyGaugeWidget` Peak-Query (`ORDER BY power_value DESC`) |
| 7 | 386 MB | 1 | 13 706 ms | `VACUUM FULL meter_power_readings` (einmalig, Wartung) |

**#1 + #4 zusammen = 24,3 GB — das sind ~80 % aller Disk-Reads.** Alles andere ist Rauschen im Vergleich.

## Ursache — eindeutig

Die IO-Bombe ist eine Query mit Filter **ausschließlich auf `created_at`**. Auf `created_at` existiert nur ein **BRIN-Index** (`idx_meter_power_readings_created_at_brin`, angelegt Juni 2026). BRIN funktioniert nur, wenn die Zeilen physisch nach `created_at` sortiert liegen — bei einer Tabelle mit 5,2 Mio verteilten INSERTs pro Zyklus ist das nicht mehr der Fall, deshalb muss Postgres große Teile der Tabelle lesen (~30 MB pro Aufruf).

Woher der Aufruf stammt, ist im Codebase-Scan **nur eine Kandidat-Stelle**: die Edge Function `gateway-worker-status/index.ts` Zeile 62–65:
```ts
.from("meter_power_readings")
.select("id", { count: "estimated", head: true })
.gte("created_at", fiveMinAgo);
```
Der Query-Fingerprint in `pg_stat_statements` enthält allerdings `LIMIT/OFFSET` — das passt nicht zu `head: true`. Es gibt also **noch mindestens einen zweiten Aufruf** (Cron/Monitor/Backup-Job außerhalb unseres Repos, oder die Edge Function wird bei Fehlern in einen anderen Pfad umgeleitet). Das müssen wir vor dem Fix noch identifizieren, um sicher zu gehen.

## Sicherheitsgrad meiner Diagnose

- **Ursache-Query eindeutig identifiziert:** ✅ 100 % (harte Zahlen aus `pg_stat_statements`)
- **Fix wirkt:** ✅ ~95 % — ein B-Tree-Index auf `created_at` reduziert 30 MB/Call auf wenige kB (klassischer Index-vs-Seq-Scan-Fall).
- **Aufrufer im eigenen Code identifiziert:** ⚠️ 60 % — der Cloud-Code enthält nur einen passenden Aufruf, aber der Query-Fingerprint passt nicht 1:1. Vor dem Deploy müssen wir den Aufrufer klären.

## Fix-Plan (in dieser Reihenfolge)

### Schritt 1 — Aufrufer eindeutig identifizieren (Verifikation vor jedem Codeeingriff)
- `postgres_logs` via `supabase--analytics_query` nach genau dieser Query filtern (`event_message ILIKE '%meter_power_readings%created_at%'`), Zeitstempel + `application_name` prüfen. So sehen wir, ob es die Edge Function, ein pg_cron-Job oder ein externer Consumer ist.
- Falls unser eigener Code: an der Aufrufstelle korrigieren (bei 5-Min-Fenster besser auf `recorded_at` filtern, da dort ein B-Tree-Index existiert).

### Schritt 2 — B-Tree-Index auf `created_at`
Migration:
```sql
CREATE INDEX IF NOT EXISTS idx_meter_power_readings_created_at
  ON public.meter_power_readings (created_at DESC);
```
Wirkt sofort für **jeden** Aufrufer und macht die Query planmäßig unter 20 ms bei wenigen kB Read. Der bestehende BRIN kann parallel bleiben (oder Schritt 3).

### Schritt 3 — Optional: BRIN-Index entfernen
`DROP INDEX idx_meter_power_readings_created_at_brin;` falls Analyze bestätigt, dass er nach dem B-Tree-Fix nicht mehr verwendet wird.

### Schritt 4 — Peak-Query im `EnergyGaugeWidget` (Rang 6)
Nachrangig, aber lohnt sich noch (505 MB, 343 ms Mittel):
- `src/components/dashboard/EnergyGaugeWidget.tsx` Zeilen 142–164: `ORDER BY power_value DESC` ohne LIMIT ersetzen durch RPC `get_meter_daily_peaks(meter_ids, day)` mit `MAX(power_value) GROUP BY meter_id`.

### Schritt 5 — Verifikation
- 30 min nach Deploy: `SELECT shared_blks_read FROM pg_stat_statements WHERE query ILIKE '%meter_power_readings%created_at%'` — muss auf ~0 sinken (relativ zur Vorher-Basis).
- IO-Budget-Anzeige aktualisiert sich verzögert (Snapshot-Semantik).

## Zurückgezogen aus der ersten Version
Der **Detail-Dialog Paging-Fix** und der **`integration_errors` Composite-Index** stehen nicht mehr im kritischen Pfad — sie machen zusammen unter 5 % der IO-Last aus. Sinnvoll später, aber nicht Auslöser des 100-%-Budgets.

## Technisches
- Der neue B-Tree-Index auf `created_at` kostet einmalig Buildzeit (~1–3 min bei ~200 M Zeilen) und danach ca. 5–8 % zusätzlichen Schreib-Overhead pro INSERT — vernachlässigbar im Vergleich zu 23 GB Read-Ersparnis.
- Kein Applikationscode muss zwingend geändert werden, wenn der Aufrufer außerhalb unseres Repos liegt — der Index wirkt für alle.
