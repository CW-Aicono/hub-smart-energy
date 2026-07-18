
# Plan: Monitoring dauerhaft + Alert-Historie

Die Seite `/super-admin/monitoring` (`SuperAdminMonitoring.tsx`) mit Kacheln, Charts und `AlertRulesCard` existiert schon — inklusive Tabellen `infrastructure_metrics` und `monitoring_alert_rules`. Aktuell fehlen aber:

1. **Automatische Erfassung** (Screenshot: „Letzter Heartbeat vor 3 Monaten" → Cron läuft nicht)
2. **Metriken für WAL & IO**
3. **Alert-Historie** (Ursache + Zeitstempel) — bisher werden Verletzungen nur clientseitig on-the-fly angezeigt

## Was gebaut wird

### 1. Migration (SQL)

**a) `collect_db_metrics` RPC erweitern** um zusätzliche Metriken (im gleichen `infrastructure_metrics`-Schema):
- `wal.current_size_bytes` — via `pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')` bzw. Summe aus `pg_ls_waldir()`
- `db_io.blks_read_total` und `db_io.blks_hit_total` — aus `pg_stat_database` (Delta zwischen zwei Läufen ergibt effektive Disk-Reads → IO-Proxy)
- `db_io.tup_written_5min` — Rate aus `pg_stat_database`
- `memory.cache_hit_ratio_pct` — aus `pg_stat_database` (Ersatz für RAM-Sättigung, da echter Container-RAM in Lovable Cloud nicht abrufbar ist)

Ehrlicher Hinweis in UI: **CPU- und Container-RAM-%** sind aus Postgres heraus nicht messbar; wir zeigen stattdessen Cache-Hit-Ratio + WAL-Wachstum + Verbindungssättigung als aussagekräftige Proxies. (Echte CPU/RAM würden einen Agenten auf Hetzner erfordern, den du nicht willst.)

**b) Neue Tabelle `monitoring_alert_events`**  
`id, rule_id, metric_category, metric_name, metric_value, threshold, comparator, severity, message, triggered_at, resolved_at, created_at`. RLS: nur `super_admin` lesen; Insert nur via service_role. GRANTs korrekt.

**c) Rule-Evaluation als SQL-Funktion** `evaluate_monitoring_rules()`:  
- Iteriert `monitoring_alert_rules WHERE enabled`
- Holt jeweils neuesten Wert aus `infrastructure_metrics`
- Wenn Regel verletzt und noch kein offenes Event (`resolved_at IS NULL`) für dieselbe Regel → neues Event einfügen
- Wenn Regel nicht mehr verletzt und offenes Event existiert → `resolved_at = now()` setzen

**d) `pg_cron`-Job alle 5 Min** → `net.http_post` auf `collect-metrics`. Zusätzlich sekundärer Cron alle 5 Min → `SELECT evaluate_monitoring_rules()` (läuft direkt in DB, kein HTTP).

**e) Standard-Regeln seeden** (via `INSERT ... ON CONFLICT DO NOTHING`, per Insert-Tool nach Migration):
- Connections-Sättigung > 80 % (Warnung), > 95 % (Kritisch)
- WAL > 1 GB (Warnung), > 2 GB (Kritisch)
- DB-Größe wächst > 20 % pro Woche (Warnung) – Regel-Typ „Delta" nachreichen, falls zu komplex zunächst weglassen
- Cache-Hit-Ratio < 95 % (Warnung), < 90 % (Kritisch)
- Vorhandene Regeln bleiben unverändert

### 2. Edge Function `collect-metrics`
- Ruft am Ende zusätzlich `evaluate_monitoring_rules()` auf (falls Cron mal ausfällt, gibt es einen Fallback beim Klick auf „Jetzt erfassen").
- Fügt CPU/RAM absichtlich **nicht** hinzu (siehe oben).

### 3. UI (`SuperAdminMonitoring.tsx`)
- Neue Karte **„Alert-Historie"** unterhalb der bestehenden `AlertRulesCard`:  
  Tabelle mit Spalten *Zeit*, *Metrik*, *Level* (Badge), *Wert*, *Schwelle*, *Beschreibung*, *Status* (offen/behoben), *Behoben um*. Filter: Zeitraum (24 h / 7 d / 30 d), Level (alle/warn/kritisch), Status (alle/offen/behoben). Sortiert nach `triggered_at DESC`, paginiert (50/Seite). Deutsche Zahlenformatierung.
- Neue Kacheln in der KPI-Reihe: **„WAL"** und **„Cache-Hit-Ratio"**.
- Kleiner Hinweistext unter Kacheln: „CPU/RAM des DB-Containers sind in Lovable Cloud nicht direkt auslesbar — wir überwachen WAL, DB-Größe, Verbindungen, IO und Cache-Hit-Ratio als aussagekräftige Ersatzsignale."
- `AlertRulesCard` bekommt zusätzlich Spalte **„Warn/Kritisch"** — bisher speichert das Modell aber nur einen `severity`+`threshold`. Um Doppel-Schwellen zu unterstützen, empfehle ich **zwei Regeln je Metrik** (eine mit `warning`, eine mit `critical`), so wie es die Standardregeln geseedet werden. Kein Schema-Umbau nötig.

### 4. Hook `useMonitoringAlertEvents.tsx` (neu)
Query auf `monitoring_alert_events` mit Filtern; Auto-Refetch alle 60 s.

## Was NICHT enthalten ist
- Kein E-Mail-/Webhook-Versand (deine Vorgabe: nur Tab).
- Keine echten Container-CPU/RAM-Werte (technisch nicht möglich ohne externen Agent).
- Kein Monitoring der Hetzner-Worker (existiert bereits separat in `GatewayWorkerStatusCard`/`HetznerNodesCard`).

## Reihenfolge (1 Umsetzung)
1. Migration (Tabelle + RPC-Erweiterung + Cron-Jobs + Trigger-Funktion)
2. Insert-Aufruf mit Standard-Regeln
3. Edge Function `collect-metrics` erweitern (Evaluator-Call)
4. Hook + Alert-Historie-Komponente + Kachel-Ergänzungen im Frontend
