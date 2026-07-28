## Ausgangslage (verifiziert)

- HTTP-Pull gegen Rathaus funktioniert → Zugangsdaten & Rechte sind korrekt.
- WS-Handshake bricht wiederholt mit HTTP 408 in `stage: ws-open` ab (bestätigt in `loxone_ws_session_log`).
- Sessions, die zustande kommen, enden mit `close-2008` (undokumentierter Loxone-Code, tritt nach Firmware-Update auf).
- Andere Miniserver mit identischer Worker-Version laufen stabil → Problem ist Rathaus-spezifisch, nicht global.
- Credential-Hypothese ist damit **verworfen**. Keine Änderungen an User/Passwort nötig.

## Neue Arbeitshypothese

Der Loxone-Cloud-DNS-Resolver (`dns.loxonecloud.com`) liefert für Rathaus zeitweise eine Relay-Route, auf der der WS-Upgrade in 408 läuft, während der HTTP-Endpoint (evtl. andere Route/Cache) funktioniert. `close-2008` deutet auf serverseitigen Abbruch nach erfolgreichem Upgrade hin (z. B. Token-/Session-Limit im Miniserver nach FW-Update).

Vor jedem Code-Patch müssen wir das erst belegen — sonst bauen wir wieder blind.

## Plan

### Schritt 0 — Diagnose (read-only, keine Code-Änderung)

1. In `loxone_ws_session_log` für Rathaus (letzte 24 h) auswerten:
   - Verteilung `stage` × `close_code` × `http_status`
   - Zeitabstand zwischen erfolgreichem `ws-open` und folgendem `close-2008` (Session-Lebensdauer)
   - Ob 408 & 2008 abwechselnd oder in Blöcken auftreten
2. `location_integrations.config` für Rathaus vs. AICONO Zentrale diffen (Host, Port, `use_cloud_dns`, `remote_connect_ws_enabled`, evtl. hinterlegte direkte IP).
3. Prüfen, ob Rathaus im Miniserver-Log parallele Sessions offen hält (Session-Limit-Verdacht).

**Ergebnis dieses Schritts entscheidet, welcher Patch unten gebaut wird.** Ohne Schritt 0 keinen Code anfassen.

### Schritt 1 — Worker-Härtung `loxone-ws-worker` (nur wenn Schritt 0 die Hypothese stützt)

Kandidaten-Patches, je nach Diagnose einzeln freizugeben:

- **A) Direkt-IP-Fallback**: Bei 408 in `ws-open` einen Retry über die im HTTP-Pull erfolgreich genutzte IP/Route erzwingen (Cloud-DNS umgehen). Nur wenn Diagnose zeigt, dass HTTP eine andere Route nimmt.
- **B) `close-2008`-Cooldown**: Nach 2× `close-2008` innerhalb von 5 Min → 10 Min Pause, statt sofort neu zu verbinden (verhindert Session-Storm im Miniserver).
- **C) Session-Cleanup vor Reconnect**: Vor `ws-open` einen HTTP-Logout gegen den Miniserver senden, damit alte Tokens gedroppt werden (adressiert Session-Limit nach FW-Update).
- **D) Attribution**: Alle drei Ereignisse (`408`, `2008`, Cooldown-Trigger) mit `miniserver_serial` + `close_code` in `loxone_ws_session_log` schreiben, um Wirkung messen zu können.

### Schritt 2 — Verifikation

- 60 Min nach Deployment: 408-Rate & `close-2008`-Rate für Rathaus vs. Vorher, Session-Lebensdauer, Reconnects/h.
- Kein weiterer Patch, bevor Metriken vorliegen.

## Was **nicht** passiert

- Keine Änderung an User `admin_lovable` oder Passwort.
- Keine Änderungen an anderen Miniservern.
- Kein „Alles gleichzeitig fixen"-Patch — jeder Teilpatch wird einzeln freigegeben.

## Nächster Schritt

Nach Freigabe des Plans starte ich mit **Schritt 0** (reine DB-Abfragen). Ergebnisse poste ich, dann entscheiden wir gemeinsam, welche der Patches A–D gebaut werden.
