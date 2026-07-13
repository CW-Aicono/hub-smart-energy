# Update: Wallbox „Cp" korrekt erkennen – sichere Vorgehensweise

> **Wichtig vorab:** Die vorherige Fassung dieser Anleitung war falsch gefährlich, weil sie `docker rm -f` zu früh genannt hat.
> **Niemals zuerst löschen.** Erst prüfen, sichern und den neuen Start-Befehl vorbereiten. Erst wenn alle Werte bekannt sind, wird der alte Container ersetzt.

---

## Schnellstart Live (Copy/Paste über Putty)

Nur nutzen, wenn der alte Container bereits gelöscht wurde und Sie den Worker so schnell wie möglich wieder starten müssen.

### 1. API-Key aus der Live-App holen

1. `https://ems-pro.aicono.org` öffnen.
2. **Einstellungen → Integrationen → API** öffnen.
3. Beim **API-Key** auf das Auge klicken, kopieren.
   Falls keiner mehr sichtbar ist: **Neuen API-Key erzeugen** und sofort kopieren.

Der Key beginnt mit `g_work_...`.

### 2. In Putty auf dem Hetzner-Server einloggen und diesen Block ausführen

Ersetzen Sie **nur** die Zeile `GATEWAY_API_KEY=...` durch Ihren echten Key. Der Rest bleibt exakt wie unten:

```bash
cd /opt/loxone-ws-worker || cd /opt/loxone-ws-worker-live
docker build -t loxone-ws-worker .

docker rm -f loxone-ws-worker 2>/dev/null

docker run -d --restart=always --name loxone-ws-worker \
  -p 8080:8080 \
  -e SUPABASE_URL=https://api-ems.aicono.org \
  -e GATEWAY_API_KEY=g_work_HIER_IHREN_KEY_EINFUEGEN \
  -e LOG_LEVEL=info \
  -e WORKER_HOST=hetzner-prod-1 \
  -e BRIDGE_WORKER_NAME=loxone-ws-worker \
  loxone-ws-worker
```

### 3. Prüfen, ob er läuft

```bash
docker ps | grep loxone-ws-worker
docker logs --tail 50 loxone-ws-worker
```

In den Logs sollte stehen, dass der Worker mit `https://api-ems.aicono.org` verbindet und Meter geladen werden. **Keine** Meldung `401 Unauthorized` – dann ist der Key richtig.

> **Sicherheitshinweis:** Sobald der Worker läuft, den API-Key aus dem Chat-Verlauf **nicht** weiterverwenden. Der aktuell in der App sichtbare Key `g_work_Pp7R6Wp8MwgUgCw0zhfzDAs9jCmSdgvh` gilt als kompromittiert – bitte in der App **neu ausstellen** und den alten deaktivieren.

---

## Wenn Sie den Container schon gelöscht haben

Bitte zuerst **keinen weiteren Löschbefehl** ausführen.

Für die Live-Umgebung dieses Projekts ist die Backend-Adresse:

```bash
https://api-ems.aicono.org
```

Der fehlende `GATEWAY_API_KEY` kann aus der Live-App erneut geholt werden:

1. Live-App öffnen: `https://ems-pro.aicono.org` oder die von Ihnen genutzte Live-Adresse.
2. Links auf **Einstellungen** gehen.
3. **Integrationen** öffnen.
4. Reiter **API** öffnen.
5. Beim **API-Key / Gateway API Key** auf Anzeigen bzw. Kopieren klicken.
6. Falls dort kein Schlüssel mehr angezeigt wird: **neuen API-Key erzeugen** und sofort kopieren.

Danach starten Sie den Live-Worker mit:

```bash
docker run -d --restart=always --name loxone-ws-worker-live \
  -p 8081:8080 \
  -e SUPABASE_URL=https://api-ems.aicono.org \
  -e GATEWAY_API_KEY=[HIER_LIVE_API_KEY_EINFÜGEN] \
  -e LOG_LEVEL=info \
  -e WORKER_HOST=hetzner-prod-1 \
  -e BRIDGE_WORKER_NAME=hetzner-bridge-live \
  loxone-ws-worker-live
```

Falls Ihr Container vorher anders hieß, z. B. `loxone-ws-worker` statt `loxone-ws-worker-live`, nehmen Sie beim Namen und Image wieder genau diesen Namen:

```bash
docker run -d --restart=always --name loxone-ws-worker \
  -p 8080:8080 \
  -e SUPABASE_URL=https://api-ems.aicono.org \
  -e GATEWAY_API_KEY=[HIER_LIVE_API_KEY_EINFÜGEN] \
  -e LOG_LEVEL=info \
  -e WORKER_HOST=hetzner-prod-1 \
  -e BRIDGE_WORKER_NAME=hetzner-bridge-test \
  loxone-ws-worker
```

Prüfen:

```bash
docker logs --tail 50 loxone-ws-worker-live
```

oder, falls der Container `loxone-ws-worker` heißt:

```bash
docker logs --tail 50 loxone-ws-worker
```

