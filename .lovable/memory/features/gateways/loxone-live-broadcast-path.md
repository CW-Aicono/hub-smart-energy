---
name: Loxone Live-Broadcast-Pfad
description: Live-Werte laufen ausschließlich über den Realtime-Kanal loxone-live-<tenant> mit live_only (keine DB-Schreiblast); Persistenz nur über 5-Min-Buckets
type: feature
---
Der Loxone-Live-Pfad ist strikt zweigeteilt und darf nicht wieder vermischt werden:

- **Live (0 Disk-IO):** Worker `flush()` → `gateway-ingest?action=bridge-readings` mit `live_only: true` → Realtime-Broadcast auf `loxone-live-<tenant_id>`. Kein Insert in `bridge_raw_samples`, kein SOC-Update, keine Aggregation. Worker- und Link-Lookups werden in der Edge Function 5 Min gecacht.
- **Persistenz:** ausschließlich `flushBuckets()` → `gateway-ingest?action=bridge-power-5min` (5-Minuten-Buckets).

Abonnenten des Broadcasts: `src/pages/LiveValues.tsx` und `src/components/dashboard/EnergyFlowMonitor.tsx`.

**Wichtig:** Bei IO-Problemen niemals wieder den kompletten `flush()`-Pfad abschalten — das killt die Live-Werte, ohne IO zu sparen. Drosseln stattdessen über `LIVE_PUSH_INTERVAL_MS`, `MIN_DELTA`, `MAX_LIVE_EVENTS_PER_PUSH`.

Worker-Doku: `docs/loxone-ws-worker/UPDATE-v1.10-live-broadcast.md`.
