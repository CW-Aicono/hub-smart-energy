# 🔄 Loxone-WS-Worker Update – Schritt für Schritt (für absolute Anfänger)

Auf dem Hetzner-Server laufen **zwei Loxone-Worker gleichzeitig**:

| Umgebung | Container-Name | Port | Backend (SUPABASE_URL) | Zweck |
|---|---|---|---|---|
| **Live** | `loxone-ws-worker-live` | `8081` | `https://api-ems.aicono.org` | Echte Kunden-Miniserver |
| **Test / Lovable** | `loxone-ws-worker-lovable` | `8080` | Lovable Cloud (Staging) | Entwicklung, Test-Miniserver |

> **Wichtig vorab:**
> - Lies jeden Schritt **komplett** durch, bevor du ihn ausführst.
> - **Niemals** `docker rm -f` ausführen, bevor du in Schritt 3 die Umgebungsvariablen des Containers gesichert hast — sonst ist der API-Key verloren.
> - Aktualisiere die **Live**-Umgebung nur zu ruhigen Zeiten (kurzer Verbindungsausfall der Miniserver für 1–2 Minuten möglich).

---

## Wie kopiere ich Befehle?

Graue Kästen enthalten Befehle:

```bash
ls
```

1. Mit der Maus **den kompletten Text im Kasten markieren**.
2. `Strg + C` (Mac: `Cmd + C`) zum Kopieren.
3. Im Putty-Fenster mit der **rechten Maustaste** klicken (das ist Einfügen).
4. `Enter` drücken.

---

## 1️⃣ Per Putty auf den Hetzner-Server einloggen

1. Putty öffnen.
2. Bei **Host Name (or IP address)** die Server-IP eintragen (z. B. `91.99.123.45`).
3. Port `22`, Connection type `SSH`.
4. Auf **Open** klicken.
5. Als Benutzer `root` eingeben, `Enter`.
6. Passwort eingeben (du siehst dabei **nichts** – das ist normal), `Enter`.

Wenn alles klappt, siehst du am Ende so etwas wie:

```
root@k8s-control-1:~#
```

✅ Du bist auf dem Server.

---

## 2️⃣ Beide laufenden Worker prüfen

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
```

Du solltest **beide** Container sehen, z. B.:

```
NAMES                       IMAGE                       PORTS                    STATUS
loxone-ws-worker-live       loxone-ws-worker-live       0.0.0.0:8081->8080/tcp   Up 3 days (healthy)
loxone-ws-worker-lovable    loxone-ws-worker-lovable    0.0.0.0:8080->8080/tcp   Up 3 days (healthy)
```

> Falls einer der beiden fehlt: **Stopp.** Bitte David informieren, nicht weitermachen.

---

## 3️⃣ Umgebungsvariablen (API-Key etc.) beider Container sichern

**Dieser Schritt ist Pflicht.** Wird er übersprungen, kann der Worker nach dem Update nicht mehr starten.

```bash
mkdir -p /root/aicono-worker-backup
docker inspect loxone-ws-worker-live    --format '{{range .Config.Env}}{{println .}}{{end}}' > /root/aicono-worker-backup/live.env.txt
docker inspect loxone-ws-worker-lovable --format '{{range .Config.Env}}{{println .}}{{end}}' > /root/aicono-worker-backup/lovable.env.txt
```

Kontrolle – hier müssen **SUPABASE_URL** und **GATEWAY_API_KEY** auftauchen:

```bash
grep -E "SUPABASE_URL|GATEWAY_API_KEY|WORKER_HOST|BRIDGE_WORKER_NAME" /root/aicono-worker-backup/live.env.txt
grep -E "SUPABASE_URL|GATEWAY_API_KEY|WORKER_HOST|BRIDGE_WORKER_NAME" /root/aicono-worker-backup/lovable.env.txt
```

Wenn bei einem der beiden **kein** `GATEWAY_API_KEY` erscheint: **abbrechen** und David fragen.

---

## 4️⃣ In den Projektordner wechseln

Suchen, wo der Worker-Quellcode liegt:

```bash
find / -name "index.ts" -path "*loxone-ws-worker*" 2>/dev/null
```

Erwartet z. B.:

```
/opt/loxone-ws-worker/index.ts
```

In den Ordner wechseln (Pfad ggf. an dein Ergebnis anpassen):

```bash
cd /opt/loxone-ws-worker
```

Prüfen, dass du richtig bist:

```bash
ls
```

Du solltest u. a. `index.ts`, `Dockerfile`, `package.json` sehen. ✅

---

## 5️⃣ Alte Programmdateien sichern

```bash
cp index.ts   /root/aicono-worker-backup/index.ts.bak
cp Dockerfile /root/aicono-worker-backup/Dockerfile.bak
```

---

## 6️⃣ Neue Dateien vom Server holen bzw. einspielen

### Variante A – wenn der Ordner ein Git-Repo ist

```bash
git pull
```

Erwartet: `Updating …` oder `Already up to date.`

### Variante B – wenn `git pull` mit `fatal: not a git repository` antwortet

Dann müssen die Dateien manuell ersetzt werden:

1. In Lovable die Datei `docs/loxone-ws-worker/index.ts` öffnen, **kompletten Inhalt kopieren**.
2. Auf dem Server:
   ```bash
   nano index.ts
   ```
3. Mit `Strg + K` alte Zeilen löschen (oder alles markieren + Entf), dann Inhalt mit **Rechtsklick** einfügen.
4. Speichern: `Strg + O`, `Enter`. Schließen: `Strg + X`.
5. Das gleiche für `Dockerfile`, falls es sich geändert hat:
   ```bash
   nano Dockerfile
   ```

Kurz prüfen, dass die Version stimmt:

```bash
grep -n "WORKER_VERSION" index.ts | head -3
grep -n "FLUSH_INTERVAL_MS" Dockerfile
```

Erwartet in `Dockerfile`:

```
ENV FLUSH_INTERVAL_MS=60000
```

---

## 7️⃣ Neue Docker-Images bauen

**Beide** Images neu bauen (dauert je 1–3 Minuten):

```bash
docker build -t loxone-ws-worker-live    .
docker build -t loxone-ws-worker-lovable .
```

Am Ende muss jeweils stehen:

```
Successfully tagged loxone-ws-worker-live:latest
Successfully tagged loxone-ws-worker-lovable:latest
```

---

## 8️⃣ Neuen Start-Befehl aus der Sicherung zusammenbauen

Sicherungen anzeigen:

```bash
cat /root/aicono-worker-backup/live.env.txt
cat /root/aicono-worker-backup/lovable.env.txt
```

Wichtig sind aus jeder Datei diese Zeilen:

- `SUPABASE_URL=…`
- `GATEWAY_API_KEY=…`
- `WORKER_HOST=…`
- `BRIDGE_WORKER_NAME=…`

Sie werden gleich in die `docker run`-Befehle eingesetzt.

---

## 9️⃣ Live-Worker ersetzen

> ⚠ Ab hier fällt der Live-Worker für ca. 1 Minute aus.

```bash
docker rm -f loxone-ws-worker-live
```

Direkt danach starten (Werte für `GATEWAY_API_KEY`, `WORKER_HOST`, `BRIDGE_WORKER_NAME` **aus der Sicherung** einsetzen):

```bash
docker run -d --restart=always --name loxone-ws-worker-live \
  -p 8081:8080 \
  -e SUPABASE_URL=https://api-ems.aicono.org \
  -e GATEWAY_API_KEY=HIER_LIVE_KEY_AUS_SICHERUNG \
  -e LOG_LEVEL=info \
  -e FLUSH_INTERVAL_MS=60000 \
  -e WORKER_HOST=hetzner-prod-1 \
  -e BRIDGE_WORKER_NAME=hetzner-bridge-live \
  loxone-ws-worker-live