---

## Sichere Update-Anleitung, wenn der alte Container noch läuft

### Schritt 1: Prüfen, wie der Container wirklich heißt

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
```

Suchen Sie nach `loxone-ws-worker` oder `loxone-ws-worker-live`.

In den folgenden Beispielen steht `[CONTAINER_NAME]` für genau diesen Namen.

---

### Schritt 2: Start-Konfiguration sichern

**Diesen Schritt immer vor Stoppen/Löschen ausführen.**

```bash
mkdir -p /root/aicono-worker-backup
docker inspect [CONTAINER_NAME] > /root/aicono-worker-backup/[CONTAINER_NAME].inspect.json
docker inspect [CONTAINER_NAME] --format '{{range .Config.Env}}{{println .}}{{end}}' > /root/aicono-worker-backup/[CONTAINER_NAME].env.txt
docker inspect [CONTAINER_NAME] --format '{{json .HostConfig.PortBindings}}' > /root/aicono-worker-backup/[CONTAINER_NAME].ports.json
```

Kontrollieren, ob die wichtigen Werte gesichert wurden:

```bash
grep -E "SUPABASE_URL|GATEWAY_API_KEY|WORKER_HOST|BRIDGE_WORKER_NAME" /root/aicono-worker-backup/[CONTAINER_NAME].env.txt
```

Wenn hier **kein** `SUPABASE_URL` und **kein** `GATEWAY_API_KEY` erscheint: **Stoppen. Nicht löschen.** Dann erst klären, woher der Start-Befehl ursprünglich kam.

---

### Schritt 3: Programmdateien sichern

```bash
cd /opt/loxone-ws-worker
cp index.ts /root/aicono-worker-backup/index.ts.bak
cp Dockerfile /root/aicono-worker-backup/Dockerfile.bak
cp package.json /root/aicono-worker-backup/package.json.bak
cp tsconfig.json /root/aicono-worker-backup/tsconfig.json.bak
```

Falls Ihr Live-Worker im Ordner `/opt/loxone-ws-worker-live` liegt, verwenden Sie stattdessen:

```bash
cd /opt/loxone-ws-worker-live
cp index.ts /root/aicono-worker-backup/index.ts.bak
cp Dockerfile /root/aicono-worker-backup/Dockerfile.bak
cp package.json /root/aicono-worker-backup/package.json.bak
cp tsconfig.json /root/aicono-worker-backup/tsconfig.json.bak
```

---

### Schritt 4: Neue `index.ts` einspielen

Öffnen Sie in Lovable `docs/loxone-ws-worker/index.ts`, kopieren Sie den kompletten Inhalt und ersetzen Sie damit die Datei auf dem Server:

```bash
nano index.ts
```

Speichern in `nano`: **Strg+O**, **Enter**, dann **Strg+X**.

Prüfen, ob der Fix enthalten ist:

```bash
grep -n "currentchargingpower" index.ts
```

---

### Schritt 5: Neues Image bauen

Für den normalen Worker:

```bash
docker build -t loxone-ws-worker .
```

Für den Live-Worker:

```bash
docker build -t loxone-ws-worker-live .
```

---

### Schritt 6: Neuen Start-Befehl vorbereiten

Öffnen Sie die gesicherten Werte:

```bash
cat /root/aicono-worker-backup/[CONTAINER_NAME].env.txt
```

Bauen Sie daraus den neuen `docker run`-Befehl. Für Live ist `SUPABASE_URL`:

```bash
https://api-ems.aicono.org
```

**Erst wenn der fertige neue `docker run`-Befehl vollständig vorliegt, weiter zu Schritt 7.**

---

### Schritt 7: Alten Container ersetzen

Jetzt erst den alten Container stoppen und entfernen:

```bash
docker rm -f [CONTAINER_NAME]
```

Direkt danach den vorbereiteten `docker run`-Befehl ausführen.

---

### Schritt 8: Prüfen

```bash
docker logs --tail 50 [CONTAINER_NAME]
```

Sie sollten sehen, dass der Worker startet, die Meter-Liste lädt und keine Authentifizierungsfehler meldet.

---

## Notfall: Aus Sicherung wiederherstellen

Wenn der neue Worker nicht startet, die alte Datei zurückkopieren:

```bash
cd /opt/loxone-ws-worker
cp /root/aicono-worker-backup/index.ts.bak index.ts
docker build -t loxone-ws-worker .
```

Dann mit dem gesicherten Start-Befehl erneut starten.

---

## Was der Fix fachlich ändert

Der Worker kennt jetzt bei Wallbox-Blöcken:

| Loxone-Kennung | Bedeutung | Rolle |
|---|---|---|
| `Cp` | Current charging power | `pwr` |
| `Cd` | Consumption today | `today` |
| `Cm` | Consumption this month | `month` |
| `Cy` | Consumption this year | `year` |
| `Mr` | Meter reading total | `total` |

Damit wird `Ca` nicht mehr irrtümlich als Ladeleistung interpretiert.