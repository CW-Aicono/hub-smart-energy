## Diagnose bestätigt — H3 (Prozess-interner DNS-/State-Cache)

**Beweise aus deinen Logs:**
- H1 raus: Beide Container haben dieselbe Outbound-IP `91.99.170.143` → keine Loxone-seitige IP-Sperre.
- H3 bestätigt: `docker restart loxone-ws-worker-live` → **sofort** WS aktiv, RAW-Events fließen für `504F94A2BAA2`.
- Root Cause: Der Node-Prozess des Live-Workers hatte für Rathaus einen negativen DNS-/Cloud-Lookup-Zustand gecacht (vermutlich seit dem Ausfall bei der Firmware-Aktualisierung). Da Node den DNS-Resolver-State prozesslebenslang mitschleppt und der Worker keinen eigenen Recovery-Reset kennt, blieb Rathaus permanent auf der schlechten Route hängen, obwohl Loxone Cloud längst wieder korrekt antwortete.

Der Restart war also nicht der Fix, sondern der Workaround. Ohne Härtung passiert das beim nächsten Loxone-Cloud-Aussetzer oder Firmware-Update erneut — und dann hängt genau ein Miniserver wieder unbegrenzt lange, ohne dass es jemandem auffällt.

## Vorgeschlagene Härtung im `loxone-ws-worker`

Alle Änderungen isoliert im Worker (`docs/loxone-ws-worker/`), keine Cloud-Migration nötig.

### 1) „Stuck-Slot"-Selbstheilung pro Miniserver
Wenn für einen bestimmten Serial in **N Minuten kein einziger `open`-Erfolg** zustande kommt, obwohl der Slot aktiv ist und andere Serials im selben Worker sauber laufen:
- Slot komplett zerstören (Timer, WS-Handle, Auth-State, Redirect-Cache).
- 60 s Cooldown.
- Slot mit frischem Kontext neu aufsetzen (entspricht dem, was `docker restart` gerade manuell erledigt hat — nur pro Serial, nicht global).

Schwellwert-Vorschlag: `NO_OPEN_TIMEOUT_MIN=15` (konfigurierbar via ENV).

**Wichtig:** Das ist **kein periodischer Reconnect**. Ein absichtlich offline geschalteter Miniserver hat keinen aktiven Slot, daher läuft der Timer nicht. Der Reset passiert rein im Worker-Speicher und belastet die Datenbank nicht zusätzlich.

### 2) Global „Same-serial only" Watchdog
Zweiter, unabhängiger Health-Check: Wenn ein Serial >30 min ohne WS-Session ist, während ≥1 anderer Serial im selben Worker aktive Events schreibt → in `loxone_ws_session_log` einen Event `stuck-slot-reset` protokollieren und Schritt 1 auslösen. Der Vergleich mit den anderen Serials verhindert Fehlalarme bei generellen Cloud-Ausfällen.

### 3) Sichtbarkeit im Super-Admin
`SuperAdminGatewayFleet` bekommt eine kleine Spalte „Zuletzt WS-Open-Erfolg" (Delta aus `loxone_ws_session_log`), damit ein hängender Slot ohne Putty auffällt. Zusätzlich wird `stuck-slot-reset` als eigener Reconnect-Grund im UI ausgewiesen, statt in der `Reconnects`-Zahl unterzugehen.

### 4) Optional: `curl` in beide Container-Images
Kleiner Ops-Komfort — beim nächsten Diagnose-Bedarf funktioniert der `docker exec curl`-Test direkt (aktuell fehlt `curl` im Node-Alpine-Image). Alternativ `wget --spider` in die Diagnose-Snippets aufnehmen.

## Was NICHT gemacht wird
- Keine Änderung an der Loxone-Cloud-DNS-Nutzung — die läuft grundsätzlich stabil.
- Kein Prozess-Restart als Watchdog (bricht alle 20 gesunden Slots mit).
- Keine Änderung an `admin_lovable` / Credentials — bestätigt korrekt.
- Kein Patch am Redirect-Parser — Loxones 307-Verhalten ist normal.

## Verifikation nach Deployment
- 24 h Monitoring in `loxone_ws_session_log`: Auftreten von `stuck-slot-reset` Ereignissen zählen (Erwartung: 0–2/Woche).
- Rathaus-Test: einmal Miniserver kurz vom Netz nehmen, wieder anschließen → Slot muss innerhalb 15 min ohne Container-Restart wieder Events liefern.

## Nächster Schritt

Nach Freigabe des Plans: Patch für `docs/loxone-ws-worker/index.ts` (Schritt 1+2), UI-Erweiterung in `SuperAdminGatewayFleet.tsx` (Schritt 3), plus Update-Anleitung in `docs/loxone-ws-worker/UPDATE-*.md`. Deployment via bestehendem Docker-Compose-Rebuild auf Hetzner — kein Neubau der Cloud-Umgebung nötig.
