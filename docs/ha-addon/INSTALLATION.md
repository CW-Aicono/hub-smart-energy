# Installationsanleitung: EMS Gateway Hub v2.0

Diese Anleitung beschreibt die komplette Einrichtung des EMS Gateway Hub Add-ons für Home Assistant – von der Hardware bis zum laufenden System mit lokalen Automationen.

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
9. [Lokales Dashboard (v2.0)](#9-lokales-dashboard-v20)
10. [Lokale Automationen (v2.0)](#10-lokale-automationen-v20)
11. [Per-Device API-Keys (v2.0)](#11-per-device-api-keys-v20)
12. [Fehlerbehebung](#12-fehlerbehebung)

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

### 2.1 Imager herunterladen

- **Raspberry Pi Imager** (empfohlen): [https://www.raspberrypi.com/software/](https://www.raspberrypi.com/software/)
- **Balena Etcher** (Alternative): [https://etcher.balena.io/](https://etcher.balena.io/)

### 2.2 Home Assistant OS Image

| Raspberry Pi Modell | Image |
|---|---|
| Pi 4 / Pi 400 | [haos_rpi4-64](https://github.com/home-assistant/operating-system/releases) |
| Pi 5 | [haos_rpi5-64](https://github.com/home-assistant/operating-system/releases) |
| Pi 3 | [haos_rpi3-64](https://github.com/home-assistant/operating-system/releases) |

> **Quelle:** [https://www.home-assistant.io/installation/raspberrypi](https://www.home-assistant.io/installation/raspberrypi)

### 2.3 Image auf SD-Karte schreiben

**Mit Raspberry Pi Imager:**

1. Starte den Raspberry Pi Imager
2. **„Betriebssystem wählen"** → **„Other specific-purpose OS"** → **„Home assistants and home automation"** → **„Home Assistant"** → Pi-Modell wählen
3. **„SD-Karte wählen"** → microSD auswählen
4. **„Schreiben"** klicken und warten (ca. 5–10 Minuten)

> ⚠️ Alle Daten auf der SD-Karte werden gelöscht!

---

## 3. Erster Start & Netzwerkzugang

1. Geflashte microSD-Karte in den Raspberry Pi stecken
2. Pi per **Ethernet-Kabel** mit dem Router verbinden
3. **Netzteil** anschließen – der Pi startet automatisch
4. **5–10 Minuten warten** (Home Assistant wird installiert)

Dann im Browser öffnen:

```
http://homeassistant.local:8123
```

> Falls nicht erreichbar: IP-Adresse im Router nachschauen (z. B. Fritz!Box unter „Heimnetz" → „Netzwerk").

---

## 4. Home Assistant Grundkonfiguration

1. **Benutzerkonto erstellen** (sicheres Passwort wählen)
2. **Standort festlegen** (für Zeitzone)
3. **Updates installieren**: Einstellungen → System → Updates

---

## 5. EMS Gateway Hub Add-on installieren

### 5.1 Repository hinzufügen

1. Öffne: **http://homeassistant.local:8123/hassio/store**
2. Klicke auf **⋮** → **„Repositories"**
3. URL einfügen:

```
https://github.com/CW-Aicono/ha-addons
```

4. **„Hinzufügen"** → **„Schließen"**

### 5.2 Add-on installieren

1. Im Add-on Store nach **„EMS Gateway Hub"** suchen
2. Auf **„Installieren"** klicken (dauert 2–5 Minuten)

> 💡 **Nicht sofort starten!** Zuerst konfigurieren (Schritt 6).

---

## 6. Add-on konfigurieren

### 6.1 Konfigurationswerte

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

| Schlüssel | Beschreibung |
|---|---|
| **supabase_url** | Cloud-Backend-URL |
| **gateway_api_key** | Gateway-API-Schlüssel (aus der App, oder per-device Key – siehe Abschnitt 11) |
| **tenant_id** | Mandanten-ID (aus der App) |
| **device_name** | Eindeutiger Name für diesen Gateway |
| **poll_interval_seconds** | Sensor-Abfrageintervall |
| **flush_interval_seconds** | Cloud-Sendeintervall |
| **heartbeat_interval_seconds** | Status-Meldeintervall |
| **entity_filter** | Glob-Pattern für HA-Entitäten |
| **offline_buffer_max_mb** | Max. Offline-Puffergröße |
| **auto_backup_hours** | Backup-Intervall |

### 6.2 API Key und Tenant ID finden

1. Anmelden unter: [https://hub-smart-energy.lovable.app](https://hub-smart-energy.lovable.app)
2. **Einstellungen** → **Integrationen** → **Gateway-Geräte**
3. Dort findest du **Gateway API Key** und **Tenant ID**

### 6.3 Add-on starten

1. Tab **„Info"** → **„Starten"**
2. Tab **„Protokoll"** prüfen:

```
[INFO] EMS Gateway Hub v2.0.0 starting...
[INFO]   Cloud URL:    https://xnveugycurplszevdxtw.supabase.co
[INFO]   Device:       rpi-buero-eg
[INFO]   Poll:         every 30s
[INFO]   Flush:        every 5s
[INFO]   Heartbeat:    every 60s
[INFO] Health server listening on :8099
[INFO] WebSocket connected to HA
[INFO] Automation engine started – 3 rules loaded
[INFO] Polling started – 12 entities matched filter
```

### 6.4 Autostart aktivieren

- **„Beim Hochfahren starten"** aktivieren
- **„Watchdog"** aktivieren (automatischer Neustart bei Absturz)

---

## 7. Lokale Geräte in Home Assistant einbinden

### Shelly-Geräte

Werden automatisch erkannt: **Einstellungen** → **Geräte & Dienste** → **„Konfigurieren"**

> [Shelly-Integration Docs](https://www.home-assistant.io/integrations/shelly/)

### Modbus TCP (Schneider Electric)

1. **Einstellungen** → **Geräte & Dienste** → **„+ Integration"**
2. **„Modbus"** suchen → TCP konfigurieren (Host: IP, Port: 502)

> [Modbus-Integration Docs](https://www.home-assistant.io/integrations/modbus/)

### Weitere Integrationen

Home Assistant unterstützt 2.700+ Integrationen:

| Gerät / System | Integration | Link |
|---|---|---|
| SMA Wechselrichter | `sma` | [Docs](https://www.home-assistant.io/integrations/sma/) |
| Fronius Wechselrichter | `fronius` | [Docs](https://www.home-assistant.io/integrations/fronius/) |
| Kostal Wechselrichter | `kostal_plenticore` | [Docs](https://www.home-assistant.io/integrations/kostal_plenticore/) |
| Tasmota | `tasmota` | [Docs](https://www.home-assistant.io/integrations/tasmota/) |
| MQTT (generisch) | `mqtt` | [Docs](https://www.home-assistant.io/integrations/mqtt/) |

---

## 8. Verbindung zur Cloud prüfen

### In der App

1. Öffne [https://hub-smart-energy.lovable.app](https://hub-smart-energy.lovable.app)
2. **Einstellungen** → **Integrationen** → **Gateway-Geräte**
3. Gateway sollte **„Online"** sein
4. Prüfe: Letzter Heartbeat < 2 Min., Offline-Puffer leer

### Health-Endpoint

```bash
curl http://homeassistant.local:8099/api/status
```

```json
{
  "status": "running",
  "uptime_seconds": 3600,
  "buffer_count": 0,
  "addon_version": "3.0.0",
  "automation_count": 3,
  "cloud_ws_connected": true,
  "cloud_ws_device_id": "…",
  "cloud_ws_location_id": "…",
  "ha_ws_connected": true,
  "mac_address": "aabbccddeeff",
  "assignment_status": "assigned"
}
```

### Cloud-Verbindung (v3.0)

Ab v3.0 entfällt der bisherige Cloudflare-Tunnel komplett. Das Add-on baut stattdessen eine **ausgehende WebSocket-Verbindung** zur AICONO Cloud auf (`wss://…/functions/v1/gateway-ws`) und authentifiziert sich mit:

- **MAC-Adresse** (automatisch erkannt, im Dashboard sichtbar)
- **Benutzername + Passwort** (in der Add-on-Konfiguration gesetzt)

Die Cloud sendet Schaltbefehle, Automations-Sync und Konfigurations-Updates *push-basiert* über diesen Kanal – es müssen keine Ports geöffnet und keine DNS-Records angelegt werden.

> ℹ️ **Migration von v2 → v3:** Bestehende Cloudflare-Tunnel können entfernt werden. Im AICONO-Backend muss die Liegenschafts-Integration mit MAC + Benutzername + Passwort neu konfiguriert werden.

---

## 9. Lokales Dashboard (v2.0)

Ab Version 2.0 verfügt das Add-on über ein eingebautes Web-Dashboard, das direkt in der Home-Assistant-Sidebar erscheint (via HA Ingress).

### Seiten

| Seite | Beschreibung |
|---|---|
| **Dashboard** | Gateway-Status, HA-Version, Buffer, Online/Offline, Uptime |
| **Sensoren** | Live-Sensorwerte via WebSocket (Echtzeit-Updates) |
| **Automationen** | Aktive Regeln, Status, letzte Ausführung |
| **Logs** | Execution-Log + System-Log |
| **Einstellungen** | Aktuelle Konfiguration anzeigen |

### Zugriff

Das Dashboard ist über HA Ingress erreichbar – kein separater Login nötig. Home Assistant übernimmt die Authentifizierung.

Alternativ direkt über:

```
http://homeassistant.local:8099/ui/
```

---

## 10. Lokale Automationen (v2.0)

### Funktionsweise

Das Add-on führt Automationen **lokal auf dem Raspberry Pi** aus – unabhängig von der Cloud-Verbindung. Die Automation Engine:

1. **Synchronisiert** aktive Regeln von der Cloud (bei Verbindung)
2. **Evaluiert** Bedingungen alle 30 Sekunden lokal
3. **Führt Aktionen** direkt über die HA REST API aus
4. **Pusht Execution-Logs** bei nächster Cloud-Verbindung zurück

### Vorteile

- ✅ **Offline-fähig** – Automationen laufen auch ohne Internet
- ✅ **Niedrige Latenz** – Direkte HA-API-Aufrufe statt Cloud-Umweg
- ✅ **Identische Logik** – Selbe Condition-Engine wie Cloud-Scheduler
- ✅ **Bidirektionaler Sync** – Logs werden in der Cloud sichtbar

### Unterstützte Bedingungen

| Typ | Beschreibung |
|---|---|
| Zeitfenster | z. B. 08:00–18:00 (inkl. Overnight) |
| Zeitpunkt | Einzelner Trigger ±2 Min. Toleranz |
| Zeitschaltuhr | Mehrere Zeitpunkte pro Tag |
| Wochentag | Mo–So Auswahl |
| Sensorwert | >, <, =, >=, <= gegen Schwellwert |
| Status | Aktor-Status prüfen (ein/aus) |

### Priority-Buffer

Sensor-Readings mit Werten über dem Schwellwert werden als **prioritär** markiert und bei Speicherknappheit nicht gelöscht (FIFO-Eviction schützt sie).

---

## 11. Per-Device API-Keys (v2.0)

### Warum Per-Device Keys?

Im Multi-Tenant-Betrieb sollte jeder Raspberry Pi einen **eigenen API-Key** haben, der an die `gateway_devices.id` gebunden ist. Das verhindert Tenant-Crossover und ermöglicht granulare Zugriffskontrolle.

### Funktionsweise

1. Jeder Device-Key wird als **SHA-256 Hash** in `gateway_devices.api_key_hash` gespeichert
2. Bei jedem API-Aufruf wird der Key gegen den Hash validiert
3. Der `tenant_id` im Request wird gegen den Key-Tenant geprüft (Triple-Check)
4. Der globale `GATEWAY_API_KEY` funktioniert weiterhin als Fallback

### Einrichtung

1. In der EMS-App unter **Gateway-Geräte** einen neuen Device-Key generieren
2. Den Key in der Add-on-Konfiguration als `gateway_api_key` eintragen
3. Das Add-on neu starten

> 💡 Der globale Key funktioniert weiterhin für alle Geräte. Per-Device Keys sind optional, aber für Produktionsumgebungen empfohlen.

---

## 12. Fehlerbehebung

### Add-on startet nicht

1. Logs prüfen: **Add-ons** → **EMS Gateway Hub** → **Protokoll**
2. Häufige Ursachen:
   - Cloud URL oder Gateway API Key nicht eingetragen
   - Ungültige Tenant ID

### Keine Sensordaten

1. **Entity Filter** prüfen
2. **Entwicklerwerkzeuge** → **Zustände** → nach `sensor.*_energy` suchen
3. Falls keine vorhanden: Integrationen prüfen (Schritt 7)

### Automationen werden nicht ausgeführt

1. Prüfe im **Automationen-Tab** des lokalen Dashboards ob Regeln geladen sind
2. Prüfe die **Logs** auf Fehlermeldungen
3. Stelle sicher, dass die Automationen in der Cloud als **aktiv** markiert sind
4. Debounce: Nach einer Ausführung wird 5 Minuten gewartet

### Offline-Puffer wächst

1. Internetverbindung prüfen: `ping google.com`
2. Cloud-URL Erreichbarkeit prüfen
3. API Key Gültigkeit in der App prüfen

### SSH-Zugang

1. **Terminal & SSH** Add-on installieren (aus dem Add-on Store)
2. Verbinden: `ssh root@homeassistant.local -p 22222`

---

## Weiterführende Quellen

| Thema | Link |
|---|---|
| Home Assistant Installation | [home-assistant.io/installation/raspberrypi](https://www.home-assistant.io/installation/raspberrypi) |
| Home Assistant Add-ons | [home-assistant.io/addons](https://www.home-assistant.io/addons/) |
| Raspberry Pi Imager | [raspberrypi.com/software](https://www.raspberrypi.com/software/) |
| Shelly Integration | [home-assistant.io/integrations/shelly](https://www.home-assistant.io/integrations/shelly/) |
| Modbus Integration | [home-assistant.io/integrations/modbus](https://www.home-assistant.io/integrations/modbus/) |
