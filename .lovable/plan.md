Der neue Screenshot klärt die Ursache: Der SOC kommt nicht als eigener SOC-UUID/VI, sondern als Ausgang `Slvl` am Loxone-Baustein/Zähler „Speicher“. Die aktuelle Implementierung sucht primär nach `SOC`/`StateOfCharge` und hat dadurch beim Rathaus einen falschen Fronius-Kandidaten gespeichert; `Slvl` wird weder im Worker noch im Sync als SOC-Rolle ausgewertet.

## Plan

1. **SOC-Erkennung in der Loxone-API korrigieren**
   - `Slvl` als offiziellen SOC-Ausgang erkennen: „Storage level or state of charge“.
   - Discovery so anpassen, dass `Meter`/„Speicher“-Bausteine mit `Slvl` Vorrang vor Fronius-/SOC-Namensheuristiken bekommen.
   - Auch dann erkennen, wenn `Slvl` nur in `/jdev/sps/io/<Speicher-Block>/all` als Output erscheint und nicht als eigene sichtbare UUID in Loxone Config/App.
   - Bestehende gespeicherte falsche SOC-UUIDs automatisch neu validieren: Wenn der gespeicherte Kandidat keinen plausiblen 0–100-Wert liefert, wird neu gesucht und der `Slvl`-Pfad ersetzt.

2. **WebSocket-Worker erweitern**
   - Neue State-Rolle `soc` ergänzen.
   - State-/Output-Patterns um `Slvl`, `storageLevel`, `stateOfCharge`, `SOC`, `ladezustand` erweitern.
   - Bei `soc` Werte 0–100 zulassen und nicht als Leistungswert behandeln.
   - Der Worker sendet SOC-Events mit `role: "soc"`, aber weiterhin mit der Speicher-Block-UUID als stabile Zuordnung.

3. **Ingest-Route für Live-SOC ergänzen**
   - `gateway-ingest?action=bridge-readings` verarbeitet `role: "soc"` separat.
   - Für SOC keine Leistungswerte in `bridge_raw_samples` schreiben.
   - Stattdessen den passenden Speicher über Speicher-Zähler/Standort finden und aktualisieren:
     - `energy_storages.current_soc_pct`
     - `energy_storages.soc_updated_at`
     - falls eindeutig: `energy_storages.power_meter_id` und `soc_sensor_uuid` auf den Speicher-Baustein setzen.
   - SOC zusätzlich per Live-Broadcast senden, damit das Widget nicht auf den nächsten Poll warten muss.

4. **Rathaus-Datensatz reparieren**
   - Den vorhandenen Speicher „Speicher Rathaus“ vom falschen Fronius-Kandidaten auf den Zähler/Baustein „Speicher“ umstellen.
   - `power_meter_id` auf den Rathaus-Zähler „Speicher“ setzen.
   - `current_soc_pct` wird danach über `Slvl` aktualisiert; erwarteter Wert aktuell: 100 %.

5. **EnergyFlowMonitor live aktualisieren**
   - Zusätzlich zum Datenbankwert `current_soc_pct` SOC-Broadcasts mit `role: "soc"` auswerten.
   - Anzeige priorisiert Live-SOC, fällt aber auf den gespeicherten Backend-Wert zurück.

6. **Verifikation**
   - Backend-Logs prüfen: `Slvl` wird als SOC-Kandidat erkannt.
   - Datenbank prüfen: `energy_storages.current_soc_pct` für Rathaus ist `100` und `soc_updated_at` gesetzt.
   - Widget prüfen: Speicher zeigt `SOC: 100 %`.