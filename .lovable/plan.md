# 🔌 OCPP-Wallbox-Simulator (eingebaut im EMS)

## 🎯 Ziel
Du kannst deinen Hetzner-OCPP-Server (`wss://ocpp.aicono.org`) **direkt aus deinem EMS heraus** testen — ganz ohne echte Wallbox, ohne PowerShell und ohne neue Schlüssel. Nur Klicken.

---

## 📋 Was du am Ende hast

Eine neue Seite **"OCPP-Simulator"** im Super-Admin-Menü mit:

1. **Wallbox-Auswahl** (Dropdown mit allen registrierten Ladestationen, z.B. `SimBox Test 01`)
2. **Buttons** für alle wichtigen OCPP-Aktionen:
   - 🔌 **Verbinden / Trennen**
   - 📡 **BootNotification** senden (meldet Wallbox am Server an)
   - 💓 **Heartbeat** senden (Lebenszeichen)
   - 🚦 **StatusNotification** (Available / Charging / Faulted ...)
   - ⚡ **StartTransaction** (Ladevorgang starten)
   - 📊 **MeterValues** (Energiezähler senden)
   - 🛑 **StopTransaction** (Ladevorgang beenden)
3. **Live-Log** aller gesendeten und empfangenen Nachrichten (farbig)
4. **Status-Anzeige**: Verbunden / Getrennt / Fehler

---

## 🛠️ Technische Umsetzung (für dich nicht relevant, aber zur Info)

### Schritt 1: WebSocket-Proxy als Edge Function
Browser können bei WebSocket-Verbindungen kein Passwort mitschicken (technische Browser-Beschränkung). Lösung: Eine kleine Edge Function (`ocpp-simulator-proxy`) wird als Vermittler eingesetzt:
- Browser ↔ Edge Function ↔ `wss://ocpp.aicono.org/<id>`
- Edge Function holt Passwort aus DB (Tabelle `charge_points.ocpp_password`) und setzt den Auth-Header
- Frames werden 1:1 weitergeleitet
- **Nutzt keinen Service-Role-Key** — verwendet die normale User-Authentifizierung des angemeldeten Super-Admins

### Schritt 2: Simulator-Engine im Frontend
Ein TypeScript-Modul `OcppSimulatorClient`:
- Verbindungsmanagement
- OCPP-1.6-Frame-Builder (CALL `[2,id,action,payload]`, CALLRESULT `[3,...]`)
- Antwortet automatisch auf Server-Befehle (RemoteStart/Stop, Reset, GetConfiguration)
- Auto-Heartbeat (alle 30 s)
- MeterValue-Generator (lineare Energiesteigerung während Transaktion)

### Schritt 3: UI im Super-Admin-Bereich
- Neue Seite `/super-admin/ocpp-simulator`
- Eintrag im SuperAdminSidebar: "OCPP-Simulator" mit Plug-Icon
- Wiederverwendet AICONO-CI (Dark, Blue/Teal, Capsule-Shapes)
- Live-Frame-Log mit Farb-Codierung (outgoing blau, incoming grün, error rot)
- Filter und Export als JSON

### Schritt 4: Sicherheit
- Nur für Super-Admin-Rolle zugänglich (RLS via `has_role(auth.uid(), 'super_admin')`)
- Edge Function prüft JWT und Super-Admin-Status
- Passwort wird **nie** an Browser geschickt — bleibt serverseitig
- Verwendet bestehende `charge_points`-Tabelle (keine neue Tabelle nötig)

---

## ✅ Was sich NICHT ändert

- ❌ **Keine** neuen API-Schlüssel oder Secrets
- ❌ **Keine** Änderungen am Hetzner-Server
- ❌ **Keine** Änderungen an bestehenden Edge Functions (`ocpp-ws-proxy`, `ocpp-central` bleiben unangetastet)
- ❌ **Keine** Datenbankmigrationen mit Risiko (nur Lese-Zugriff auf bestehende Tabellen)
- ❌ **Keine** Auswirkungen auf laufende echte Wallboxen (Compleo, Ost 1)

---

## 📦 Lieferumfang

1. Neue Edge Function `ocpp-simulator-proxy` (WebSocket-Relay mit Auth-Header-Injection)
2. Neue React-Komponente `src/pages/SuperAdminOcppSimulator.tsx`
3. Neue Helper-Klasse `src/lib/ocppSimulatorClient.ts`
4. Neue Komponenten:
   - `src/components/super-admin/OcppSimulatorPanel.tsx` (Hauptpanel)
   - `src/components/super-admin/OcppFrameLog.tsx` (Live-Log)
5. Neue Route in `App.tsx`: `/super-admin/ocpp-simulator`
6. Eintrag in `SuperAdminSidebar.tsx` mit Plug-Icon

---

## 🧪 Erster Test nach Implementierung (ganz einfach!)

1. Du klickst auf **"OCPP-Simulator"** im Super-Admin-Menü
2. Wählst aus dem Dropdown **"SimBox Test 01"**
3. Klickst **"Verbinden"** → Status-Badge wird grün
4. Klickst **"BootNotification senden"** → siehst im Log die Antwort vom Server
5. Klickst **"Heartbeat"** → siehst `currentTime` vom Server
6. Klickst **"StartTransaction"** → simulierter Ladevorgang läuft

→ **Alles per Klick, ohne Befehle einzutippen.**

---

## ⏱️ Aufwand
**1 Iteration** (eine größere Änderung, wird in einem Rutsch umgesetzt).

Nach Freigabe baue ich alles auf einmal, du musst nur noch testen.

## 🤔 Alternative falls dir das zu groß ist
Wenn du es noch einfacher möchtest, kann ich auch nur einen **Minimal-Tester** bauen mit nur 3 Buttons (Verbinden / Boot / Heartbeat) — sag dann einfach "Mach die Minimal-Version".
