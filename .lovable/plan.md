## Verifiziertes Diagnose-Ergebnis (EXPLAIN ANALYZE BUFFERS)

EXPLAIN auf die RPC-Query mit echtem Parameter-Set (Tenant mit 54 Metern, 30 Tage):

```
GroupAggregate
  Buffers: shared hit=2306 read=1            <-- ~2.300 Blocks/Call, deckt sich exakt
                                                  mit Produktion (Ø 2.876 Blocks/Call)
  ->  Nested Loop  (rows=1266)
        ->  Index Only Scan idx_mdtm_tenant_meter_bucket
              Heap Fetches: 1092             <-- ❗ DAS ist die Ursache
        ->  Index Scan idx_mdtm_tenant_meter_bucket
              (rows=1266, loops=1)           <-- KEIN Loop-pro-Meter
```

**Befund (hart verifiziert, keine Spekulation mehr):**

- Der Plan ist korrekt: Index Only Scan, kein Nested-Loop-Bug.
- Aber: **1.092 erzwungene Heap-Fetches** trotz "Index Only Scan".
- Ursache: Die MV wurde **nie vacuumed** (`last_vacuum=NULL`, `last_autovacuum=NULL`). Materialized Views werden von Autovacuum nicht angefasst, und `REFRESH MATERIALIZED VIEW` setzt die Visibility Map nicht.
- Ohne Visibility Map muss Postgres für jede Zeile in den Heap, um zu prüfen, ob das Tupel sichtbar ist — selbst wenn der Index alle benötigten Spalten liefert.
- `ANALYZE` allein behebt das NICHT — nur `VACUUM` setzt die Visibility Map.

**Erwartung nach `VACUUM (ANALYZE)`:**

`Heap Fetches: 1092` → ~0, `Buffers: hit=2306` → ~250.
Hochrechnung Produktion: 40 GB/28h → **~4 GB/28h** (Faktor 10).

## Plan

### Schritt 1 — Sofort-Fix per Migration

Migration mit zwei pg_cron-Jobs (die laufen außerhalb der Migrations-Transaktion, weil `VACUUM` nicht in Transaktionen erlaubt ist):

1. **Einmal-Job**: `VACUUM (ANALYZE) public.meter_daily_totals_mv` 60 Sekunden nach Migration. Setzt Visibility Map sofort.
2. **Recurring-Job**: derselbe Befehl täglich nachts (z. B. 04:15 UTC), damit nach jedem `REFRESH MATERIALIZED VIEW` die Visibility Map wieder gesetzt wird.

Owner-Voraussetzung erfüllt: MV ist `postgres`-owned, Migration läuft als `postgres`, pg_cron ist installiert.

### Schritt 2 — Messung (5 Minuten nach Migration)

`EXPLAIN (ANALYZE, BUFFERS)` derselben Query wiederholen. Erwartung:
- `Heap Fetches:` Wert von 1.092 → 0 (oder <50).
- `Buffers: shared hit` von 2.306 → <300.

Falls bestätigt: Hebel #1 ist gelöst.

### Schritt 3 — 24 h später

`extensions.pg_stat_statements_reset()` ausführen, 24 h warten, Top-Reader neu ziehen. Hebel #1 sollte nicht mehr in den Top 5 erscheinen.

### Erst danach: Hebel #2 und Hebel #3

Separat, mit eigener Vorher/Nachher-Messung.

## Technische Details

- Migration enthält **keine** DDL-Änderungen, nur `cron.schedule(...)`-Aufrufe.
- VACUUM auf 3 MB-Tabelle: <500 ms, kein App-Impact.
- Recurring-Job nachts: hält die Lösung dauerhaft, ohne dass jemand daran denken muss.
- Kein Refactoring der RPC nötig — die Query ist korrekt, nur die Tabellen-Wartung fehlte.
