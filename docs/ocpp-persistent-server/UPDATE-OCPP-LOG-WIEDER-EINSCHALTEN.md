# OCPP-Log kommt nicht mehr an — so schaltest du es wieder ein

**Symptom:** Die Wallboxen sind online (Heartbeat aktuell, Ladevorgänge funktionieren),
aber im Reiter „OCPP-Log" erscheinen keine neuen Zeilen mehr.

**Ursache in diesem Fall:** Der OCPP-Server auf dem Hetzner-Rechner sendet keine
Log-Nachrichten mehr, weil der Schalter `OCPP_FRAME_LOGGING_ENABLED` in seiner
Konfigurationsdatei fehlt oder auf `false` steht. Das Backend selbst ist in Ordnung
(getestet: ein Testeintrag wurde korrekt gespeichert).

## Schritt für Schritt (ca. 3 Minuten)

1. Melde dich wie gewohnt auf dem Server an (SSH-Fenster öffnen).

2. Wechsle in den Ordner des OCPP-Servers:

   ```
   cd ~/ocpp-persistent-server
   ```

   (Falls der Ordner anders heißt: dort, wo die Datei `docker-compose.yml` liegt.)

3. Öffne die Einstellungsdatei:

   ```
   nano .env
   ```

4. Suche die Zeile `OCPP_FRAME_LOGGING_ENABLED=...`.

   - Steht dort `false` → ändere es in `true`.
   - Gibt es die Zeile gar nicht → schreibe sie unten neu dazu:

     ```
     OCPP_FRAME_LOGGING_ENABLED=true
     ```

5. Speichern und schließen: `Strg` + `O`, dann `Enter`, dann `Strg` + `X`.

6. Server neu starten:

   ```
   docker compose up -d --build
   ```

7. Prüfen, ob das Logging jetzt an ist:

   ```
   curl -s http://localhost:8080/health
   ```

   In der Antwort muss `"frameLogging":true` stehen.

8. Warte 1–2 Minuten und schaue in der App unter
   **Ladeinfrastruktur → Ladepunkt → OCPP-Log** nach. Es sollten wieder
   `MeterValues`- und `Heartbeat`-Zeilen erscheinen.

## Gut zu wissen

- Ab dieser Version ist das Frame-Logging **standardmäßig an**. Fehlt die Zeile in der
  `.env`, wird trotzdem geloggt.
- Zusätzlich gibt es einen Schalter im Backend (`ocpp_message_logging_enabled`) sowie den
  Notfallmodus (`backend_emergency_mode`). Ist der Notfallmodus an, wird das Logging
  bewusst pausiert, um die Datenbank zu schonen.
- In der App erscheint jetzt eine gelbe Warnung im OCPP-Log, wenn länger als 15 Minuten
  keine Nachricht mehr angekommen ist — damit fällt so ein Ausfall sofort auf.
