# OCPP Persistent Server — Umsetzung abgeschlossen

## Status
✅ **Stufe 1** — Diagnose-Logs in `supabase/functions/ocpp-ws-proxy/index.ts` (sessionId, lastIncoming/Outgoing-Frame, close-code, ping-Probe, Cleanup).
✅ **Stufe 2** — Persistenter Server-Code unter `docs/ocpp-persistent-server/` (komplett, Node 20, ws, Caddy, Docker Compose).
✅ **Stufe 3** — Frontend zeigt URL-Auswahl Lovable Cloud ↔ eigener Server.
✅ **Stufe 4** — `ANLEITUNG_HETZNER_DEPLOY.md` (laienfreundlich, click-by-click).
✅ **Stufe 5** — `TESTPLAN.md` mit Smoke / 1h / 24h / Reconnect / Remote-Befehl / Cheatsheet.

## Nächster Schritt — Deployment
Anwender folgt `docs/ocpp-persistent-server/ANLEITUNG_HETZNER_DEPLOY.md`. Lovable steht für Bugfixing bereit (siehe TESTPLAN.md → Bugfixing-Workflow).

## Architektur-Zielbild
```
Wallbox  ──wss://ocpp.<domain>/<OCPP_ID>──►  Caddy (TLS, Let's Encrypt)
                                              └──►  Node-OCPP-Server (Container, restart=always)
                                                     ├─ echtes WS-Ping/Pong (25s)
                                                     ├─ OCPP-1.6-Handler (Boot/Heartbeat/Status/Authorize/Start/Stop/MeterValues)
                                                     ├─ schreibt: charge_points, ocpp_message_log
                                                     └─ Remote-Commands: Realtime-Sub auf pending_ocpp_commands + Polling-Fallback
Lovable Cloud (Supabase) bleibt für UI, Reports, Abrechnung, RLS-Daten zuständig.
```

## Datenbank
Keine Schema-Änderungen nötig. Bestehende Tabellen reichen.
