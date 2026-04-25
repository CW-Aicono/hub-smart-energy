# 🔄 Hetzner OCPP-Server – Update-Anleitung (für absolute Anfänger)

Diese Anleitung ist so geschrieben, dass du **nichts wissen** musst.
Du kopierst Befehle aus den grauen Kästen und fügst sie ins Terminal ein.

**Was passiert nach dem Update?**
- ✅ Wallboxen ohne Passwort dürfen sich verbinden
- ✅ Wallboxen ohne Verschlüsselung (`ws://` statt `wss://`) dürfen sich verbinden
- ✅ Alle bisherigen Wallboxen funktionieren weiter wie vorher

**Dauer:** ca. 10 Minuten.

---

## ⚠ Wichtig vorab: Wie kopiere ich Befehle?

In dieser Anleitung siehst du graue Kästen, z. B. so:

```bash
ls
```

So nutzt du sie:
1. **Markieren:** Mit der Maus den Text im Kasten markieren.
2. **Kopieren:** `Strg + C` (Windows/Linux) oder `Cmd + C` (Mac).
3. **In dein Terminal einfügen:** Im Terminal-Fenster mit der **rechten Maustaste** klicken (oder `Strg + Shift + V` / `Cmd + V`).
4. **Ausführen:** `Enter` drücken.

> ☝ Pro Kasten: immer den **kompletten Inhalt** kopieren.

---

## 1️⃣ Auf den Server einloggen

Du bist offenbar schon eingeloggt (siehst etwas wie `root@OCPP-server:~#`).
Falls nicht, öffne dein Terminal (auf dem Mac: "Terminal", auf Windows: "PowerShell" oder "Windows Terminal") und tippe:

```bash
ssh root@DEINE.SERVER.IP
```

(Ersetze `DEINE.SERVER.IP` durch die IP deines Hetzner-Servers, z. B. `91.99.123.45`.)

---

## 2️⃣ Den Projektordner finden

Wenn du nach dem Login `git pull` eingibst und die Fehlermeldung
`fatal: not a git repository` bekommst, bedeutet das:
**Du bist im falschen Ordner.**

Du musst zuerst in den Ordner wechseln, in dem der OCPP-Server installiert ist.
Lass uns ihn suchen.

### Schritt 2a: Den Ordner suchen

Kopiere diesen Befehl ins Terminal:

```bash
find / -name "docker-compose.yml" -path "*ocpp*" 2>/dev/null
```

Nach 5–30 Sekunden sollte etwas wie das hier erscheinen:

```
/opt/ocpp-persistent-server/docker-compose.yml
```

oder z. B.:

```
/root/ocpp-server/docker-compose.yml
/home/deploy/ocpp/docker-compose.yml
```

> 📝 **Merk dir den Pfad** (alles **vor** `/docker-compose.yml`).
> In den Beispielen wäre das:
> - `/opt/ocpp-persistent-server`
> - oder `/root/ocpp-server`
> - oder `/home/deploy/ocpp`

### Schritt 2b: In den Ordner wechseln

Tippe `cd ` (mit Leerzeichen am Ende) und füge dann den gemerkten Pfad an.
Beispiel — bei dir ist es vermutlich:

```bash
cd /opt/ocpp-persistent-server
```

> Falls dein Pfad anders war, nimm **deinen** Pfad statt diesem hier.

### Schritt 2c: Prüfen, dass du richtig bist

```bash
ls
```

Du solltest jetzt eine Liste von Dateien sehen, in der **`docker-compose.yml`** und **`Dockerfile`** vorkommen. Wenn ja: ✅ Perfekt, weiter mit Schritt 3.

> ❌ **Falls `find` in Schritt 2a gar nichts findet:** Dann ist der OCPP-Server auf diesem Server vermutlich noch nie installiert worden. Bitte melde dich bei David — die Erstinstallation ist eine andere Anleitung.

---

## 3️⃣ Den neuen Code aus GitHub holen

Jetzt holst du die neueste Version. Im Projektordner (du bist nach Schritt 2 bereits drin):

```bash
git pull
```

**Erwartete Ausgabe** — irgendwas mit „Updating …" oder „Already up to date.":

```
Updating a1b2c3d..e4f5g6h
Fast-forward
 src/auth.ts     | 12 ++++++++++--
 src/index.ts    | 18 +++++++++++++++---
 Caddyfile       |  5 +++++
 3 files changed, 30 insertions(+), 5 deletions(-)
```

### 🆘 Falls Fehlermeldungen kommen:

| Fehlermeldung | Was tun |
|---|---|
| `Your local changes … would be overwritten` | Tippe nacheinander: `git stash` ⏎ , `git pull` ⏎ , `git stash pop` ⏎ |
| `Permission denied (publickey)` | Der Server hat keinen GitHub-Zugriff. → David fragen. |
| `fatal: not a git repository` | Du bist im falschen Ordner. Zurück zu Schritt 2. |

---

## 4️⃣ Hetzner-Firewall: Port 80 öffnen

Damit Wallboxen ohne Verschlüsselung verbinden können, muss am Server **Port 80** offen sein. Das machst du **nicht im Terminal**, sondern im Browser:

