## Aktueller Datenstand (verifiziert)

Recherche in `public`:
- `gateway_devices` hat nur Heartbeat-/Status-Felder (`last_heartbeat_at`, `ws_connected_since`, `status`, …) — **keine** Zähler für Events, Reconnects, Sitzungen oder Disconnect-Gründe.
- Es gibt **kein** Analog zu `loxone_ws_session_log` für AICONO. `gateway-ws` protokolliert Auth/Reconnect nur in Konsolen-Logs, nicht in der DB.
- Loxone-Zeilen befüllen die Spalten aus `bridge_workers` (`events_received`, `reconnect_count`, `worker_host`, `disconnect_reason`). AICONO läuft nicht über einen Worker → diese Quelle existiert bewusst nicht.

Fazit: **Für „Worker“ liegen keine Daten vor und sollen auch keine geben** (AICONO ist Worker-los, „—“ ist korrekt). Für **Events/Reconnects/Sitzungen/Letzter Disconnect** liegen aktuell keine Daten vor — die müssen erst instrumentiert werden.

## Ziel

Die vier Spalten für AICONO-Gateways mit echten 24 h-Werten füllen, ohne das IO-Budget zu belasten.

## Umsetzung

### 1. Neue Tabelle `gateway_ws_session_log` (analog zu `loxone_ws_session_log`)
Spalten: `id`, `tenant_id`, `gateway_device_id`, `started_at`, `ended_at`, `events_received` (int), `reconnect_count` (int), `disconnect_reason` (text), `disconnect_code` (int), `seamless_recycle_count` (int), `updated_at`.
Ein Row pro logischer Session (nicht pro Isolate-Recycle → seamless_reconnect erhöht nur `seamless_recycle_count` und `events_received`, öffnet keine neue Session).
RLS: nur Super-Admin lesen; Service-Role schreibt. GRANTs wie in den Standards.

### 2. `gateway-ws` Edge Function instrumentieren
- Bei `handleAuth` **ohne** seamless_reconnect: neue Session-Zeile anlegen, `session_id` im WS-Context halten.
- Bei seamless_reconnect: bestehende Session per `ws_connected_since` finden, `seamless_recycle_count++`.
- Pro empfangenem Nutz-Frame: `events_received` gebuffert im Speicher, **einmal pro 60 s** per `UPDATE` flushen (IO-schonend, konsistent mit Worker-Aggregation-Policy).
- Bei Disconnect (`tearDown`): `ended_at`, `disconnect_reason`, `disconnect_code` schreiben.

### 3. Aggregations-Read für die Flotte
Neue View oder RPC `aicono_fleet_stats_24h(device_id)` → summiert `events_received`, zählt Sessions und Reconnects der letzten 24 h, liefert `last_disconnect` (jüngstes `ended_at` + Reason). Wird in `SuperAdminGatewayFleet.tsx` genauso konsumiert wie heute `bridge_workers` für Loxone.

### 4. UI (`SuperAdminGatewayFleet.tsx`)
- `aiconoToUnifiedRow` erhält die Stats aus dem neuen RPC und befüllt `eventsLast24h`, `reconnectsLast24h`, `sessionsLast24h`, `lastDisconnect`.
- `worker` bleibt `null` → weiter „—“, ergänzt um Tooltip „AICONO-Gateway läuft ohne Worker (Direktverbindung)“, damit der Strich nicht als Bug wirkt.

### 5. Retention
pg_cron-Job: Zeilen älter als 7 Tage löschen (gleiche Policy wie andere Log-Tabellen), Partial-Index auf `(gateway_device_id, started_at DESC) WHERE ended_at IS NULL` für schnellen Session-Lookup.

## Technischer Kontext

- Buffered Flush (60 s) statt Per-Frame-Insert ist Pflicht — sonst reproduzieren wir das IO-Problem, das wir gerade für Loxone gelöst haben.
- Neue Tabelle bekommt in der gleichen Migration `GRANT SELECT ON … TO authenticated` (RLS beschränkt zusätzlich auf Super-Admin), `GRANT ALL … TO service_role`, `ENABLE ROW LEVEL SECURITY`, Policies.
- Keine Änderungen an HA-Add-on nötig; Zählung passiert cloudseitig.

## Nicht Teil des Plans
- „Worker“-Spalte für AICONO befüllen (per Design leer).
- Uptime-Metrik ändern (bleibt auf Heartbeat-Basis wie heute).
