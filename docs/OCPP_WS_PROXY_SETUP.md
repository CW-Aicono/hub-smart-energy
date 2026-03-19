# OCPP ws:// Proxy – Einrichtung auf dem Raspberry Pi

## Worum geht es?

Neuere Ladepunkte verbinden sich direkt per **wss://** (verschlüsselt) mit dem OCPP-Backend. Ältere Ladepunkte unterstützen aber oft nur **ws://** (unverschlüsselt). Der Gateway Worker auf dem Raspberry Pi kann als **Brücke** dienen:

```
Ladepunkt (ws://) → Raspberry Pi (Gateway Worker) → wss://ocpp.aicono.org
```

Der Raspberry Pi nimmt die unverschlüsselte Verbindung an und leitet sie verschlüsselt an das Backend weiter.

> ⚠️ **Sicherheitshinweis:** Da ws:// unverschlüsselt ist, sollte der Raspberry Pi nur im **lokalen Netzwerk (LAN)** oder **VPN** erreichbar sein – niemals direkt aus dem Internet!

---

## Voraussetzungen

- Raspberry Pi mit Raspberry Pi OS (Lite reicht)
- Docker und Docker Compose installiert
- Der Gateway Worker läuft bereits als Docker-Container (oder wird jetzt erstmals eingerichtet)
- SSH-Zugang zum Raspberry Pi

---

## Schritt 1: Per SSH auf den Raspberry Pi verbinden

Öffne ein Terminal (auf Mac/Linux) oder PowerShell (auf Windows) und verbinde dich:

```bash
ssh pi@raspberrypi.local
```

> Falls du einen anderen Benutzernamen oder eine IP-Adresse verwendest, passe den Befehl entsprechend an, z.B.: `ssh meinuser@192.168.1.100`

---

## Schritt 2: In das Gateway-Worker-Verzeichnis wechseln

```bash
cd ~/gateway-worker
```

> Falls das Verzeichnis noch nicht existiert, erstelle es:
> ```bash
> mkdir -p ~/gateway-worker
> cd ~/gateway-worker
> ```

---

## Schritt 3: Die aktuellen Dateien auf den Pi kopieren

Du brauchst die folgenden Dateien aus dem `docs/gateway-worker/`-Ordner des Projekts auf deinem Raspberry Pi:

- `index.ts`
- `package.json`
- `tsconfig.json`
- `Dockerfile`

**Option A: Dateien vom Computer auf den Pi kopieren**

Öffne ein **neues** Terminal auf deinem Computer (nicht auf dem Pi!) und führe aus:

```bash
scp docs/gateway-worker/index.ts pi@raspberrypi.local:~/gateway-worker/index.ts
scp docs/gateway-worker/package.json pi@raspberrypi.local:~/gateway-worker/package.json
scp docs/gateway-worker/tsconfig.json pi@raspberrypi.local:~/gateway-worker/tsconfig.json
scp docs/gateway-worker/Dockerfile pi@raspberrypi.local:~/gateway-worker/Dockerfile
```

**Option B: Dateien direkt auf dem Pi erstellen/aktualisieren**

Falls du die Dateien nicht per SCP kopieren kannst, kannst du sie auf dem Pi direkt aus dem Git-Repository laden (falls eingerichtet) oder manuell erstellen.

---

## Schritt 4: Docker Compose Datei erstellen/aktualisieren

Zurück auf dem Pi (per SSH), erstelle die `docker-compose.yml`:

1. Öffne die Datei im Editor:

```bash
nano ~/gateway-worker/docker-compose.yml
```

2. Lösche den gesamten alten Inhalt (falls vorhanden):
   - Drücke `Ctrl+A` (alles markieren), dann `Ctrl+K` (alles löschen)

3. Füge folgenden Inhalt ein:

```yaml
version: "3.8"

services:
  gateway-worker:
    build: .
    container_name: gateway-worker
    restart: always
    ports:
      - "9000:9000"
    environment:
      - SUPABASE_URL=https://xnveugycurplszevdxtw.supabase.co
      - GATEWAY_API_KEY=HIER_DEINEN_API_KEY_EINTRAGEN
      - POLL_INTERVAL_MS=30000
      - FLUSH_INTERVAL_MS=1000
      - LOG_LEVEL=info
      # --- OCPP ws:// Proxy aktivieren ---
      - OCPP_PROXY_PORT=9000
      - OCPP_PROXY_TARGET=wss://ocpp.aicono.org
```

4. **Wichtig:** Ersetze `HIER_DEINEN_API_KEY_EINTRAGEN` durch deinen echten Gateway API Key.

5. Speichere die Datei:
   - Drücke `Ctrl+O` (Speichern)
   - Drücke `Enter` (Dateiname bestätigen)
   - Drücke `Ctrl+X` (Editor schließen)