1. Gehe zu **https://console.hetzner.cloud** und logge dich ein.
2. Wähle dein Projekt aus (links oder oben).
3. Klick im linken Menü auf **„Firewalls"**.
4. Klick auf die Firewall, die deinem OCPP-Server zugewiesen ist (meist nur eine vorhanden).
5. Im Tab **„Inbound Rules"** (Eingehend) → Button **„Add Rule"**.
6. Ausfüllen:
   - **Protocol:** `TCP`
   - **Port:** `80`
   - **Source IPs:** leer lassen (= alle erlaubt) **oder** beide Häkchen für „Any IPv4" und „Any IPv6" setzen
   - **Description:** `OCPP WebSocket unverschluesselt`
7. **„Add Rule"** klicken → **„Save"** klicken.

> ✅ Fertig. Port 443 (für `wss://`) ist schon offen — nicht anfassen.

> ❓ **Du nutzt keine Hetzner-Firewall, sondern `ufw`?** Dann im Terminal:
> ```bash
> ufw allow 80/tcp
> ```

---

## 5️⃣ Den Server neu bauen und starten

**Wichtig:** Du musst weiterhin im Projektordner sein (siehe Schritt 2). Falls unsicher:

```bash
pwd
```

(zeigt dir den aktuellen Ordner — sollte der Projektordner sein.)

Dann nacheinander diese **drei** Befehle ausführen (jeden einzeln eingeben und mit Enter bestätigen, **erst** wenn der vorige fertig ist den nächsten):

### Befehl 1 — Alles stoppen:

```bash
docker compose down
```

Erwartete Ausgabe (dauert ~5 Sekunden):
```
[+] Running 3/3
 ✔ Container ocpp-caddy   Removed
 ✔ Container ocpp-server  Removed
 ✔ Network …_ocppnet      Removed
```

### Befehl 2 — Neu bauen (dauert 1–3 Minuten, sei geduldig):

```bash
docker compose build --no-cache ocpp
```

Du siehst viele Zeilen mit `=> [build x/y]`. Am Ende:
```
 ✔ Service ocpp  Built
```

### Befehl 3 — Wieder starten:

```bash
docker compose up -d
```

Erwartete Ausgabe:
```
[+] Running 3/3
 ✔ Network …_ocppnet      Created
 ✔ Container ocpp-server  Started
 ✔ Container ocpp-caddy   Started
```

---

## 6️⃣ Prüfen, ob alles läuft

### Test A — Sind beide Container an?

```bash
docker compose ps
```

Du solltest **zwei Zeilen** sehen, beide mit `running` oder `healthy` in der Spalte „STATUS". Beispiel:

```
NAME           STATUS                   PORTS
ocpp-caddy     Up 30 seconds            0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
ocpp-server    Up 30 seconds (healthy)  8080/tcp
```

### Test B — Antwortet der Server?

```bash
curl https://ocpp.aicono.org/health
```

Erwartete Antwort (in einer Zeile):
```json
{"status":"ok","uptimeSeconds":12,"sessions":0}
```

✅ Wenn das kommt: **Update geschafft.**

### Test C — Live mitlesen, was passiert (optional)

```bash
docker compose logs -f ocpp
```

Lass das Fenster offen — sobald sich gleich (Schritt 7) eine Test-Wallbox verbindet, siehst du das hier in Echtzeit.
Beenden mit **`Strg + C`**.

---

## 7️⃣ Funktionstest im EMS

1. Im EMS einloggen → **Ladepunkte** → **„Ladepunkt anlegen"**.
2. Im Wizard:
   - **Verbindungstyp:** `ws://` (unverschlüsselt) auswählen
   - **Authentifizierung erforderlich:** **AUS** schalten
3. Speichern.
4. Im **Simulator-Tab** den neuen Ladepunkt auswählen → **„Verbinden"**.
5. Im Terminal-Fenster aus Test C sollte erscheinen:
   ```
   Accepting unauthenticated connection {"chargePointId":"…"}
   WebSocket open …
   ```
6. Im EMS sollte die Karte innerhalb von ~1 Sekunde auf 🟢 **Verbunden** wechseln.

---

## 🆘 Hilfe-Tabelle

| Symptom | Lösung |
|---|---|
| `not a git repository` | Du bist im falschen Ordner → zurück zu Schritt 2 |
| `git pull` Konflikt | `git stash` → `git pull` → `git stash pop` |
| `docker: command not found` | Docker ist nicht installiert → David fragen |
| `permission denied` bei `docker` | Tippe `sudo` vor den Befehl, z. B. `sudo docker compose ps` |
| Container startet nicht | `docker compose logs ocpp` ausführen, Ausgabe an David schicken |
| `curl` auf `/health` schlägt fehl | `docker compose restart caddy` und nochmal probieren |
| Wallbox verbindet trotz Port 80 nicht | In Hetzner-Firewall prüfen, ob Port 80 wirklich gespeichert wurde |
| `wss://`-Box geht plötzlich nicht mehr | `docker compose restart caddy` |

---

## 📝 Was wurde technisch geändert?

| Datei | Änderung |
|---|---|
| `src/auth.ts` | Liest jetzt zusätzlich `auth_required` und `connection_protocol` aus der Datenbank. |
| `src/index.ts` | Wenn `auth_required = false` oder kein Passwort gesetzt: Verbindung wird **ohne Passwort** akzeptiert (sauber im Log vermerkt). |
| `Caddyfile` | Zusätzlicher `:80`-Listener für unverschlüsselte `ws://`-Verbindungen. |

Kein Datenbankschema-Update nötig — das hat die EMS-Migration bereits erledigt.

---

✅ **Fertig.** Ab sofort akzeptiert dein Hetzner-Server Wallboxen mit oder ohne Passwort, über `ws://` oder `wss://`.