```

Prüfen:

```bash
docker ps | grep loxone-ws-worker-live
docker logs --tail 50 loxone-ws-worker-live
```

In den Logs muss stehen:
- Verbindung zu `https://api-ems.aicono.org`
- „Meter geladen" o. ä.
- **Keine** `401 Unauthorized`

---

## 🔟 Test-/Lovable-Worker ersetzen

```bash
docker rm -f loxone-ws-worker-lovable
```

Direkt danach starten (`GATEWAY_API_KEY` und `SUPABASE_URL` aus der Sicherung `lovable.env.txt` übernehmen):

```bash
docker run -d --restart=always --name loxone-ws-worker-lovable \
  -p 8080:8080 \
  -e SUPABASE_URL=HIER_LOVABLE_URL_AUS_SICHERUNG \
  -e GATEWAY_API_KEY=HIER_LOVABLE_KEY_AUS_SICHERUNG \
  -e LOG_LEVEL=info \
  -e FLUSH_INTERVAL_MS=60000 \
  -e WORKER_HOST=hetzner-staging-1 \
  -e BRIDGE_WORKER_NAME=hetzner-bridge-test \
  loxone-ws-worker-lovable
```

Prüfen:

```bash
docker ps | grep loxone-ws-worker-lovable
docker logs --tail 50 loxone-ws-worker-lovable
```

Auch hier: Verbindung ok, **kein** `401`.

---

## 1️⃣1️⃣ Abschlusskontrolle

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Beide Container müssen `Up … (healthy)` zeigen.

Health-Endpoints:

```bash
curl -s http://127.0.0.1:8080/healthz
curl -s http://127.0.0.1:8081/healthz
```

Erwartet jeweils: `ok` bzw. eine JSON-Antwort mit `status`.

Danach im AICONO-Dashboard prüfen:
- **Verwaltung → Integrationen → Loxone**: alle Miniserver stehen wieder auf **Verbunden**.
- Für Live-Kunden zusätzlich: Live-Werte laufen wieder ins Dashboard.

---

## 🆘 Hilfe-Tabelle

| Symptom | Was tun |
|---|---|
| `fatal: not a git repository` | Weiter mit **Variante B** in Schritt 6 (`nano`). |
| `401 Unauthorized` in Logs | Falscher `GATEWAY_API_KEY`. Im Super-Admin unter **Gateways → Worker-Key** neu ausstellen (Key beginnt mit `aic_worker_…` bzw. `g_work_…`). |
| Container startet nicht | `docker logs --tail 100 <name>` – Ausgabe an David schicken. |
| Aus Versehen `docker rm -f` ohne Sicherung | **Nicht** weitermachen. David kontaktieren – Key kann nur mit Backup wiederhergestellt oder neu erzeugt werden. |
| `permission denied` bei Docker | Mit `sudo` vorne dran erneut versuchen. |

---

## ↩ Notfall-Rollback

Falls der neue Worker nicht sauber läuft:

```bash
cd /opt/loxone-ws-worker
cp /root/aicono-worker-backup/index.ts.bak   index.ts
cp /root/aicono-worker-backup/Dockerfile.bak Dockerfile

docker build -t loxone-ws-worker-live    .
docker build -t loxone-ws-worker-lovable .
```

Dann Schritte 9 und 10 mit den **gleichen** Werten aus der Sicherung erneut ausführen.

---

✅ **Fertig.** Beide Loxone-Worker laufen jetzt mit der aktuellen Version.
