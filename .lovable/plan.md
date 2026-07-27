## Zwischenstand (verifiziert)

- Staging-Worker feuert weiter 408, zuletzt 19:45:35 UTC — **nach** deiner Trennung von Rathaus.
- Rathaus scheidet damit als Verursacher aus.
- Verbleibende Kandidaten (Sessions in den letzten 72 h): **Zentrale ESB**, **AICONO Zentrale**, **Jugendzentrum Weiss**.
- Die 408 tragen `stage=ws-open`, `link_id` bleibt aber NULL — der Worker loggt die Ziel-Integration im Fehlerfall noch nicht. Ohne diese Info können wir keinen der drei verlässlich beschuldigen.

## Ziel

408 dem konkreten Miniserver zuordnen — **bevor** irgendeine Änderung an Credentials oder Konfiguration passiert.

## Schritte

### Schritt 1: Worker-Patch — Integration im Fehlerlog mitschicken

In `docs/loxone-ws-worker/index.ts` zwei Anpassungen an der Fehlerstelle im `connect()`-Pfad:

1. `details.location_integration_id` und `details.miniserver_serial` in das `bridgeLog("error", "ws_connect_failed", ...)` mitschreiben. Beide Werte kennt der Worker vor dem `LxCommunicator.open()`.
2. `details.host` (der aufgelöste Cloud-DNS-Host) zusätzlich mitschicken, um DNS-/Relay-Wechsel als Zweitursache ausschließen zu können.

Kein Verhalten wird verändert, nur mehr Kontext im Fehlerlog. Version-Bump auf `phase7.7-error-attribution`, damit sichtbar ist, welche Diagnose-Stufe läuft.

Keine DB-Migration nötig (`bridge_event_log.details` ist bereits `jsonb`).

### Schritt 2: Auswertung (SQL, nach Deploy)

Nach ~10 Minuten Laufzeit läuft die Aggregation `GROUP BY details->>'location_integration_id'`:
- Alle 408 aus einer Integration → dieser Miniserver ist der Verursacher.
- Verteilt → generisches Problem im Cloud-Relay-Pfad, nicht miniserverspezifisch.

### Schritt 3: Erst dann Kontrollexperiment

Wenn Schritt 2 einen der beiden „dual-homed" Miniserver (AICONO Zentrale) benennt, richtest du auf **genau diesem** einen zweiten User ein. Wenn stattdessen ESB oder Jugendzentrum Weiss auftauchen, ist der zweite-User-Test nicht mehr aussagekräftig (nur AICONO Zentrale läuft laut deiner Aussage parallel auf Hetzner-Live), und wir suchen an anderer Stelle weiter.

## Was ich NICHT tue

- Keine Änderung am `link_id`-Spaltenverhalten (Downstream-Views hängen daran).
- Keine Retry-/Watchdog-Änderung, bis die Ursache belegt ist.
- Keine Fixes „auf Verdacht" an den drei verbleibenden Miniservern.
