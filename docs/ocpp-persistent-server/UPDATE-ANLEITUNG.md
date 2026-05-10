# 🔄 Hetzner OCPP-Server – Update-Anleitung (für absolute Anfänger)

Diese Anleitung zeigt dir, wie du deinen OCPP-Server auf dem Hetzner-Server aktualisierst.
Du brauchst **keine Programmierkenntnisse** – du kopierst Befehle aus den grauen Kästen
und fügst sie ins Terminal ein.

> **Wichtig:** Lies jeden Schritt erst ganz durch, bevor du ihn ausführst.

---

## ⚠ Wie kopiere ich Befehle? (Wichtig für Anfänger)

In dieser Anleitung siehst du graue Kästen mit Befehlen, z. B.:

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

## 1️⃣ Auf den Hetzner-Server einloggen

Öffne ein Terminal-Programm:
- **Windows:** „Windows Terminal“ oder „PowerShell“ (im Startmenü tippen und öffnen)
- **Mac:** „Terminal“ (Spotlight: `Cmd + Leertaste`, dann „Terminal" tippen)

Gib folgendes ein (ersetze `DEINE.SERVER.IP` durch die echte IP deines Hetzner-Servers,
z. B. `91.99.123.45`):

```bash
ssh root@DEINE.SERVER.IP
```

Was passiert jetzt?
- Beim **ersten Mal** fragt es: `Are you sure you want to continue connecting (yes/no)?`
  → Tippe `yes` und drücke Enter.
- Dann fragt es nach dem **Passwort**. Tippe es ein (du siehst beim Tippen **nichts** –
  das ist normal). Dann Enter.

Wenn alles klappt, siehst du eine Zeile wie:
```
root@OCPP-server:~#
```

> ✅ Du bist jetzt auf dem Server.

---

## 2️⃣ Den Projektordner finden

Wenn du direkt `git pull` eingibst und die Fehlermeldung `fatal: not a git repository`
bekommst, bedeutet das: **Du bist im falschen Ordner.**

Lass uns den richtigen Ordner suchen.

### Schritt 2a: Ordner automatisch finden

Kopiere diesen Befehl ins Terminal:

```bash
find / -name "docker-compose.yml" -path "*ocpp*" 2>/dev/null
```

Das dauert 5–30 Sekunden. Danach erscheint z. B.:

```
/opt/ocpp-persistent-server/docker-compose.yml
```

oder:

```
/root/ocpp-persistent-server/docker-compose.yml
```

> 📝 **Merk dir den Pfad** (alles **vor** `/docker-compose.yml`).
> Das ist dein Projektordner.

### Schritt 2b: In den Ordner wechseln

Tippe `cd ` (mit Leerzeichen am Ende) und füge den Pfad ein. Beispiel:

```bash
cd /opt/ocpp-persistent-server
```

> Falls dein Pfad anders war, nimm **deinen** Pfad.

### Schritt 2c: Prüfen, dass du richtig bist

```bash
ls
```

Du solltest Dateien sehen, in denen **`docker-compose.yml`** und **`Dockerfile`** vorkommen.
Wenn ja: ✅ Perfekt, weiter mit Schritt 3.

> ❌ Falls `find` gar nichts findet: Der OCPP-Server ist auf diesem Server noch nicht
> installiert. Dann brauchst du die **Erstinstallations-Anleitung** – melde dich bei David.

---

## 3️⃣ Den neuen Code von GitHub holen

Jetzt holst du die neueste Version. Du musst im Projektordner sein (Schritt 2).

```bash
git pull
```

**Erwartete Ausgabe:**

```
Updating a1b2c3d..e4f5g6h
Fast-forward
 src/auth.ts     | 12 ++++++++++--
 src/index.ts    | 18 +++++++++++++++---
 3 files changed, 30 insertions(+), 5 deletions(-)
```

Oder:
```
Already up to date.
```

> ✅ In beiden Fällen ist alles in Ordnung.

### 🆘 Falls Fehlermeldungen kommen:

| Fehlermeldung | Was tun |
|---|---|
| `Your local changes … would be overwritten` | Nacheinander eingeben: `git stash` ⏎ , dann `git pull` ⏎ , dann `git stash pop` ⏎ |
| `Permission denied (publickey)` | Der Server hat keinen GitHub-Zugriff. → David fragen. |
| `fatal: not a git repository` | Du bist im falschen Ordner. → Zurück zu Schritt 2. |

---

## 4️⃣ Den Server neu bauen und starten

> **Wichtig:** Du musst weiterhin im Projektordner sein. Falls unsicher:
> ```bash
> pwd
> ```
> Das zeigt dir den aktuellen Ordner.

Führe nacheinander diese **drei** Befehle aus (jeden einzeln, erst Enter, dann warten,
dann den nächsten):

### Befehl 1 — Alles stoppen:

```bash
docker compose down
```

Erwartet:
```
[+] Running 3/3
 ✔ Container ocpp-caddy   Removed
 ✔ Container ocpp-server  Removed
 ✔ Network …_ocppnet      Removed
```

### Befehl 2 — Neu bauen (dauert 1–3 Minuten):

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

Erwartet:
```
[+] Running 3/3
 ✔ Network …_ocppnet      Created
 ✔ Container ocpp-server  Started
 ✔ Container ocpp-caddy   Started
```

---

## 5️⃣ Prüfen, ob alles läuft

### Test A — Laufen die Container?

```bash
docker compose ps
```

Du solltest **zwei Zeilen** sehen, beide mit `running` oder `healthy` in der Spalte „STATUS":

```
NAME           STATUS                   PORTS
ocpp-caddy     Up 30 seconds            0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
ocpp-server    Up 30 seconds (healthy)  8080/tcp
```

### Test B — Antwortet der Server?

```bash
curl https://ocpp.aicono.org/health
```

Erwartet (in einer Zeile):
```json
{"status":"ok","uptimeSeconds":12,"sessions":0}
```

✅ Wenn das kommt: **Update erfolgreich.**

---

## 🆘 Hilfe-Tabelle

| Symptom | Lösung |
|---|---|
| `not a git repository` | Falsches Verzeichnis → zurück zu Schritt 2 |
| `git pull` Konflikt | `git stash` → `git pull` → `git stash pop` |
| `docker: command not found` | Docker nicht installiert → David fragen |
| `permission denied` bei `docker` | `sudo` davor setzen, z. B. `sudo docker compose ps` |
| Container startet nicht | `docker compose logs ocpp` ausführen, Ausgabe an David schicken |
| `curl` auf `/health` schlägt fehl | `docker compose restart caddy` und nochmal probieren |
| Wallboxen verbinden nicht mehr | In Hetzner-Firewall prüfen, ob Port 80/443 offen sind |

---

✅ **Fertig.** Dein OCPP-Server läuft jetzt mit dem aktuellen Code.

> **Tipp:** Nach einem Update immer einen kurzen Funktionstest im EMS machen
> (Simulator-Tab → Verbinden), um sicherzustellen, dass Wallboxen korrekt
> ansprechbar sind.
