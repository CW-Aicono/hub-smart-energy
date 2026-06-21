## Du hattest in beiden Punkten recht — Diagnose war falsch fundiert

### 1. Postgres-Uptime
```
pg_postmaster_start_time: 2026-06-20 08:05:21 UTC
jetzt:                    2026-06-21 12:20:28 UTC
Uptime:                   1 Tag 4h 15min  (NICHT 14 Tage)
```
Die "~88 Calls/Min" für `integration_errors` waren also tatsächlich ~10× zu niedrig gerechnet. Real eher ~800/Min.

### 2. shared_blks_read für `integration_errors` — fast Null
Aus `pg_stat_statements`, sortiert nach `shared_blks_read DESC`, nur Queries die `integration_errors` enthalten:

| Query | calls | shared_blks_read | shared_blks_hit | read_ratio |
|---|---|---|---|---|
| `floors`-Monitoring-Query (joint) | 1 | 44.032 | 7.739 | 85% |
| `meter_power_readings` count | 1 | 32.864 | 14.378 | 70% |
| `bridge_raw_samples` count | 1 | 28.361 | 5.128 | 85% |
| Monitoring count(*) FILTER | 1 | 3.381 | 170 | 95% |
| **`cleanup_stale_integration_errors()`** | **1** | **1.351** | **1.058.813** | **0,13%** |
| `VACUUM FULL integration_errors` | 2 | 0 | 157 | 0% |

**→ Die hochfrequenten SELECTs auf `integration_errors` tauchen in den Top-Disk-Readern überhaupt nicht auf.** Sie laufen praktisch vollständig aus dem Buffer-Cache (read_ratio ≈ 0%). Damit ist die "70 %-Beitrag zum IO-Budget"-These widerlegt. Es ist ein CPU-/N+1-Problem, aber NICHT die Ursache des Disk-IO-Budgets.

### Wer treibt das Disk-IO wirklich?
Top-Reader projektweit (Query-Texte teils `<insufficient privilege>` weil von anderem DB-User, aber die Volumina sind eindeutig):

| Rang | calls | mean_ms | shared_blks_read | gelesen | read_ratio |
|---|---|---|---|---|---|
| 1 | 1.777 | 995 | **5.111.766** | ~40 GB | 61% |
| 2 | 768 | 2.321 | **2.963.467** | ~23 GB | 15% |
| 3 | 115 | 7.476 | 593.112 | ~4,6 GB | 46% |
| 4 | 69 | 4.119 | 522.305 | ~4,1 GB | 29% |
| 5 | 15 | 6.119 | 387.656 | ~3 GB | 32% |

Summe Top 5: **~75 GB Disk-Reads in 28h** — das ist die Größenordnung, die das IO-Budget killt.

Query #2 (768 calls, mean 2,3s, 3.859 Blöcke/Call ≈ 30 MB/Call) ist eindeutig die `meter_power_readings WHERE created_at >= $1`-Query, die der BRIN-Index "fixen" sollte. **Der BRIN-Index wird vom Planner offensichtlich nach wie vor nicht genutzt** — das ist der eigentliche, ungelöste Fix von vor zwei Schritten.

Query #1 (5,1 Mio Blöcke, mean 995ms, 1.777 calls) ist noch unbekannt — Text durch fremde `userid` maskiert.

---

## Plan für den nächsten Schritt — KEINE Fixes, nur Beweissicherung

1. **Query-Texte der Top-Reader entmaskieren** über `pg_stat_statements_info`-Reset-Zeitpunkt + Joins zu `pg_roles` (mit erhöhten Rechten via Migration einer SECURITY DEFINER-Helper-Funktion, die nur an authenticated/service_role exponiert wird — oder einmaliger Edge-Function mit Service-Role-Key, die das ausliest und zurückgibt). Ziel: die Klartext-Queries der Top 5 Disk-Reader sehen.

2. **`EXPLAIN (ANALYZE, BUFFERS)` auf die `meter_power_readings WHERE created_at >= $1`-Query** mit einem realistischen Zeitstempel. Beweisen, ob der BRIN-Index `idx_mpr_created_at_brin` benutzt wird oder nicht. Falls Seq-Scan: prüfen, ob `pg_class.reltuples` extrem veraltet ist (kein ANALYZE seit VACUUM FULL → Planner-Stats falsch → BRIN wird wegen falscher Selektivitätsschätzung verworfen). Fix wäre dann ein einfaches `ANALYZE meter_power_readings`, nicht weitere Indizes.

3. **Cache-Hit-Ratio der Instanz gesamt** prüfen (`pg_statio_user_tables` aggregiert) — wenn die DB grundsätzlich zu wenig RAM für den Working-Set hat, ist jeder neue Query-Lauf zwangsläufig Disk. Das wäre dann erstmals ein begründeter Hinweis auf Instance-Upgrade (nicht spekulativ wie vorher).

4. **`pg_stat_statements_reset()` ausführen**, danach 1–2 Stunden warten und Top-Reader frisch ziehen. Aktuelle Zahlen sind kumuliert über 28h inkl. mehrerer VACUUM-FULL-Läufe und Backfills — verzerrt das Bild. Frische Zahlen zeigen den eingeschwungenen Zustand.

Erst wenn 1–4 belastbare Daten liefern, Fix-Entscheidung treffen. Keine Maßnahme an `integration_errors` (Polling-Reduktion bleibt sinnvoll für CPU/Latency, hat aber laut Daten keinen Einfluss auf IO-Budget).

### Was diese Plan-Schritte konkret bedeuten
- Schritt 1 erfordert eine Mini-Migration (SECURITY DEFINER Funktion) oder eine Edge Function — minimal-invasiv, reversibel.
- Schritt 2 ist nur `SELECT EXPLAIN ...` — kein Schreibzugriff.
- Schritt 3 ist nur `SELECT` auf `pg_statio_*`.
- Schritt 4 ist ein einzelner `SELECT pg_stat_statements_reset();`-Aufruf, der nur die Statistik zurücksetzt (keine Daten).

Soll ich diesen Plan so umsetzen, sobald du in den Build-Mode wechselst?