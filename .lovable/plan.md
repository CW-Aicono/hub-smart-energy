# Welle 5 — Backend-Härtung & Performance

## Verifikation (Ist-Zustand)


| Pkt | Befund                                                                                                                                              | Status                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| B1  | `ingest-node-metrics`: Wildcard-CORS (`*`), `provided !== expected` String-Compare, kein Rate-Limit.                                                | **Offen**                                                              |
| B2  | `community-marketplace-public`: nur E-Mail-Dedup (24h), IP wird zwar erfasst, aber nicht limitiert.                                                 | **Offen**                                                              |
| B3  | Cron `cleanup-node-metrics-daily` (03:15) existiert bereits, ruft `cleanup_old_node_metrics()` (>7 Tage).                                           | **Erledigt** (Hinweis: Retention 7 Tage, nicht 30 — siehe Frage unten) |
| B4  | Crons `aggregate-pv-actual-hourly` (5 * * * *) und `ppa-alert-check-daily` (30 6 * * *) sind aktiv.                                                 | **Erledigt**                                                           |
| B5  | Indizes auf `meter_power_readings`: `(meter_id, recorded_at)` + `(recorded_at)`. Kein Index `(tenant_id, recorded_at DESC)`.                        | **Offen**                                                              |
| B6  | `supabase_realtime` enthält `meter_power_readings`, aber **nicht** `meter_power_readings_5min`.                                                     | **Offen**                                                              |
| B7  | `QueryClient` in `src/App.tsx`: `refetchOnWindowFocus: false`, `staleTime: 5 min`.                                                                  | **Erledigt**                                                           |
| B8  | `useCopilotAnalysis`: History-Query ohne `staleTime`. AI-Calls selbst sind Mutations (kein Cache-Refetch-Problem), aber History sollte stabil sein. | **Teilweise offen**                                                    |


## Umsetzungsplan

### B1 — `ingest-node-metrics` härten

- `corsHeaders` ersetzen durch `getCorsHeaders(req)` aus `supabase/functions/_shared/cors.ts` (zusätzlich `x-node-token` in `Access-Control-Allow-Headers` aufnehmen).
- Token-Vergleich auf konstante Laufzeit umstellen: eigener `timingSafeEqual(a, b)`-Helper in der Datei (Längen-Check + XOR-Schleife über `TextEncoder`-Bytes).
- Simples DB-Rate-Limit: pro `node_name` max. 20 Inserts / Minute. Implementierung: vor Insert `count(*)` aus `node_metrics` für letzten 60s; bei Überschreitung HTTP 429 mit `Retry-After: 60`.

### B2 — Marktplatz IP-Rate-Limit

- In `community-marketplace-public` `/join-request`: zusätzlich zur E-Mail-Dedup ein IP-Limit von **10 Anträgen / Stunde**.
- Query: `count(*)` aus `community_join_requests` mit `source_ip = ip` und `created_at >= now() - 1h`.
- Bei Überschreitung: HTTP 429 mit deutscher Fehlermeldung (analog zum bestehenden Stil).
- Keine neue Tabelle nötig — `source_ip` wird heute schon geschrieben.

### B5 — Index `meter_power_readings(tenant_id, recorded_at DESC)`

- Migration: `CREATE INDEX CONCURRENTLY` ist in Supabase-Migrations nicht erlaubt → normales `CREATE INDEX IF NOT EXISTS idx_mpr_tenant_recorded_at ON public.meter_power_readings (tenant_id, recorded_at DESC);`
- Hinweis: Tabelle ist groß → Migration kann mehrere Minuten dauern (Lock auf Inserts während Build). Akzeptabel, da nachts deploybar.

### B6 — Realtime-Publication für `meter_power_readings_5min`

- Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_power_readings_5min;`
- Replica Identity auf `FULL` setzen, damit Updates vollständig propagieren: `ALTER TABLE public.meter_power_readings_5min REPLICA IDENTITY FULL;`
- `useRealtimeDataInvalidation` (siehe Memory) kann dadurch zusätzlich auf 5min-Inserts reagieren — Hook-Änderung ist **nicht Teil dieser Welle** (nur Infrastruktur).

### B8 — Copilot staleTime

- In `useCopilotAnalysis.tsx` der History-Query `staleTime: Infinity` + `gcTime: 30 * 60 * 1000` hinzufügen.
- Invalidiert wird sie nach jeder erfolgreichen `runAnalysis` / `runSavingsAnalysis` ohnehin → kein veralteter Cache.

## Technische Details

**Geänderte Dateien (Code):**

- `supabase/functions/ingest-node-metrics/index.ts`
- `supabase/functions/community-marketplace-public/index.ts`
- `src/hooks/useCopilotAnalysis.tsx`

**Migrationen:**

1. Index auf `meter_power_readings(tenant_id, recorded_at DESC)`
2. Publication-ADD + Replica-Identity für `meter_power_readings_5min`

**Keine neuen Pakete, keine Schema-Änderungen außer Index + Publication.**

## Offene Frage

B3 ist erledigt, aber der bestehende Cron löscht nach **7 Tagen** (`cleanup_old_node_metrics()`), die Anforderung nannte **30 Tage**. Soll die Funktion auf 30 Tage Retention erweitert werden, oder bleibt es bei 7 Tagen? Antwort: Nein, wir belassen den bestehenden Cron bei 7 Tagen.