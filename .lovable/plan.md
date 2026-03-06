

## Was ist damit gemeint?

Der Softwareprüfer bemängelt, dass es kein **zentrales Infrastruktur-Monitoring** gibt, das folgende Metriken an einem Ort bündelt:

- **Datenbank-Last**: CPU, RAM, Connections, Query-Performance
- **API-Request-Counts**: HTTP-Anfragen pro Endpunkt, Fehlerrate, Latenz
- **Edge Function Execution**: Aufrufe, Dauer, Fehler pro Funktion
- **System-Health**: Uptime, Disk-Usage, Netzwerk

Aktuell existiert zwar ein `platform_statistics`-Table und ein Super-Admin-Dashboard mit KPIs (Tenants, Users, Locations), aber das sind **Applikations-Metriken** -- keine Infrastruktur-Metriken.

---

## Extern vs. selbst gebaut?

### Option A: Externes Tooling (Grafana + Prometheus)
- **Klassischer Ansatz** bei Self-Hosting auf Hetzner
- Prometheus scraped Metriken von PostgreSQL (pg_exporter), GoTrue, Kong/API-Gateway
- Grafana visualisiert alles in einem Dashboard
- **Vorteil**: Industriestandard, Alerting eingebaut, riesiges Ecosystem
- **Nachteil**: Separater Service, muss bei Hetzner-Deployment mitinstalliert werden (Docker Compose)

### Option B: Eigenes Monitoring-Dashboard in der App (empfohlen als Ergänzung)
- Wir können ein **Infrastruktur-Monitoring-Widget** direkt im Super-Admin-Bereich bauen
- Datenquellen: Eine Edge Function sammelt regelmässig Metriken und schreibt sie in eine DB-Tabelle
- Visualisierung via Recharts (bereits installiert)
- **Machbar ohne externe Tools**, deckt die wichtigsten Punkte ab

### Empfehlung: Kombination

Für das Hetzner-Self-Hosting ist der Grafana/Prometheus-Stack Teil des Docker-Compose-Setups (Dokumentation). Parallel dazu bauen wir ein **eingebautes Monitoring-Dashboard** im Super-Admin, das die wichtigsten Metriken direkt in der App zeigt -- das adressiert die Prüfer-Kritik direkt.

---

## Plan: Eingebautes Infrastruktur-Monitoring

### 1. Neue DB-Tabelle `infrastructure_metrics`
```sql
CREATE TABLE infrastructure_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL,        -- 'db_connections', 'api_requests', 'edge_function', 'disk_usage'
  metric_name text NOT NULL,        -- z.B. 'active_connections', 'gateway-ingest'
  metric_value double precision,
  metadata jsonb DEFAULT '{}',
  recorded_at timestamptz DEFAULT now()
);
```
- RLS: Nur Super-Admins lesen/schreiben
- Retention: Automatisches Cleanup nach 30 Tagen

### 2. Edge Function `collect-metrics`
- Wird periodisch aufgerufen (Cron via pg_cron oder externer Trigger)
- Sammelt per SQL: DB-Connections (`pg_stat_activity`), Table-Sizes, Slow Queries
- Sammelt Edge Function Aufrufstatistiken aus Logs
- Schreibt alles in `infrastructure_metrics`

### 3. Super-Admin Seite "Infrastruktur-Monitoring"
- Neue Route `/super-admin/monitoring`
- Sidebar-Eintrag im Super-Admin-Menü
- Widgets:
  - **DB-Connections** (Zeitverlauf, Recharts Line Chart)
  - **API-Requests pro Stunde** (Bar Chart)
  - **Edge Function Performance** (Tabelle: Name, Avg Duration, Error Rate)
  - **Speicherverbrauch** (Gauge/Progress Bars)
  - **System-Status** (Health-Badges: DB, Auth, Storage, Functions)

### 4. Dokumentation für Hetzner-Deployment
- Ergänzung in `docs/DEVELOPER_DOCUMENTATION.md`
- Docker-Compose-Snippet für Prometheus + Grafana als optionalen Stack
- Hinweis: Das eingebaute Dashboard deckt Basis-Monitoring ab; für tiefgreifendes Alerting wird Grafana empfohlen

### Dateien die erstellt/geändert werden

| Datei | Aktion |
|---|---|
| Migration SQL | Neue Tabelle `infrastructure_metrics` |
| `supabase/functions/collect-metrics/index.ts` | Neue Edge Function |
| `src/pages/SuperAdminMonitoring.tsx` | Neue Seite |
| `src/hooks/useInfraMetrics.tsx` | Neuer Hook |
| `src/components/super-admin/SuperAdminSidebar.tsx` | Menüeintrag |
| `src/App.tsx` | Route hinzufügen |
| `docs/DEVELOPER_DOCUMENTATION.md` | Grafana/Prometheus Doku |

