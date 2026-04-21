# Healthcheck & Monitoring

## Eingebauter Healthcheck

Der Container exponiert `GET /health`:

```json
{ "status": "ok", "uptimeSeconds": 1234, "sessions": 3 }
```

Docker prüft das automatisch (siehe `Dockerfile` HEALTHCHECK).

## Externes Monitoring (empfohlen)

Lege bei einem kostenlosen Uptime-Anbieter (z. B. UptimeRobot, BetterStack) einen HTTPS-Check auf

```
https://ocpp.<deine-domain>/health
```

an. Intervall 1–5 Minuten. Bei Ausfall: E-Mail/SMS-Alarm.

## Was bei Problemen zuerst prüfen

```bash
docker ps                       # läuft der Container?
docker logs --tail 200 ocpp-server
docker logs --tail 200 ocpp-caddy
curl -sf https://ocpp.<domain>/health
```
