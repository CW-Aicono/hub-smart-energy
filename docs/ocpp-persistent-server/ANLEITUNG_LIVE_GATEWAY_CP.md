# Anleitung: Live-OCPP-Gateway `cp.aicono.org` einrichten

Diese Anleitung ergänzt das bestehende Setup. **Es wird nichts an deinem Test-Gateway `ocpp.aicono.org` verändert.**

## Ergebnis nach dieser Anleitung

| Domain | Zweck | Backend |
|---|---|---|
| `wss://ocpp.aicono.org` | **Test/Staging** (läuft bereits) | Lovable Cloud |
| `wss://cp.aicono.org` | **Live/Produktiv** (neu, dieses Dokument) | Eigene Supabase auf `https://ems.aicono.org` |

Beide Container laufen auf demselben Hetzner-Server (`OCPP-server`, IP `178.105.45.225`). Der bestehende Caddy-Reverse-Proxy wird so erweitert, dass er **beide** Domains gleichzeitig bedient.

> Plane ca. 30–45 Minuten ein. Schicke mir bei jedem Schritt den vollständigen Terminal-Output, wenn etwas unklar ist. **Niemals raten.**

---

## Voraussetzungen (bitte vorher prüfen)

Du brauchst Zugriff auf:

1. **PuTTY-Verbindung zum OCPP-Server** (`root@178.105.45.225`) — der Server, auf dem heute schon `ocpp.aicono.org` läuft.
2. **PuTTY-Verbindung zum EMS-Server** (`root@91.99.170.143`) — der Server, auf dem die eigene Supabase unter `https://ems.aicono.org` läuft.
3. **Cloudflare-Login** für die Domain `aicono.org`.

---

## Schritt 1 — DNS-Eintrag `cp.aicono.org` in Cloudflare anlegen

1. Login auf https://dash.cloudflare.com → Domain **`aicono.org`** auswählen.
2. Links im Menü **„DNS“ → „Records“** öffnen.
3. **„Add record“** klicken und exakt so ausfüllen:
   - **Type:** `A`
   - **Name:** `cp`  (Cloudflare ergänzt automatisch zu `cp.aicono.org`)
   - **IPv4 address:** `178.105.45.225`
   - **Proxy status:** **DNS only** (graue Wolke, **nicht** orange!) — wichtig, sonst funktioniert weder WebSocket noch das Let's-Encrypt-Zertifikat
   - **TTL:** `Auto`
4. **„Save“** klicken.

### Test (auf deinem eigenen PC in PowerShell oder Terminal)

```
nslookup cp.aicono.org
```

Erwartete Antwort enthält: `Address: 178.105.45.225`.
Wenn stattdessen `104.x.x.x` oder `172.x.x.x` erscheint, steht die Wolke noch auf **Proxied (orange)** — auf **DNS only (grau)** umstellen und 1–2 Minuten warten.

---

## Schritt 2 — Schlüssel der eigenen Supabase auslesen (auf EMS-Server)

Der neue Live-Container braucht zwei Schlüssel aus deiner eigenen Supabase-Installation. Wir lesen sie aus dem Container auf dem EMS-Server aus — dort sind sie als Umgebungsvariablen hinterlegt.

### 2.1 In PuTTY auf den EMS-Server einloggen

Host: `91.99.170.143`, User: `root`.

### 2.2 Genau dieses Kommando 1:1 einfügen und Enter drücken

```
echo "=== SUPABASE-CONTAINER ===" ; docker ps --format "{{.Names}}" | grep -i supabase ; echo ; echo "=== SCHLUESSEL AUS KONG-CONTAINER ===" ; docker exec supabase-kong sh -c 'echo "SUPABASE_URL=https://ems.aicono.org"; echo "SUPABASE_ANON_KEY=$ANON_KEY"; echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"' 2>/dev/null || echo "Container supabase-kong nicht gefunden — bitte oberen Container-Namen melden"
```

### 2.3 Output kopieren und an mich schicken

Du bekommst (wenn alles wie erwartet ist) drei Zeilen wie:

```
SUPABASE_URL=https://ems.aicono.org
SUPABASE_ANON_KEY=eyJhbGciOi... (langer Text)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (langer Text)
```

**Diese drei Zeilen brauchen wir gleich für die Live-`.env`.** Falls in Schritt 2.2 stattdessen `Container supabase-kong nicht gefunden` erscheint, schicke mir die obere Liste der Container-Namen — dann passen wir das Kommando an.

> **Wichtig:** Der `SUPABASE_SERVICE_ROLE_KEY` ist ein Geheimnis. Bitte nur hier im Lovable-Chat einfügen, nirgendwo sonst. Wir rotieren ihn nach dem Go-Live.

---

## ⏸ Hier bitte stoppen und mir die drei Zeilen aus Schritt 2.3 schicken.

Sobald ich die Schlüssel habe, gebe ich dir die fertigen Befehle für **Schritt 3 (Live-Container auf dem OCPP-Server starten)** mit den korrekt eingesetzten Werten. So musst du nichts manuell zusammenkopieren und kannst die Blöcke wirklich 1:1 in PuTTY einfügen.

---

## Vorschau auf Schritt 3 (folgt, sobald die Schlüssel da sind)

Nur zur Information, damit du weißt, was kommt — **bitte noch nicht ausführen**:

1. Auf OCPP-Server einloggen (`178.105.45.225`)
2. In den Projektordner wechseln: `cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server`
3. Neue Datei `.env.live` mit den Live-Werten anlegen (Inhalt liefere ich dir fertig)
4. `docker-compose.yml` um den Service `ocpp-live` erweitern (kompletten neuen Dateiinhalt liefere ich dir)
5. `Caddyfile` um den Block für `cp.aicono.org` erweitern (kompletten neuen Dateiinhalt liefere ich dir)
6. Starten mit `docker compose up -d --build ocpp-live` und Caddy neu laden
7. Test mit `curl https://cp.aicono.org/health` → erwartet `OK`

Danach ist die Live-Umgebung erreichbar und du kannst die ersten produktiven Wallboxen auf `wss://cp.aicono.org` umstellen.
