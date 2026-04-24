# Testplan & Bugfixing-Cheatsheet

## 1. Smoke-Test (erste 10 Minuten)

| Check | Befehl / Ort | Erwartung |
|---|---|---|
| Container laufen | `docker ps` | beide `Up` |
| Healthcheck | `curl -sf https://ocpp.<domain>/health` | `{"status":"ok"}` |
| Wallbox verbindet sich | Server-Log | `WebSocket open` für `<OCPP_ID>` |
| BootNotification | Server-Log | `recv ... BootNotification` und `send ... currentTime` |
| Heartbeat | Server-Log alle 30 s | `recv ... Heartbeat` |

## 2. Kurztest (1 Stunde)

```bash
docker logs --since 1h ocpp-server | grep -c "WebSocket open"
docker logs --since 1h ocpp-server | grep -c "WebSocket closed"
```

**Erwartung:** beide Werte ≤ 1 (also genau ein Open beim Start, keine ungeplanten Closes).

In Lovable Cloud Backend → Tabelle `ocpp_message_log` für `<OCPP_ID>` filtern: zwischen zwei Heartbeats darf nie mehr als **60 s** Lücke sein.

## 3. 24-Stunden-Dauertest

Über Nacht laufen lassen. Am Morgen:

```bash
docker logs --since 24h ocpp-server > /tmp/24h.log
grep -c "WebSocket open"   /tmp/24h.log
grep -c "WebSocket closed" /tmp/24h.log
grep "code=" /tmp/24h.log | sort | uniq -c
```

**Erfolgskriterien:**
- Open-Count = 1 (kein Reconnect-Loop)
- Closed-Count = 0 (oder nur durch Wartungs-Reboot erklärbar)
- Keine `code=1006` (abnormaler Close) Häufungen

## 4. Reconnect-Test

1. Wallbox 30 s vom Strom trennen.
2. Wieder einschalten.
3. Logs:
   ```bash
   docker logs --tail 200 ocpp-server | grep <OCPP_ID>
   ```
   Erwartung: ein `WebSocket closed` (Wallbox getrennt), 30–90 s später ein **einzelnes** `WebSocket open` und **eine** `BootNotification`.

**❌ Fehlerbild:** mehrere `BootNotification` in Serie → Charger steht in Reconnect-Loop.

## 5. Remote-Befehl-Test

1. In Lovable: Wallbox auswählen → **„Ladevorgang remote starten“**.
2. Logs:
   ```bash
   docker logs --tail 50 ocpp-server | grep RemoteStartTransaction
   ```
   Erwartung: `Command dispatched` → `Command response received status: Accepted` innerhalb < 3 s.

## 6. Gegenprobe

Wiederhole Schritte 1–5 für `CoCSAG773` und `0311303102122250589`. Verhalten muss identisch sein.

---

## Log-Auswertung-Cheatsheet

| Log-Eintrag | Bedeutung | Was tun |
|---|---|---|
| `WebSocket open` | Verbindung erfolgreich aufgebaut | OK |
| `Auth failed` | Falsches OCPP-Passwort | Passwort in Wallbox vs. Lovable angleichen |
| `Unknown charge point` | OCPP-ID nicht in `charge_points` angelegt | Wallbox in Lovable anlegen |
| `Idle timeout, closing session` | > 120 s kein Frame empfangen | Wallbox-Netzwerk prüfen |
| `WebSocket closed code=1006` | Verbindung abgerissen (Netzwerk) | Wallbox-LAN/WLAN prüfen |
| `WebSocket closed code=1001` | Server hat geschlossen (z. B. Idle) | OK, Wallbox reconnectet |
| `WebSocket closed code=1000` | Sauber geschlossen | OK |
| `Command dispatched` | Remote-Befehl raus | OK |
| `realtime dispatch failed` | Realtime-Subscription Problem | `ENABLE_REALTIME=false` setzen, Polling reicht |

---

## Bugfixing-Workflow

Wenn etwas nicht stimmt, schicke mir bitte:

```bash
docker ps
docker logs --tail 200 ocpp-server
docker logs --tail 100 ocpp-caddy
curl -sf https://ocpp.<domain>/health
```

Plus eine kurze Beschreibung „Was ist passiert? Wann?“.

Mein Fix kommt als ein einziger Befehl, den du auf dem Server ausführst:

```bash
cd /opt/aicono/aicono-ems && git pull && cd docs/ocpp-persistent-server && docker compose up -d --build
```
