# Installationsanleitung: Raspberry Pi + Home Assistant + EMS Gateway Hub

Diese Anleitung beschreibt die komplette Einrichtung eines Raspberry Pi als lokalen Gateway-Hub – von der Hardware bis zum laufenden EMS Add-on.

---

## Inhaltsverzeichnis

1. [Hardware-Voraussetzungen](#1-hardware-voraussetzungen)
2. [Home Assistant OS auf SD-Karte flashen](#2-home-assistant-os-auf-sd-karte-flashen)
3. [Erster Start & Netzwerkzugang](#3-erster-start--netzwerkzugang)
4. [Home Assistant Grundkonfiguration](#4-home-assistant-grundkonfiguration)
5. [EMS Gateway Hub Add-on installieren](#5-ems-gateway-hub-add-on-installieren)
6. [Add-on konfigurieren](#6-add-on-konfigurieren)
7. [Lokale Geräte in Home Assistant einbinden](#7-lokale-geräte-in-home-assistant-einbinden)
8. [Verbindung zur Cloud prüfen](#8-verbindung-zur-cloud-prüfen)
9. [Fehlerbehebung](#9-fehlerbehebung)

---

## 1. Hardware-Voraussetzungen

### Empfohlene Hardware

| Komponente | Empfehlung | Hinweis |
|---|---|---|
| **Raspberry Pi** | Raspberry Pi 4 Model B (4 GB RAM) | Pi 5 funktioniert ebenfalls |
| **Netzteil** | Offizielles USB-C Netzteil (5V / 3A) | Mindestens 15W, kein Handy-Ladegerät! |
| **Speicher** | microSD-Karte, mindestens 32 GB (Class 10 / A2) | Empfohlen: SanDisk Extreme 64 GB |
| **Netzwerk** | Ethernet-Kabel (LAN) | WLAN möglich, aber LAN deutlich stabiler |
| **Gehäuse** | Beliebiges Pi-Gehäuse mit passiver/aktiver Kühlung | Überhitzung vermeiden |
| **Kartenleser** | microSD-Kartenleser für deinen Computer | Zum Flashen des OS |

> **Optional:** Für erhöhte Zuverlässigkeit kann anstelle der SD-Karte eine USB-SSD (z. B. 128 GB) verwendet werden. Home Assistant unterstützt Boot von USB.

### Bezugsquellen (Deutschland)

- [BerryBase](https://www.berrybase.de) – Raspberry Pi Bundles
- [Reichelt](https://www.reichelt.de) – Einzelkomponenten
- [Amazon.de](https://www.amazon.de) – Starter-Kits mit allem Zubehör

---

## 2. Home Assistant OS auf SD-Karte flashen

### 2.1 Balena Etcher herunterladen

Lade den **Raspberry Pi Imager** (empfohlen) oder **Balena Etcher** herunter:

- **Raspberry Pi Imager** (empfohlen): [https://www.raspberrypi.com/software/](https://www.raspberrypi.com/software/)
- **Balena Etcher** (Alternative): [https://etcher.balena.io/](https://etcher.balena.io/)

### 2.2 Home Assistant OS Image herunterladen

Lade das passende Image für deinen Raspberry Pi herunter:

| Raspberry Pi Modell | Image |
|---|---|
| Pi 4 / Pi 400 | [haos_rpi4-64](https://github.com/home-assistant/operating-system/releases) |
| Pi 5 | [haos_rpi5-64](https://github.com/home-assistant/operating-system/releases) |
| Pi 3 | [haos_rpi3-64](https://github.com/home-assistant/operating-system/releases) |

> **Quelle:** [https://www.home-assistant.io/installation/raspberrypi](https://www.home-assistant.io/installation/raspberrypi)

### 2.3 Image auf SD-Karte schreiben

**Mit Raspberry Pi Imager (empfohlen):**

1. Starte den Raspberry Pi Imager
2. Klicke auf **„Betriebssystem wählen"** → **„Other specific-purpose OS"** → **„Home assistants and home automation"** → **„Home Assistant"** → Wähle dein Pi-Modell
3. Klicke auf **„SD-Karte wählen"** → Wähle deine microSD-Karte
4. Klicke auf **„Schreiben"**
5. Warte, bis der Vorgang abgeschlossen ist (ca. 5–10 Minuten)

**Mit Balena Etcher:**

1. Starte Balena Etcher
2. Klicke auf **„Flash from file"** und wähle die heruntergeladene `.img.xz`-Datei
3. Klicke auf **„Select target"** und wähle deine microSD-Karte
4. Klicke auf **„Flash!"**
5. Warte, bis der Vorgang abgeschlossen ist

> ⚠️ **Achtung:** Alle Daten auf der SD-Karte werden gelöscht!

---

## 3. Erster Start & Netzwerkzugang

### 3.1 Raspberry Pi starten

1. Stecke die geflashte microSD-Karte in den Raspberry Pi
2. Verbinde den Pi per **Ethernet-Kabel** mit deinem Router
3. Schließe das **Netzteil** an – der Pi startet automatisch
4. **Warte ca. 5–10 Minuten** – beim ersten Start wird Home Assistant installiert

> 💡 Die grüne LED am Pi blinkt während des Startvorgangs. Wenn sie nur noch gelegentlich blinkt, ist der Start abgeschlossen.

### 3.2 Home Assistant im Browser öffnen

Öffne einen Browser auf deinem Computer (im selben Netzwerk) und navigiere zu:

```
http://homeassistant.local:8123
```

> Falls das nicht funktioniert, versuche die IP-Adresse des Pi direkt. Du findest sie in der Weboberfläche deines Routers (z. B. Fritz!Box unter „Heimnetz" → „Netzwerk").
>
> Beispiel: `http://192.168.1.42:8123`

### 3.3 Warten auf „Preparing Home Assistant"

Beim allerersten Aufruf siehst du den Bildschirm **„Preparing Home Assistant"**. Dieser Vorgang kann **bis zu 20 Minuten** dauern. Bitte nicht den Pi vom Strom trennen!

---

## 4. Home Assistant Grundkonfiguration

### 4.1 Onboarding

Sobald Home Assistant bereit ist, wirst du durch das Onboarding geführt:

1. **Benutzerkonto erstellen:** Wähle einen Benutzernamen und ein sicheres Passwort
2. **Standort festlegen:** Gib deinen Standort ein (für Zeitzone und Wetter)
3. **Geräte:** Home Assistant erkennt automatisch Geräte im Netzwerk – du kannst diesen Schritt zunächst überspringen
4. **Fertig:** Klicke auf „Fertig"

### 4.2 Updates installieren

Nach dem Onboarding:

1. Gehe zu **Einstellungen** → **System** → **Updates**
2. Installiere alle verfügbaren Updates
3. Starte Home Assistant neu, falls gefordert

---

## 5. EMS Gateway Hub Add-on installieren

### 5.1 Repository hinzufügen

1. Öffne den **Add-on Store** in Home Assistant
2. Klicke oben rechts auf die **drei Punkte (⋮)** → **„Repositories"**
3. Füge folgende Repository-URL hinzu:

```
https://github.com/CW-Aicono/ha-addons
```

4. Klicke auf **„Hinzufügen"** und danach auf **„Schließen"**

### 5.2 Woran du erkennst, dass dieser Schritt korrekt war

Wenn im Fenster **„Add-on Repositories verwalten"** ein Eintrag mit

- **EMS Gateway Hub Add-ons**
- **Christian Wattenberg**
- **https://github.com/CW-Aicono/ha-addons**

sichtbar ist, dann ist dieser Schritt **korrekt abgeschlossen**.

> ✅ Genau das ist auf deinem Screenshot zu sehen.

### 5.3 Warum die Installation trotzdem fehlschlägt

Wenn sich das Add-on **danach trotzdem nicht installieren lässt**, liegt der Fehler **nicht mehr in Home Assistant**, sondern im **GitHub-Repository des Add-ons**.

Die technische Prüfung zeigt aktuell diese typischen Blocker:

1. **`ems-gateway-hub/Dockerfile` muss eine echte Docker-Datei sein**  
   Sie muss mit etwas wie `FROM node:...` beginnen. Wenn dort stattdessen JSON mit `{` beginnt, wurde versehentlich der Inhalt von `package.json` in die falsche Datei kopiert.

2. **`ems-gateway-hub/config.yaml` braucht eine gültige Home-Assistant-Syntax**  
   Unter `schema:` dürfen keine Blöcke mit `name:` und `required:` stehen. Home Assistant erwartet dort Typen wie `url`, `str`, `int` oder `bool`.

3. **Das Add-on braucht API-Rechte für Home Assistant**  
   Weil das Add-on mit der lokalen Home-Assistant-API spricht, müssen in `config.yaml` die Optionen `hassio_api: true` und `homeassistant_api: true` gesetzt sein.

### 5.4 Bevor du erneut auf „Installieren" klickst

Prüfe in deinem GitHub-Repo diese drei Dateien:

- `ems-gateway-hub/Dockerfile`
- `ems-gateway-hub/config.yaml`
- `ems-gateway-hub/package.json`

**Schnelltest für Laien:**

- `Dockerfile` beginnt mit `FROM ...`
- `package.json` beginnt mit `{`
- `config.yaml` enthält unter `schema:` Werte wie `url`, `str`, `int`

Erst **wenn diese drei Dateien korrekt sind**, solltest du das Add-on erneut installieren.

### 5.5 Add-on installieren

1. Klicke auf **„EMS Gateway Hub"**
2. Klicke auf **„Installieren"**
3. Warte, bis die Installation abgeschlossen ist

> 💡 **Nicht sofort starten!** Zuerst muss das Add-on konfiguriert werden (siehe nächster Schritt).

---

## 6. Add-on konfigurieren

### 6.1 Konfigurationswerte eintragen

Wenn Home Assistant dir **ein Formular** zeigt, trägst du diese Werte Feld für Feld ein.

Wenn Home Assistant dir **nur einen YAML-Editor** zeigt, kopiere diesen Block hinein und ersetze die Beispielwerte:

```yaml
supabase_url: "https://xnveugycurplszevdxtw.supabase.co"
gateway_api_key: "gw_abc123..."
tenant_id: "550e8400-e29b-41d4-a716-446655440000"
device_name: "rpi-buero-eg"
poll_interval_seconds: 30
flush_interval_seconds: 5
heartbeat_interval_seconds: 60
entity_filter: "sensor.*_energy,sensor.*_power"
offline_buffer_max_mb: 100
auto_backup_hours: 24
```

Bedeutung der Werte:

| Schlüssel | Beschreibung | Beispiel |
|---|---|---|
| **supabase_url** | Die URL deines Cloud-Backends | `https://xnveugycurplszevdxtw.supabase.co` |
| **gateway_api_key** | Dein Gateway-API-Schlüssel (aus der App) | `gw_abc123...` |
| **tenant_id** | Deine Mandanten-ID (aus der App) | `550e8400-e29b-41d4-a716-446655440000` |
| **device_name** | Ein eindeutiger Name für diesen Gateway | `rpi-buero-eg` |
| **poll_interval_seconds** | Wie oft Sensoren abgefragt werden (Sekunden) | `30` |
| **flush_interval_seconds** | Wie oft Daten an die Cloud gesendet werden (Sekunden) | `5` |
| **heartbeat_interval_seconds** | Wie oft der Status gemeldet wird (Sekunden) | `60` |
| **entity_filter** | Welche HA-Entitäten erfasst werden sollen | `sensor.*_energy,sensor.*_power` |
| **offline_buffer_max_mb** | Maximale Größe des Offline-Puffers (MB) | `100` |
| **auto_backup_hours** | Intervall für automatische Konfig-Backups in Stunden | `24` |

### 6.2 API Key und Tenant ID finden

Die Werte findest du in der EMS-App:

1. Melde dich in der App an: [https://hub-smart-energy.lovable.app](https://hub-smart-energy.lovable.app)
2. Gehe zu **Einstellungen** → **Integrationen** → **Gateway-Geräte**
3. Dort findest du den **Gateway API Key** und deine **Tenant ID**

### 6.3 Add-on starten

1. Gehe zurück zum Tab **„Info"** des Add-ons
2. Klicke auf **„Starten"**
3. Wechsle zum Tab **„Protokoll"** und prüfe, ob das Add-on fehlerfrei startet

Erwartete Log-Ausgabe:

```
[INFO] EMS Gateway Hub v1.0.0 starting...
[INFO]   Cloud URL:    https://xnveugycurplszevdxtw.supabase.co
[INFO]   Device:       rpi-buero-eg
[INFO]   Poll:         every 30s
[INFO]   Flush:        every 5s
[INFO]   Heartbeat:    every 60s
[INFO] Health server listening on :8099
[INFO] Initial meter sync: found 5 meters
[INFO] Polling started – 12 entities matched filter
```

### 6.4 Autostart aktivieren

1. Im Tab **„Info"** des Add-ons
2. Aktiviere **„Beim Hochfahren starten"** (Start on boot)
3. Aktiviere **„Watchdog"** – startet das Add-on automatisch neu, falls es abstürzt

---

## 7. Lokale Geräte in Home Assistant einbinden

### 7.1 Shelly-Geräte

Shelly-Geräte werden im lokalen Netzwerk automatisch erkannt.

1. Gehe zu **Einstellungen** → **Geräte & Dienste**
2. Home Assistant zeigt entdeckte Shelly-Geräte an → Klicke auf **„Konfigurieren"**
3. Die Shelly-Sensoren (Leistung, Energie, Temperatur) erscheinen als `sensor.shelly_*`

> **Quelle:** [https://www.home-assistant.io/integrations/shelly/](https://www.home-assistant.io/integrations/shelly/)

### 7.2 Schneider Electric (Modbus TCP)

Für Schneider Electric Geräte mit Modbus TCP:

1. Gehe zu **Einstellungen** → **Geräte & Dienste** → **„+ Integration hinzufügen"**
2. Suche nach **„Modbus"**
3. Konfiguriere die Verbindung:
   - **Typ:** TCP
   - **Host:** IP-Adresse des Schneider-Geräts (z. B. `192.168.1.100`)
   - **Port:** `502`
4. Konfiguriere die Modbus-Register gemäß der Schneider-Dokumentation

> **Quelle:** [https://www.home-assistant.io/integrations/modbus/](https://www.home-assistant.io/integrations/modbus/)

### 7.3 Homematic IP

1. Gehe zu **Einstellungen** → **Geräte & Dienste** → **„+ Integration hinzufügen"**
2. Suche nach **„HomeMatic"** (oder **„HomematicIP Local"**)
3. Gib die IP-Adresse deiner CCU / RaspberryMatic an
4. Folge den Anweisungen zur Kopplung

> **Quelle:** [https://www.home-assistant.io/integrations/homematicip_local/](https://www.home-assistant.io/integrations/homematicip_local/)

### 7.4 Weitere Integrationen

Home Assistant unterstützt über **2.700 Integrationen**. Beliebte Energiequellen:

| Gerät / System | HA-Integration | Dokumentation |
|---|---|---|
| SMA Wechselrichter | `sma` | [Link](https://www.home-assistant.io/integrations/sma/) |
| Fronius Wechselrichter | `fronius` | [Link](https://www.home-assistant.io/integrations/fronius/) |
| Kostal Wechselrichter | `kostal_plenticore` | [Link](https://www.home-assistant.io/integrations/kostal_plenticore/) |
| Huawei Solar | `huawei_solar` (HACS) | [Link](https://github.com/wlcrs/huawei_solar) |
| Tasmota | `tasmota` | [Link](https://www.home-assistant.io/integrations/tasmota/) |
| Tuya / Smart Life | `tuya` | [Link](https://www.home-assistant.io/integrations/tuya/) |
| MQTT (generisch) | `mqtt` | [Link](https://www.home-assistant.io/integrations/mqtt/) |

> **Vollständige Liste:** [https://www.home-assistant.io/integrations/](https://www.home-assistant.io/integrations/)

---

## 8. Verbindung zur Cloud prüfen

### 8.1 In der App

1. Öffne die EMS-App: [https://hub-smart-energy.lovable.app](https://hub-smart-energy.lovable.app)
2. Gehe zu **Einstellungen** → **Integrationen** → **Gateway-Geräte**
3. Dein Gateway sollte als **„Online"** angezeigt werden
4. Prüfe:
   - ✅ Letzter Heartbeat (sollte < 2 Minuten alt sein)
   - ✅ Add-on-Version
   - ✅ Offline-Puffer leer (0 Einträge)

### 8.2 Am Raspberry Pi

Prüfe die Logs des Add-ons im Home Assistant:

1. Gehe zu **Einstellungen** → **Add-ons** → **EMS Gateway Hub** → **Protokoll**
2. Suche nach:
   - `[INFO] Heartbeat sent` – Verbindung zur Cloud funktioniert
   - `[INFO] Flushed X readings` – Daten werden gesendet
   - `[WARN] Offline` – Keine Internetverbindung (Daten werden gepuffert)

### 8.3 Health-Endpoint

Das Add-on stellt einen lokalen Status-Endpunkt bereit:

```bash
curl http://homeassistant.local:8099/api/status
```

Antwort:

```json
{
  "status": "online",
  "uptime_seconds": 3600,
  "buffer_count": 0,
  "last_flush_at": "2026-03-31T10:00:00Z",
  "version": "1.0.0"
}
```

---

## 9. Fehlerbehebung

### Add-on startet nicht

**Symptom:** Das Add-on zeigt Status „Gestoppt" und startet nicht.

**Lösung:**
1. Prüfe die Logs: **Add-ons** → **EMS Gateway Hub** → **Protokoll**
2. Häufige Ursachen:
   - `Cloud URL` oder `Gateway API Key` nicht eingetragen → Konfiguration prüfen
   - Ungültige `Tenant ID` → Korrekte ID aus der App kopieren

### Keine Sensordaten

**Symptom:** Das Add-on läuft, aber es werden keine Daten gesendet.

**Lösung:**
1. Prüfe den **Entity Filter** in der Add-on-Konfiguration
2. Gehe in Home Assistant zu **Entwicklerwerkzeuge** → **Zustände**
3. Suche nach Entitäten, die zu deinem Filter passen (z. B. `sensor.*_energy`)
4. Falls keine vorhanden: Integrationen prüfen (Schritt 7)

### Offline-Puffer wächst

**Symptom:** Der Offline-Puffer zeigt viele Einträge, die nicht gesendet werden.

**Lösung:**
1. Prüfe die Internetverbindung des Pi: `ping google.com` (via SSH oder Terminal-Add-on)
2. Prüfe, ob die Cloud-URL erreichbar ist
3. Prüfe, ob der API Key gültig ist (in der App unter Gateway-Geräte)

### SSH-Zugang zum Raspberry Pi

Falls du erweiterte Diagnose benötigst:

1. Installiere das **Terminal & SSH** Add-on in Home Assistant:
   - **Einstellungen** → **Add-ons** → **Add-on Store** → Suche nach „Terminal & SSH"
   - Installieren, Passwort setzen, starten
2. Verbinde dich per SSH:
   ```bash
   ssh root@homeassistant.local -p 22222
   ```

### Raspberry Pi ist nicht erreichbar

1. Prüfe, ob der Pi an ist (LEDs leuchten)
2. Prüfe das Ethernet-Kabel
3. Versuche die IP-Adresse statt `homeassistant.local` (im Router nachsehen)
4. Warte 5–10 Minuten nach dem Einschalten – der erste Start dauert lange

---

## Weiterführende Quellen

| Thema | Link |
|---|---|
| Home Assistant Installation | [https://www.home-assistant.io/installation/raspberrypi](https://www.home-assistant.io/installation/raspberrypi) |
| Home Assistant Onboarding | [https://www.home-assistant.io/getting-started/onboarding/](https://www.home-assistant.io/getting-started/onboarding/) |
| Home Assistant Add-ons | [https://www.home-assistant.io/addons/](https://www.home-assistant.io/addons/) |
| Raspberry Pi Imager | [https://www.raspberrypi.com/software/](https://www.raspberrypi.com/software/) |
| Balena Etcher | [https://etcher.balena.io/](https://etcher.balena.io/) |
| Home Assistant Community | [https://community.home-assistant.io/](https://community.home-assistant.io/) |
| Shelly Integration | [https://www.home-assistant.io/integrations/shelly/](https://www.home-assistant.io/integrations/shelly/) |
| Modbus Integration | [https://www.home-assistant.io/integrations/modbus/](https://www.home-assistant.io/integrations/modbus/) |
| HomematicIP Integration | [https://www.home-assistant.io/integrations/homematicip_local/](https://www.home-assistant.io/integrations/homematicip_local/) |
