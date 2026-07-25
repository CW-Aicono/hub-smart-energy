## Beobachtung / Diagnose

Die Karte **„Gateway-Worker (Hetzner)"** im Infrastruktur-Monitoring (`src/components/super-admin/GatewayWorkerStatusCard.tsx`) und die zugehörige Edge-Function `gateway-worker-status` überwachen ausschließlich den **Loxone-WebSocket-Worker** auf Hetzner. Der Name ist irreführend — mit dem AICONO Gateway (HA-Add-on) hat diese Karte nichts zu tun.

Konkret:
- Die Karte liest `system_settings.worker_last_heartbeat` und das Flag `system_settings.worker_active`.
- Diesen Key setzt heute nur der **Loxone-WS-Worker** (`docs/loxone-ws-worker/index.ts`). Das AICONO Gateway hat seinen eigenen, unabhängigen Heartbeat (`gateway_devices.last_heartbeat_at`, im UI unter „Aktive Geräte-HUBs").
- Der Schalter „Worker als primäre Datenquelle" wirkt ausschließlich auf den Schreibpfad der Edge Function `loxone-api` — er hat keinen Effekt auf AICONO-Gateway-Daten.
- „Heartbeat veraltet / vor 3 Monaten" bedeutet: Seit ~96 Tagen hat kein Loxone-WS-Worker mehr `worker_last_heartbeat` geschrieben. Die aktuelle Worker-Version schreibt nur noch `bridge_workers.last_heartbeat_at` und `ws-session-heartbeat`, nicht mehr den alten `system_settings`-Key → die Karte sieht dadurch immer „stale" aus, obwohl der Worker läuft.
- Die Formulierung „< 5 Min" ist ein Altbestand aus der Zeit vor der einstellbaren Stale-Schwelle (`system_settings.loxone_ws_stale_threshold_seconds`, aktuell 180 s, Default 300 s).

Bestätigt an: `src/components/super-admin/GatewayWorkerStatusCard.tsx`, `supabase/functions/gateway-worker-status/index.ts`, `docs/loxone-ws-worker/index.ts`.

## Antwort auf die drei Fragen

1. **„Heartbeat veraltet"**: Karte liest einen veralteten System-Settings-Key, den der aktuelle Worker nicht mehr aktualisiert. Der Worker selbst ist gesund (siehe `bridge_workers`/`meter_power_readings`-Inserts).
2. **Text-Bedeutung**: Bezieht sich nur auf `loxone-api`. Wenn Flag an + Heartbeat frisch → `loxone-api` überspringt eigenes DB-Schreiben, weil der Worker bereits schreibt (Doppel-Insert vermeiden). Fällt der Worker aus, übernimmt `loxone-api` automatisch wieder als Sicherheitsnetz. Für AICONO-Gateways irrelevant — die pushen direkt an `gateway-ingest`.
3. **300 s Schwelle**: Ja. Der neue Standard ist die tenant-weite Stale-Schwelle aus `system_settings.loxone_ws_stale_threshold_seconds` (aktuell 180 s, Default 300 s). Der fixe „< 5 Min"-Text muss weg bzw. dynamisch werden.

## Plan (nur UI/Monitoring, keine Worker-Logik)

1. **Karte klar auf „Loxone-WebSocket-Worker" umbenennen**
   - Titel: „Loxone-WebSocket-Worker (Hetzner)" statt „Gateway-Worker (Hetzner)".
   - Icon bleibt, Sub-Text ergänzt: „Nur Loxone-Miniserver. AICONO Gateways laufen unabhängig und werden unter ,Geräte-HUBs' überwacht."
   - Feld „Aktive Geräte-HUBs" aus dieser Karte entfernen (gehört inhaltlich nicht zum Loxone-WS-Worker; wird ohnehin an anderer Stelle als AICONO-Kachel angezeigt).

2. **Heartbeat-Quelle korrigieren**
   - `supabase/functions/gateway-worker-status/index.ts`: statt `system_settings.worker_last_heartbeat` den frischesten Eintrag aus `bridge_workers.last_heartbeat_at` (Worker-Typ = Loxone-WS) lesen. `worker_meta` analog aus `bridge_workers.meta`.
   - Fallback auf alten Key beibehalten, damit ältere Worker weiterhin sichtbar bleiben.
   - Frisch-Schwelle: aus `system_settings.loxone_ws_stale_threshold_seconds` lesen (Fallback 300 s) statt hardcoded 180 s.

3. **Info-Text dynamisch machen**
   - Text unter dem Schalter: „Wenn aktiv und Heartbeat frisch (< {N} s laut Stale-Schwelle): `loxone-api` überspringt den DB-Schreibpfad, weil der Worker bereits schreibt. Fällt der Worker aus, schreibt `loxone-api` automatisch wieder als Sicherheits-Fallback. Betrifft nur Loxone — AICONO Gateways sind davon nicht betroffen."
   - {N} kommt aus dem gleichen Wert wie in `WorkerControlsPanel` (Stale-Schwelle-Editor).

4. **Optional — separate AICONO-Karte prüfen**
   - Falls im Infrastruktur-Monitoring noch keine dedizierte „AICONO Gateway-Flotte"-Karte existiert, klein ergänzen: Anzahl aktiver HA-Add-ons (`gateway_devices.last_heartbeat_at < 5 min`), Version, letzter Snapshot. Nicht Teil dieses Umbau-Tickets, nur Hinweis wenn gewünscht.

### Nicht Teil des Plans
- Keine Änderung am Worker selbst, an `loxone-api` oder am AICONO-Ingest.
- Kein Wechsel des DB-Flags-Verhaltens.

### Technische Details
- Betroffene Dateien: `src/components/super-admin/GatewayWorkerStatusCard.tsx`, `supabase/functions/gateway-worker-status/index.ts`.
- Neue Abfrage: `select max(last_heartbeat_at), meta from bridge_workers where worker_type = 'loxone_ws' order by last_heartbeat_at desc limit 1`.
- Neue Query für Stale-Schwelle über bestehenden Hook / direktes `system_settings`-Select in derselben Edge-Function.
