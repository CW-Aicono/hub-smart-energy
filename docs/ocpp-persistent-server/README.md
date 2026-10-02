# OCPP Persistent Server

Dauerhaft laufender OCPP-1.6-WebSocket-Server für AICONO EMS / Lovable Cloud.

## Warum?

Supabase Edge Functions sind serverless und recyceln Worker nach 60–120 s. Für OCPP brauchen wir aber eine **echte Dauerverbindung**. Dieser Server löst das Problem.

## Architektur

```
Wallbox  ──wss://ocpp.<domain>──►  Caddy (TLS)  ──►  Node-Server  ──►  Lovable Cloud (Supabase)
                                                       │
                                                       ├─ ocpp_message_log
                                                       ├─ charge_points (Status)
                                                       └─ pending_ocpp_commands (Realtime + Polling)
```

## Schnellstart (lokal, nur zum Test)

```bash
cp .env.example .env   # Werte ausfüllen
npm install
npm run build
npm start
```

`http://localhost:8080/health` muss `{"status":"ok"}` liefern.

## Produktion

→ siehe **ANLEITUNG_HETZNER_DEPLOY.md** für die komplette Schritt-für-Schritt-Anleitung.

## Logs lesen

```bash
docker logs -f ocpp-server | jq
```

## Test- und Bugfixing-Plan

→ siehe **TESTPLAN.md**.
