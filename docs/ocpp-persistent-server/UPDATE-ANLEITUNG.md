# 🔄 Hetzner OCPP-Server – Update-Anleitung (für absolute Anfänger)

Diese Anleitung zeigt dir, wie du deinen OCPP-Server auf dem Hetzner-Server aktualisierst.
Auf dem Server laufen **zwei getrennte Umgebungen** gleichzeitig:

| Umgebung | Domain | Service-Name | Container-Name | Zweck |
|---|---|---|---|---|
| **Test** | `ocpp.aicono.org` | `ocpp` | `ocpp-server` | Entwicklung, Test-Wallboxen |
| **Live** | `cp.aicono.org` | `ocpp-live` | `ocpp-server-live` | Echte Wallboxen der Kunden |

> **Wichtig:** Lies jeden Schritt erst ganz durch, bevor du ihn ausführst.
> **Ganz wichtig:** `docker compose down` darfst du **niemals** eingeben — das würde beide Umgebungen **und** den Caddy-Proxy gleichzeitig stoppen.

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
- **Windows:** „Windows Terminal" oder „PowerShell" (im Startmenü tippen und öffnen)
- **Mac:** „Terminal" (Spotlight: `Cmd + Leertaste`, dann „Terminal" tippen)

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
/opt/aicono/aicono-ems/docs/ocpp-persistent-server/docker-compose.yml
```

> 📝 **Merk dir den Pfad** (alles **vor** `/docker-compose.yml`).
> Das ist dein Projektordner.

### Schritt 2b: In den Ordner wechseln

Tippe `cd ` (mit Leerzeichen am Ende) und füge den Pfad ein. Beispiel:

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server
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

## 4️⃣ Update durchführen

> **Wichtig:** Du musst weiterhin im Projektordner sein. Falls unsicher:
> ```bash
> pwd
> ```
> Das zeigt dir den aktuellen Ordner.

Entscheide jetzt, **welche Umgebung** du aktualisieren möchtest:
- Nur die **Test-Umgebung** (`ocpp.aicono.org`)? → Weiter mit **4A**
- Nur die **Live-Umgebung** (`cp.aicono.org`)? → Weiter mit **4B**
- **Beide** gleichzeitig? → Führe zuerst **4A** durch, dann **4B**.

> ⚠ **Achtung bei Live:** Während des Updates (ca. 1–2 Minuten) kann es kurz zu Verbindungsunterbrechungen bei den Live-Wallboxen kommen. Aktualisiere die Live-Umgebung daher nur zu ruhigen Zeiten.

---

### 4A — Test-Umgebung aktualisieren (`ocpp.aicono.org`)

Führe nacheinander diese **drei** Befehle aus (jeden einzeln, erst Enter, dann warten,
dann den nächsten):

#### Befehl 1 — Test-Container stoppen:

```bash
docker compose stop ocpp
```

Erwartet:
```
[+] Stopping 1/1
 ✔ Container ocpp-server  Stopped
```

#### Befehl 2 — Test-Container neu bauen (dauert 1–3 Minuten):

```bash
docker compose build --no-cache ocpp
```

Du siehst viele Zeilen mit `=> [build x/y]`. Am Ende:
```
 ✔ Service ocpp  Built
```

#### Befehl 3 — Test-Container wieder starten:

```bash
docker compose up -d ocpp
```

Erwartet:
```
[+] Running 1/1
 ✔ Container ocpp-server  Started
```

> ✅ Test-Umgebung ist aktualisiert.

---

### 4B — Live-Umgebung aktualisieren (`cp.aicono.org`)

Führe nacheinander diese **drei** Befehle aus (jeden einzeln, erst Enter, dann warten,
dann den nächsten):

#### Befehl 1 — Live-Container stoppen:

```bash
docker compose stop ocpp-live
```

Erwartet:
```
[+] Stopping 1/1
 ✔ Container ocpp-server-live  Stopped
```

#### Befehl 2 — Live-Container neu bauen (dauert 1–3 Minuten):

```bash
docker compose build --no-cache ocpp-live
```

Du siehst viele Zeilen mit `=> [build x/y]`. Am Ende:
```
 ✔ Service ocpp-live  Built
```

#### Befehl 3 — Live-Container wieder starten:

```bash
docker compose up -d ocpp-live
```

Erwartet:
```
[+] Running 1/1
 ✔ Container ocpp-server-live  Started
```

> ✅ Live-Umgebung ist aktualisiert.

---

## 5️⃣ Prüfen, ob alles läuft

### Test A — Laufen die Container?

```bash
docker compose ps
```

Du solltest **drei Zeilen** sehen — Caddy und beide OCPP-Server — jeweils mit `Up` oder `healthy` in der Spalte „STATUS":

```
NAME               STATUS                       PORTS
ocpp-caddy         Up 10 days                   0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
ocpp-server        Up 2 minutes (healthy)       8080/tcp
ocpp-server-live   Up 2 minutes (healthy)       8080/tcp
```

> ☝ Die genauen Zeiten (z. B. `2 minutes` oder `10 days`) sind egal — wichtig ist,
> dass bei beiden `healthy` steht.

### Test B — Antwortet die Test-Umgebung?

```bash
curl https://ocpp.aicono.org/health
```

Erwartet (in einer Zeile):
```json
{"status":"ok","uptimeSeconds":12,"sessions":0}
```

### Test C — Antwortet die Live-Umgebung?

```bash
curl https://cp.aicono.org/health
```

Erwartet (in einer Zeile):
```json
{"status":"ok","uptimeSeconds":12,"sessions":0}
```

> ✅ Wenn bei **Test B** und/oder **Test C** die JSON-Antwort kommt: **Update erfolgreich.**

---

## 🆘 Hilfe-Tabelle

| Symptom | Lösung |
|---|---|
| `not a git repository` | Falsches Verzeichnis → zurück zu Schritt 2 |
| `git pull` Konflikt | `git stash` → `git pull` → `git stash pop` |
| `docker: command not found` | Docker nicht installiert → David fragen |
| `permission denied` bei `docker` | `sudo` davor setzen, z. B. `sudo docker compose ps` |
| Container startet nicht | `docker compose logs ocpp` oder `docker compose logs ocpp-live` ausführen, Ausgabe an David schicken |
| `curl` auf `/health` schlägt fehl | `docker compose restart caddy` und nochmal probieren |
| Wallboxen verbinden nicht mehr | In Hetzner-Firewall prüfen, ob Port 80/443 offen sind |

---

✅ **Fertig.** Dein OCPP-Server läuft jetzt mit dem aktuellen Code.

> **Tipp:** Nach einem Update immer einen kurzen Funktionstest im EMS machen
> (Simulator-Tab → Verbinden), um sicherzustellen, dass Wallboxen korrekt
> ansprechbar sind.
