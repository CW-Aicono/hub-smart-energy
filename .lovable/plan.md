
# Iteration A + B – Wallbox-Simulator Funktionsausbau

Erweitert den OCPP-1.6-Simulator von einer Demo-Wallbox zu einem vollwertigen Test-Werkzeug für Abrechnung, PV-Überschuss, Lastmanagement und Alarmierung.

> ⚠️ **Hetzner-Update nötig:** Der Simulator-Container (`docs/ocpp-simulator-server/src/index.ts`) bekommt diesmal substantielle neue Funktionen. Du musst den Container nach dem Lovable-Deploy einmalig neu bauen + neu starten. Schritt-für-Schritt-Anleitung liefere ich am Ende mit.

---

## Iteration A – Realistischere Ladevorgänge & Live-Steuerung

### A1. Konfigurierbare Ladeleistung (Hetzner + Edge + UI)
- Neues Feld `power_kw` (Standard 11) pro Sim-Instanz, wählbar beim Start: **3.7 / 11 / 22 / 50 / 150 kW**
- MeterValues-Tick alle 30 s addiert `power_kw * 1000 * 30/3600` Wh statt fest 1000 Wh → realistische kWh-Werte für Abrechnungstests
- Im UI sichtbar in der Tabelle als neue Spalte „Leistung"

### A2. Live-Steuerung pro laufender Instanz
Neue Buttons in der Tabellenzeile (nur bei `online`/`charging`):

| Button | Wirkung |
|---|---|
| **Slider „kW live"** | Sendet `setPower` an Container → ändert Tick-Energie sofort, simuliert PV-Drosselung |
| **Pause / Resume** | Schickt StatusNotification `SuspendedEV` bzw. `Charging`, MeterValues pausieren |
| **Stecker ziehen** | StatusNotification `Finishing` → `Available` (beendet Tx ordentlich) |

Container-API neu: `POST /action` mit `{ id, action: "setPower"|"pause"|"resume"|"unplug", value? }`.

### A3. Echten idTag aus `charging_users` wählen
- Im „Simulator starten"-Dialog: zusätzlicher Select „Lade-User (idTag)" – holt `charging_users` des gewählten Tenants (zeigt Name + RFID/App-Tag)
- Der gewählte Tag wird beim Start an den Container übermittelt und ersetzt das hartkodierte `SIM-IDTAG` in `StartTransaction`/`StopTransaction`
- **Effekt:** Sessions im Tenant werden korrekt einem User zugeordnet → Abrechnung funktioniert end-to-end

---

## Iteration B – Fehlersimulation & Live-Logs

### B1. Fehler-Buttons pro Instanz
Neuer Dropdown „Fehler simulieren" mit OCPP-1.6-Standardfehlern:
- `GroundFailure`, `OverCurrentFailure`, `OverVoltage`, `ConnectorLockFailure`, `EVCommunicationError`, `InternalError`
- Plus Button **„Fehler löschen"** → sendet `NoError` / `Available`

Container schickt entsprechende `StatusNotification` mit `errorCode` und `status: "Faulted"`. Damit testbar:
- Alarmierungs-Logik im EMS (Tasks/Notifications)
- Anzeige fehlerhafter Wallboxen im EV-Dashboard
- Auto-Recovery beim Zurücksetzen

### B2. Live-OCPP-Logs in der UI
- Container hält Ringpuffer (letzte 50 Messages) pro Sim-Instanz im RAM
- Neuer Container-Endpoint `GET /logs?id=<simId>` → liefert Array `{ts, dir: "in"|"out", action, payload}`
- Neue Edge-Action `?action=logs&instanceId=...` reicht das durch
- UI: Klick auf Tabellenzeile öffnet Sheet mit Log-Stream (auto-refresh alle 3 s), monospace, In = grün-Pfeil / Out = blau-Pfeil

> Persistenz nur im Container-RAM, geht beim Neustart verloren – das ist für Tests akzeptabel und vermeidet DB-Last.

---

## Geänderte / neue Dateien

**Hetzner-Container (Update erforderlich):**
- `docs/ocpp-simulator-server/src/index.ts`
  - SimInstance-Interface: `+ powerKw, idTag, paused, logRing[]`
  - StartTransaction nutzt `inst.idTag` statt fester String
  - MeterValues-Tick rechnet mit `powerKw`
  - Neue Actions: `setPower`, `pause`, `resume`, `unplug`, `fault`, `clearFault`
  - Neuer Endpoint `GET /logs?id=...`
  - Logging-Helper schreibt zusätzlich in `inst.logRing` (cap 50)

**Edge Function:**
- `supabase/functions/ocpp-simulator-control/index.ts`
  - `start` akzeptiert `powerKw`, `idTag` und reicht beide an Container
  - `action` akzeptiert die neuen Aktionen + optionalen `value` (für setPower)
  - Neue Action `logs` → ruft `/logs?id=...` am Container auf

**DB-Migration:**
- `simulator_instances`: neue Spalten `power_kw numeric default 11`, `id_tag text`

**UI:**
- `src/pages/SuperAdminSimulators.tsx`
  - Start-Dialog: Power-Select + idTag-Select (Daten via `useChargingUsers(tenantId)`)
  - Tabelle: neue Spalte „Leistung"
  - Neue Action-Komponente `SimulatorRowActions` mit Power-Slider, Pause/Resume, Stecker, Fehler-Dropdown
  - Klick auf Zeile öffnet `SimulatorLogSheet` (neue Komponente) mit Live-Logs
- `src/components/super-admin/SimulatorLogSheet.tsx` *(neu)*
- `src/components/super-admin/SimulatorRowActions.tsx` *(neu)*
- `src/hooks/useChargingUsers.tsx`: kleiner Helper `useChargingUsersByTenant(tenantId)` ergänzen (nur Filter, keine RLS-Änderung)

---

## Hetzner-Update-Anleitung (kommt nach Implementierung)

Nach dem Deploy in Lovable bekommst du eine **klick-für-klick-Anleitung in einfachem Deutsch**, die genau so aussieht:

1. SSH-Verbindung zum Hetzner-Server (genauer Befehl)
2. In Container-Verzeichnis wechseln (genauer Pfad)
3. `git pull` ODER (falls kein Git) Datei manuell ersetzen (kompletter neuer Dateiinhalt zum Kopieren)
4. `docker compose up -d --build ocpp-simulator` (genauer Befehl)
5. Healthcheck: `curl http://127.0.0.1:8090/health` – erwartetes Ergebnis
6. Test in Lovable: neuen Simulator starten, Logs öffnen → Erfolg sichtbar

---

## Was NICHT in dieser Iteration enthalten ist

- Authorize-Flow vor StartTransaction (Iteration C)
- SetChargingProfile / PV-Surplus-Reaktion (Iteration C, braucht EMS-seitige Profile)
- Bulk-Start, Szenario-Presets, Reconnect-Test (Iteration C)
- Mehrere Connectoren pro Wallbox (Iteration C – größerer DB-Umbau)

Wenn A+B stabil läuft, machen wir Iteration C als nächsten Schritt.
