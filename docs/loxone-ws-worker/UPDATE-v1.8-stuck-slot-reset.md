# 🔄 Update auf v1.8 – Stuck-Slot-Reset (Phase 7.8)

**Ziel:** Der Worker erkennt jetzt prozessintern hängende Miniserver-Slots und baut sie selbstständig neu auf. Kein manueller `docker restart` mehr nötig, wenn einzelne Miniserver plötzlich nicht mehr per WebSocket verbunden sind, während andere im selben Worker laufen.

**Neu in dieser Version:**
- `NO_OPEN_TIMEOUT_MIN` (Standard: 15 Minuten): Wenn ein Slot so lange keinen erfolgreichen `ws-open` hatte, obwohl andere Serials gesund laufen, wird der Slot komplett zurückgesetzt (DNS-Cache, WS-Handle, Auth-State, Backoff).
- Neue Spalte **„Letzter WS-Open"** in der Gateway-Flotte.

---

## 1️⃣ Per Putty auf den Hetzner-Server einloggen

1. Putty öffnen.
2. Bei **Host Name (or IP address)** die Server-IP eintragen.
3. Port `22`, Connection type `SSH`.
4. Auf **Open** klicken.
5. Als Benutzer `root` einloggen.

---

## 2️⃣ Laufende Worker prüfen

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

Du solltest beide Container sehen:

```
NAMES                         IMAGE                      STATUS
loxone-ws-worker-live         loxone-ws-worker-live      Up ... (healthy)
loxone-ws-worker-lovable      loxone-ws-worker-lovable   Up ... (healthy)
```

---

## 3️⃣ Umgebungsvariablen sichern

```bash
mkdir -p /root/aicono-worker-backup
docker inspect loxone-ws-worker-live    --format '{{range .Config.Env}}{{println .}}{{end}}' > /root/aicono-worker-backup/live.env.txt
docker inspect loxone-ws-worker-lovable --format '{{range .Config.Env}}{{println .}}{{end}}' > /root/aicono-worker-backup/lovable.env.txt
```

Kontrolle:

```bash
head -n 5 /root/aicono-worker-backup/live.env.txt
head -n 5 /root/aicono-worker-backup/lovable.env.txt
```

Beide Dateien müssen `SUPABASE_URL` und `GATEWAY_API_KEY` enthalten.

---

## 4️⃣ Neues Image bauen

Auf dem Hetzner-Server liegt das Worker-Repository unter `/opt/loxone-ws-worker`. Das neue `index.ts` muss dort eingespielt sein (wird durch Lovable gepusht).

```bash
cd /opt/loxone-ws-worker
docker build -t loxone-ws-worker:v1.8 .
```

Der Build dauert ca. 1–2 Minuten.

---

## 5️⃣ Live-Worker aktualisieren (Vorsicht: echte Kunden-Miniserver)

> Führe diesen Schritt nur zu ruhigen Zeiten durch. Es gibt einen kurzen Verbindungsausfall (1–2 Minuten).

### 5.1 Aktuelle Umgebungsvariablen aus dem laufenden Container auslesen

```bash
docker inspect loxone-ws-worker-live --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/live.env
```

### 5.2 Alten Container stoppen und entfernen

```bash
docker stop loxone-ws-worker-live
docker rm loxone-ws-worker-live
```

### 5.3 Neuen Container starten

```bash
docker run -d \
  --name loxone-ws-worker-live \
  --restart unless-stopped \
  --env-file /tmp/live.env \
  -p 8081:8080 \
  loxone-ws-worker:v1.8
```

> Optional: `NO_OPEN_TIMEOUT_MIN` anpassen (z. B. auf 10 Minuten):
> Füge `--env NO_OPEN_TIMEOUT_MIN=10` zusätzlich ein.

### 5.4 Logs prüfen

```bash
docker logs -f --tail 100 loxone-ws-worker-live
```

Du solltest in den ersten Zeilen sehen:

```
[StuckSlot] aktiv: prüft alle 60s, Schwelle 15min
```

Beende die Log-Ansicht mit `Strg + C`.

---

## 6️⃣ Test-Worker aktualisieren

```bash
docker inspect loxone-ws-worker-lovable --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/lovable.env
docker stop loxone-ws-worker-lovable
docker rm loxone-ws-worker-lovable
docker run -d \
  --name loxone-ws-worker-lovable \
  --restart unless-stopped \
  --env-file /tmp/lovable.env \
  -p 8080:8080 \
  loxone-ws-worker:v1.8
```

---

## 7️⃣ Abschluss prüfen

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

Beide Container sollten mit dem neuen Image `loxone-ws-worker:v1.8` laufen.

---

## ❓Falls etwas schiefgeht

Sollte ein Worker nicht starten:

```bash
docker logs --tail 200 loxone-ws-worker-live
```

Fehlermeldung kopieren und an David weiterleiten.

Sollte der neue Worker Probleme machen, kannst du schnell auf das alte Image zurückgehen (ersetze `<altes-image-tag>` durch das vorherige Tag, z. B. `latest`):

```bash
docker stop loxone-ws-worker-live
docker rm loxone-ws-worker-live
docker run -d \
  --name loxone-ws-worker-live \
  --restart unless-stopped \
  --env-file /tmp/live.env \
  -p 8081:8080 \
  loxone-ws-worker:<altes-image-tag>
```
