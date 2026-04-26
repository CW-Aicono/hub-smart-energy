
# OCPP-Wallbox-Simulator auf Hetzner — Plan zur Umsetzung

## Ziel in einem Satz
Ein zusätzlicher Container auf deinem Hetzner-Server, der echte Wallboxen vortäuscht. Steuerbar von jedem Tenant-Admin direkt aus dem Browser, ohne eigene Hardware. Für Tests gegen den OCPP-Server, gegen Abrechnung, gegen Lade-App.

---

## 1. Was am Ende für dich/die Tenants sichtbar ist

Im Tenant-Backend (sichtbar für **Tenant-Admins und Super-Admins**) entsteht eine neue Seite:

**„Test-Wallboxen (Simulator)"**

Darauf:
- Liste der aktuell laufenden eigenen Simulatoren (max. 3 pro Tenant)
- Button **„Neue Test-Wallbox starten"** mit Auswahl:
  - Name (z. B. „Test-Box Büro")
  - Verbindungsart: **wss:// (verschlüsselt)** oder **ws:// (unverschlüsselt)**
  - Mit oder ohne OCPP-Passwort
  - Anzahl Ladepunkte (1 oder 2)
- Pro laufender Simulator-Box Aktions-Buttons:
  - „BootNotification senden"
  - „Heartbeat senden"
  - „Ladevorgang starten" (mit RFID-Tag-Eingabe)
  - „Messwerte senden" (z. B. 7,4 kW)
  - „Ladevorgang beenden"
  - „Status ändern" (Available, Charging, Faulted, …)
  - „Stoppen & löschen"
- Live-Ansicht der letzten gesendeten/empfangenen Nachrichten der ausgewählten Simulator-Box.

**Wichtig:** Jeder Tenant sieht nur seine eigenen Simulator-Boxen. Super-Admin sieht alle.

---

## 2. Wie es technisch im Hintergrund funktioniert

```
   Tenant-Admin (Browser)
            │
            │  klickt „Heartbeat senden"
            ▼
   Datenbank: simulator_commands (neuer Eintrag)
            │
            │  alle 2 Sek. abgefragt
            ▼
   Hetzner: ocpp-simulator-Container
            │
            │  baut/hält WebSocket
            ▼
   Hetzner: ocpp-Server (bestehend)
            │
            ▼
   Datenbank: charge_points / sessions / message_log
```

**Kein CORS-Problem**, weil der Browser nichts direkt zum Hetzner-Container schickt. Alle Befehle gehen über die Datenbank — genau wie bei echten Wallboxen.

---

## 3. Was konkret gebaut wird

### 3.1 Datenbank (2 neue Tabellen)

**`simulator_instances`** — eine Zeile pro laufender Simulator-Box
- `id`, `tenant_id`, `created_by` (User), `name`
- `ocpp_id` (automatisch generiert, z. B. `SIM-{tenant-kürzel}-{zufall}`)
- `protocol` (`wss` oder `ws`)
- `use_password` (true/false), `password` (falls gesetzt, verschlüsselt)
- `connector_count` (1 oder 2)
- `status` (`pending`, `running`, `stopped`, `error`)
- `last_seen_at`, `created_at`

Mit RLS:
- Tenant-Admin sieht/ändert nur eigene Tenant-Zeilen.
- Super-Admin sieht alles.
- Hard-Limit: max. 3 aktive (`status='running'`) pro Tenant — per Datenbank-Trigger erzwungen.

**`simulator_commands`** — Befehlswarteschlange
- `id`, `simulator_instance_id`, `command` (z. B. `boot`, `heartbeat`, `start_tx`, `meter`, `stop_tx`, `status`, `terminate`)
- `payload` (JSON), `status` (`pending`, `done`, `failed`), `result`, `created_at`, `executed_at`

### 3.2 Hetzner-Container `ocpp-simulator`

Neuer kleiner Node.js-Dienst neben dem bestehenden OCPP-Server. Aufgaben:
- Startet beim Hochfahren bestehende `running`-Simulatoren neu (Resilienz nach Server-Reboot).
- Pollt alle 2 Sek. die Tabelle `simulator_commands` auf neue Aufgaben.
- Hält je laufendem Simulator eine eigene WebSocket-Verbindung zum OCPP-Server offen — wahlweise als `wss://ocpp.aicono.org/<ocpp_id>` oder `ws://ocpp.aicono.org/<ocpp_id>`, wahlweise mit Basic-Auth-Header (Passwort) oder ohne.
- Führt eingehende Befehle aus und schreibt das Ergebnis zurück.
- Schickt regelmäßige Heartbeats automatisch (wie eine echte Wallbox).
- Beendet sich sauber, wenn `terminate` kommt oder Tenant das löscht.

**Ressourcen:** Pro Simulator ca. 5 MB RAM. Bei 30 Tenants × 3 = 90 Boxen → ca. 500 MB. Unkritisch.

### 3.3 Tenant-Frontend
Neue Seite unter `/super-admin/simulator` (Super-Admin-Sicht: alle Tenants) **und** `/admin/simulator` (Tenant-Admin-Sicht: nur eigene). Liste, Erstell-Dialog, Aktionen wie oben beschrieben.

### 3.4 Edge Function (klein)
Eine einzige Edge Function `simulator-control` für:
- Simulator anlegen (prüft Limit, generiert ocpp_id, legt evtl. `charge_point`-Eintrag an damit der OCPP-Server die Box kennt).
- Befehl absenden (schreibt Zeile in `simulator_commands`).
- Simulator löschen (terminate + cleanup).

---

## 4. Sicherheit & Missbrauchsschutz

| Maßnahme | Umsetzung |
|---|---|
| Nur Admins | RLS + Frontend-Rollencheck |
| Max. 3 Simulatoren pro Tenant gleichzeitig | Datenbank-Trigger beim Insert |
| Keine fremden Tenants beeinflussbar | RLS auf beiden Tabellen, ocpp_id enthält tenant-kürzel |
| Container-Crash zerstört nichts | Auto-Restart beim Hochfahren aus DB |
| ws:// nur intern erlaubt? | Nein — explizit gewünscht, für Realismus älterer Wallboxen. Hinweis-Banner im UI |
| Audit | Jede Erstellung/Löschung mit `created_by` und Zeitstempel |

---

## 5. Technische Hürden, die ich vorab geprüft habe

**1. Mehrere WebSockets aus einem Container — geht das?**
Ja. Node.js mit `ws`-Library hält problemlos hunderte parallele Verbindungen. Unser bestehender OCPP-Server nutzt dieselbe Library.

**2. Findet der OCPP-Server die Simulator-Boxen?**
Ja, weil wir beim Anlegen automatisch einen `charge_points`-Eintrag mit `auth_required=false` (oder `true` mit Passwort) erzeugen. Der Server unterscheidet nicht zwischen echt und simuliert.

**3. Was, wenn der Hetzner-Server neu startet?**
Der Container liest beim Start alle `running`-Einträge aus `simulator_instances` und stellt die WebSockets wieder her. Tenant merkt nichts.

**4. Kollisionen bei OCPP-IDs?**
Ausgeschlossen durch Format `SIM-{6-stelliges Tenant-Kürzel}-{8 Zufallszeichen}` + Unique-Constraint.

**5. Datenmüll bei Tests?**
Charging Sessions vom Simulator bekommen einen Marker `is_test=true` (neue Spalte). Abrechnung filtert diese standardmäßig raus. Du kannst sie aber sehen, um die Abrechnungslogik zu testen.

**6. Was geht NICHT?**
- Hersteller-Sondernachrichten (z. B. proprietäre KEBA-Pakete) — nur OCPP-1.6-Standard.
- Realistisches Funkverhalten / Verbindungsabbrüche — wir können sie nur simulieren, indem wir die Verbindung manuell trennen.

---

## 6. Umsetzungsreihenfolge (in dieser Reihenfolge, jedes Stück testbar)

1. **Datenbank-Tabellen + RLS + Limit-Trigger** anlegen.
2. **Edge Function `simulator-control`** mit Endpunkten Anlegen/Befehlen/Löschen.
3. **Hetzner-Container-Code** (`docs/ocpp-simulator-server/`) mit Docker-Compose-Eintrag schreiben + Anleitung zum Deployen (du machst nur einen einzigen Befehl auf dem Server).
4. **Frontend-Seite** für Tenant-Admins + Super-Admins.
5. **Ende-zu-Ende-Test**: Simulator anlegen → Boot → Heartbeat → Ladevorgang → Messwerte → Stop → in OCPP-Übersicht und Abrechnung sichtbar.
6. **Doku** als laienverständliche Anleitung in Deutsch (sowohl für dich zum Deployen als auch für Tenant-Admins zum Bedienen).

---

## 7. Was ich von dir nach Freigabe brauche

Nur **eine Sache**: Nach Freigabe baue ich alles. Wenn der Hetzner-Container fertig ist, gebe ich dir **einen einzigen Befehl** zum Kopieren in dein SSH-Fenster auf dem Hetzner. Mehr nicht. Schritt für Schritt mit Erwartungs-Ausgabe.

---

## 8. Was bewusst NICHT in diesem Plan ist (um Credits zu sparen)

- Keine Simulation von OCPP 2.0.1 — nur 1.6 (was dein Server unterstützt).
- Kein Last-Test-Modus mit hunderten Wallboxen aus einem Knopf.
- Keine Auto-Lade-Simulation (Wallbox lädt von alleine über Stunden) — kommt bei Bedarf später.

Diese Sachen können wir nach erfolgreichem ersten Wurf ergänzen.
