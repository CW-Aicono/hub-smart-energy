# 🔄 Hetzner OCPP-Server – Update-Anleitung (Idiot-Proof)

Diese Anleitung beschreibt Schritt für Schritt, wie du das Update für den OCPP-Server auf deinem Hetzner-Server einspielst, damit:

- ✅ Wallboxen ohne Passwort sich verbinden können (`auth_required = false`)
- ✅ Wallboxen unverschlüsselt über `ws://` (Port 80) verbinden können
- ✅ Bestehende `wss://`-Verbindungen weiter funktionieren

**Du brauchst nur Copy & Paste.** Geschätzte Dauer: **5 Minuten**.

---

## 🧰 Voraussetzungen

- SSH-Zugang zum Hetzner-Server (du kennst Server-IP + SSH-Key oder Passwort)
- Der Server hat das Repo schon einmal geklont und läuft per Docker Compose
- Der Ordner ist üblicherweise: `/opt/ocpp-persistent-server` (falls anders, einfach `cd` dorthin anpassen)

---

## 1️⃣ Auf den Server einloggen

Öffne ein Terminal auf deinem PC/Mac:

```bash
ssh root@DEINE.SERVER.IP
```

> Wenn du einen anderen User verwendest, ersetze `root` entsprechend (z. B. `ssh deploy@…`).

---

## 2️⃣ In den Projektordner wechseln und neuen Code holen

```bash
cd /opt/ocpp-persistent-server
git pull
```

> ⚠ Falls `git pull` Konflikte meldet, führe vorher `git stash` aus und probier es erneut.

---

## 3️⃣ Hetzner-Firewall: Port 80 öffnen (für `ws://`)

Logge dich in der **Hetzner Cloud Console** ein → wähle dein Projekt → links **Firewalls** → klicke deine Firewall an.

Füge eine eingehende Regel hinzu:

| Protokoll | Port | Quelle              | Beschreibung               |
|-----------|------|---------------------|----------------------------|
| TCP       | 80   | `0.0.0.0/0`, `::/0` | OCPP WebSocket (unverschl.) |

Falls du keine Hetzner-Firewall, sondern `ufw` auf dem Server nutzt:

```bash
ufw allow 80/tcp
ufw status
```

> Port **443** (für `wss://`) ist üblicherweise schon offen — **nicht ändern**.

---

## 4️⃣ Container neu bauen und starten

Im Projektordner:

```bash
docker compose down
docker compose build --no-cache ocpp
docker compose up -d
```

> Erklärung in einem Satz: Container werden gestoppt, der OCPP-Server-Container wird mit dem neuen Code frisch gebaut, dann startet alles wieder im Hintergrund. Der Caddy-Container muss **nicht** neu gebaut werden — er wurde nur in der `Caddyfile` aktualisiert und liest sie beim Start neu ein.

---

## 5️⃣ Prüfen, dass alles läuft

### a) Container-Status

```bash
docker compose ps
```

Beide Container (`ocpp-server` und `ocpp-caddy`) müssen **`running`** und **`healthy`** zeigen.

### b) Health-Endpoint testen

```bash
curl https://ocpp.aicono.org/health
```

Erwartete Antwort:

```json
{"status":"ok","uptimeSeconds":12,"sessions":0}
```

### c) Logs live mitlesen (für die ersten Minuten)

```bash
docker compose logs -f ocpp
```

Mit `Ctrl + C` beendest du das Mitlesen.

---

## 6️⃣ Funktions-Test im EMS

1. Im EMS einen Test-Ladepunkt anlegen (z. B. „TestBox 01")
2. Verbindungs-Konfiguration: **`ws://`** und **Passwort AUS** (zum Testen der neuen Funktionalität)
3. Im Simulator-Tab „TestBox 01" auswählen → **Verbinden**
4. In den Server-Logs (`docker compose logs -f ocpp`) muss erscheinen:

```
Accepting unauthenticated connection {"chargePointId":"…"}
WebSocket open …
```

Im EMS sollte die Karte innerhalb von ~1 Sekunde auf 🟢 **Verbunden** wechseln.

---

## 🆘 Falls etwas nicht klappt

| Symptom | Lösung |
|---------|--------|
| `git pull` Konflikt | `git stash && git pull && git stash pop` |
| Container startet nicht | `docker compose logs ocpp` lesen, Fehler googeln oder im Lovable-Chat posten |
| `curl` auf `/health` schlägt fehl | Caddy-Container läuft nicht: `docker compose restart caddy` |
| Wallbox kommt trotz Port 80 nicht an | In Hetzner-Firewall prüfen, ob Port 80 wirklich offen ist (TCP, IPv4 + IPv6) |
| `wss://`-Box geht plötzlich nicht mehr | `docker compose logs caddy` — meist Zertifikats-Renewal-Issue, einmal `docker compose restart caddy` löst es |

---

## 📝 Was wurde mit diesem Update geändert?

| Datei | Änderung |
|-------|----------|
| `src/auth.ts` | `loadChargePoint` liest jetzt `auth_required` und `connection_protocol` mit aus. |
| `src/index.ts` | Wenn `auth_required = false` oder kein Passwort gesetzt ist → Verbindung wird **ohne Basic-Auth** akzeptiert (sauber geloggt). |
| `Caddyfile` | Zusätzlicher `:80`-Listener leitet `ws://`-Connects ungesichert an den Node-Container weiter. |

Kein Datenbankschema-Update nötig — die EMS-Migration hat das bereits erledigt (`charge_points.connection_protocol`, `auth_required`, `certificate_required`, `certificate_type`).

---

✅ **Fertig.** Ab sofort akzeptiert dein Hetzner-Server Wallboxen mit oder ohne Passwort, über `ws://` oder `wss://`.