---

## Schritt 5: Docker-Image neu bauen

Da der Gateway Worker Code geändert wurde, muss das Docker-Image neu gebaut werden:

```bash
cd ~/gateway-worker
docker compose build --no-cache
```

> Das dauert auf dem Raspberry Pi einige Minuten (ca. 3–8 Minuten je nach Modell). Bitte warten, bis der Vorgang abgeschlossen ist.

---

## Schritt 6: Container starten

Falls ein alter Container noch läuft, wird er automatisch ersetzt:

```bash
docker compose up -d
```

---

## Schritt 7: Prüfen, ob alles läuft

1. **Container-Status prüfen:**

```bash
docker compose ps
```

Du solltest sehen, dass der Container `gateway-worker` den Status `Up` hat.

2. **Logs prüfen:**

```bash
docker compose logs -f --tail=50
```

Du solltest folgende Zeilen sehen:

```
[INFO] Gateway Worker v3.0 starting...
[INFO]   OCPP Proxy:         ws://0.0.0.0:9000 → wss://ocpp.aicono.org
[INFO] [OCPP-Proxy] Listening on ws://0.0.0.0:9000
[INFO] [OCPP-Proxy] Target: wss://ocpp.aicono.org
[WARN] [OCPP-Proxy] ⚠ ws:// ist unverschlüsselt – nur in geschützten Netzwerken verwenden!
```

> Zum Beenden der Log-Anzeige drücke `Ctrl+C`.

---

## Schritt 8: Ladepunkt konfigurieren

Jetzt musst du in der Konfiguration deines **älteren Ladepunkts** die OCPP-URL auf den Raspberry Pi umstellen:

1. Finde die **IP-Adresse** deines Raspberry Pi heraus:

```bash
hostname -I
```

Beispiel-Ausgabe: `192.168.1.42`

2. Trage in deinem Ladepunkt als **Central System URL** ein:

```
ws://192.168.1.42:9000/DEINE_OCPP_ID
```

> Ersetze `192.168.1.42` durch die tatsächliche IP deines Raspberry Pi.
> Ersetze `DEINE_OCPP_ID` durch die OCPP-ID, die du dem Ladepunkt zugewiesen hast.

3. Falls dein Ladepunkt ein **OCPP-Passwort** unterstützt (Basic Auth), trage es wie gewohnt ein – es wird automatisch an das Backend weitergeleitet.

4. Starte den Ladepunkt neu.

---

## Schritt 9: Verbindung testen

Nach dem Neustart des Ladepunkts solltest du in den Gateway-Worker-Logs sehen:

```bash
docker compose logs -f --tail=20
```

Erwartete Ausgabe:

```
[INFO] [OCPP-Proxy] Neue Verbindung: DEINE_OCPP_ID von 192.168.1.xxx
[INFO] [OCPP-Proxy] Upstream verbunden: DEINE_OCPP_ID
```

Der Ladepunkt sollte jetzt auch im Dashboard als **online** angezeigt werden.

---

## Fehlerbehebung

### Der Container startet nicht

```bash
docker compose logs gateway-worker
```

Häufige Ursachen:
- `SUPABASE_URL` oder `GATEWAY_API_KEY` fehlen → in `docker-compose.yml` prüfen
- Port 9000 bereits belegt → anderen Port verwenden (z.B. `9001:9001` und `OCPP_PROXY_PORT=9001`)

### Ladepunkt verbindet sich nicht

1. Prüfe, ob der Port erreichbar ist (von einem anderen Gerät im Netzwerk):

```bash
curl http://192.168.1.42:9000/test
```

Du solltest eine JSON-Antwort mit einem Fehler bekommen (das ist normal, da kein WebSocket).

2. Prüfe die Firewall auf dem Pi:

```bash
sudo iptables -L -n | grep 9000
```

Falls der Port blockiert ist:

```bash
sudo iptables -A INPUT -p tcp --dport 9000 -j ACCEPT
```

### Upstream-Verbindung schlägt fehl

In den Logs erscheint `[OCPP-Proxy] Upstream-Fehler`:

- Prüfe, ob der Pi eine Internetverbindung hat: `ping google.com`
- Prüfe, ob das Backend erreichbar ist: `curl https://ocpp.aicono.org`

---

## Zusammenfassung

| Was | Wert |
|-----|------|
| Proxy-Port auf dem Pi | `9000` (konfigurierbar) |
| URL für den Ladepunkt | `ws://<PI_IP>:9000/<OCPP_ID>` |
| Ziel (Backend) | `wss://ocpp.aicono.org` |
| Protokoll | OCPP 1.6 |
| Basic Auth | wird automatisch durchgereicht |
| Sicherheit | nur im LAN/VPN verwenden! |
