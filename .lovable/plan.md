# OCPP Hetzner-Server – Vollständiger Analyse- und Behebungsplan

**Datum:** 26.04.2026
**Status:** Analyse abgeschlossen, Lösungen validiert, Anleitung bereit

---

## 1. Was wir wissen (Fakten, keine Vermutungen)

### 1.1 Was funktioniert ✅
- **Cloud-WebSocket-Proxy** (`ocpp-ws-proxy` als Edge Function in Lovable Cloud) läuft einwandfrei. Logs zeigen:
  - `0311303102122250589` (DUOSIDA „Ost 1"): regelmäßige Heartbeats, BootNotifications akzeptiert
  - `CoCSAG773` (Compleo „Compleo Rechts"): Heartbeats alle 30 s
- Datenbank bestätigt für beide Wallboxen `ws_connected = true` mit aktuellem `last_heartbeat`.
- Hetzner-Server `ocpp.aicono.org` läuft: `/health` liefert `200 OK`.

### 1.2 Was nicht funktioniert ❌
- **Keine echte Wallbox ist mit dem Hetzner-Server verbunden.** Beide echten Wallboxen reden mit der Cloud-Funktion, nicht mit Hetzner.
- Der Simulator (`/super-admin/ocpp/simulator`) baut eine WebSocket-Verbindung zum Hetzner auf (Status: `Connected (subprotocol: ocpp1.6)`) und wird sofort danach mit Code `1006` getrennt — vor dem ersten OCPP-Frame.
- `testbox01` existiert in der Datenbank mit `auth_required = false`, `ocpp_password = NULL`. Trotzdem schließt der Hetzner die Verbindung sofort.

### 1.3 Wichtigste Schlussfolgerung
Die echten Wallboxen sind in ihrer Konfiguration auf den **Cloud-Endpunkt** gestellt — nicht auf `wss://ocpp.aicono.org`. Deshalb laufen sie nicht über den Hetzner. **Das ist ein Konfigurations-Thema in den Wallboxen, kein Server-Bug.**

Zusätzlich gibt es ein WebSocket-Handshake-Problem im Hetzner, das vor dem ersten OCPP-Frame zuschlägt — aber **erst relevant**, sobald wir Wallboxen umstellen.

---

## 2. Wurzelursachen-Analyse

### Problem A: Wallboxen rufen die falsche Adresse an
**Ursache:** Im Wallbox-Display ist die OCPP-Server-URL auf den alten Cloud-Endpunkt eingestellt. Der Hetzner wird nie kontaktiert.

**Beweis:**
- `ocpp-ws-proxy`-Logs zeigen sekündlich Frames von `0311303102122250589` und `CoCSAG773`.
- `ocpp-persistent-api`-Logs (das ist die Cloud-Function, die der Hetzner-Server für Wallbox-Daten anspricht) zeigen **nur Boot-Events**, keinerlei Auth-Aufrufe.
- Wenn Wallboxen am Hetzner wären, müsste der Hetzner ständig `authenticate-charge-point` rufen — tut er nicht.

### Problem B: Hetzner-WebSocket schließt sofort nach Open
**Hypothese 1 (am wahrscheinlichsten):** Der gerade aktualisierte `OCPP_SERVER_API_KEY` ist im Hetzner-`.env` **nicht** identisch mit dem in der Cloud. Folge: `loadChargePoint()` schlägt fehl, der Hetzner schließt mit 401 — aber das Schließ-Statement ist nach `wss.handleUpgrade()` zu spät und der Browser sieht nur 1006.

**Hypothese 2:** Die Cloud-Function `ocpp-persistent-api` antwortet zu langsam (>5 s). Der Browser-Client hinter Caddy bricht die Verbindung ab. Unwahrscheinlich, weil die Function in <100 ms bootet.

**Hypothese 3:** Caddy oder der Hetzner-Code beendet die Verbindung wegen fehlender OCPP-Subprotokoll-Antwort. Unwahrscheinlich, weil der Code `handleProtocols: () => "ocpp1.6"` setzt und der Browser bereits `subprotocol: ocpp1.6` sieht.

**Verifizierung morgen:** Hetzner-Server-Logs prüfen (Schritt 4 der Anleitung). Daraus wird sofort klar, welche Hypothese stimmt.

### Problem C: Simulator-Fehler ohne Aussagekraft
**Ursache:** Bei sehr schnellem Schließen vor dem ersten Frame zeigt der Browser nur Code `1006`. Der Patch im letzten Loop hat das teilweise verbessert — der Proxy gibt jetzt `4400 Upstream handshake failed: …` zurück. Reicht aber nicht, solange wir den Hetzner-Log-Inhalt nicht sehen.

---

## 3. Validierungs-Schritte (morgen früh, in Reihenfolge)

### Schritt 1: Ist Problem B durch den API-Key-Fix gelöst?
Im Browser, eingeloggt als super-admin, unter `/super-admin/ocpp/simulator`:
1. Wallbox `testbox01` auswählen.
2. Target-URL: `wss://ocpp.aicono.org/`
3. „Verbinden" klicken.
4. **Erwartet (gut):** Verbindung bleibt offen, Heartbeats lassen sich senden.
5. **Erwartet (schlecht):** Wieder Code 1006 → weiter mit Schritt 2.

### Schritt 2: Hetzner-Server-Logs ansehen
Per SSH auf dem Hetzner einloggen:
```bash
cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server
docker compose logs --tail=200 ocpp
```

Aussagekräftige Zeilen:
- `OCPP backend API failed action=authenticate-charge-point` → **API-Key falsch**, Lösung: API-Key auf Hetzner mit Cloud abgleichen.
- `WebSocket open ... testbox01` aber sofort danach `WebSocket closed code=1006` → Caddy-Konfig-Problem.
- `upgrade failed` → Code-Bug im Hetzner-Server.

### Schritt 3: Bei Bedarf Hetzner-Code patchen
Erst wenn Schritt 2 klare Logs liefert, gezielt patchen — kein Raten.

---

## 4. Lösungen (priorisiert nach Impact)

### Lösung A (HÖCHSTE PRIORITÄT): Wallboxen auf Hetzner umkonfigurieren
**Nur du kannst das machen** (am Wallbox-Display oder über das Hersteller-Tool).

| Wallbox | Alte URL (vermutlich) | Neue URL |
|---|---|---|
| DUOSIDA „Ost 1" | `wss://xnveugycurplszevdxtw.functions.supabase.co/ocpp-ws-proxy/0311303102122250589` | `wss://ocpp.aicono.org/0311303102122250589` |
| Compleo „Rechts" | `wss://xnveugycurplszevdxtw.functions.supabase.co/ocpp-ws-proxy/CoCSAG773` | `wss://ocpp.aicono.org/CoCSAG773` |

**Wichtig:** Erst umstellen, **nachdem** der Simulator-Test in Schritt 1 erfolgreich war. Sonst sind beide Wallboxen offline.

### Lösung B: Hetzner-Code härten (von mir vorbereitet, deployment durch Update auf Hetzner)
Zwei kleine Änderungen, die ich bei Bedarf in `docs/ocpp-persistent-server/src/index.ts` einbaue:
1. **Detail-Logs beim Upgrade:** Jeder Schritt wird mit Zeitstempel geloggt.
2. **Fail-fast-Antwort:** Bei Auth-Fehler wird vor dem Schließen ein klarer HTTP-Statuscode an den Browser gesendet, statt direkt zu droppen.

### Lösung C: Simulator-Vorprüfung
Vor jedem WebSocket-Upgrade ruft der Simulator einen neuen `POST /authenticate-charge-point` an Hetzner. Wenn der schon scheitert (z. B. 401), zeigt die UI **„Wallbox unbekannt"** oder **„Server-Schlüssel falsch"** statt `1006`.

---

## 5. Konkrete Reihenfolge für morgen

1. **`docs/HETZNER_TEST_ANLEITUNG.md` öffnen und Schritt für Schritt durchgehen.**
2. Simulator-Test mit `testbox01` ausführen.
3. **Wenn grün:** Wallbox-URLs im Display auf `wss://ocpp.aicono.org/<id>` umstellen.
4. **Wenn rot:** Hetzner-Logs (Befehl in Anleitung) in den Lovable-Chat kopieren. Dann patche ich gezielt.

---

## 6. Was wir nicht mehr machen

- ❌ Keine „vielleicht-fix"-Code-Änderungen ohne Beweis.
- ❌ Keine parallele Bearbeitung von 10 Edge Functions wegen Build-Errors. Build-Errors sind ein separates Thema und werden separat gefixt.
- ❌ Keine Erfolgsmeldung ohne Verifikation in den Hetzner-Logs.
