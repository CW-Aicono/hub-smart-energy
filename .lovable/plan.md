
Ziel: Die Shelly-Namen so stabil machen, dass überall die in der Shelly Cloud vergebenen Bezeichnungen erscheinen – nicht die Geräte-ID.

1. Ursache sauber eingrenzen
- `shelly-api` liefert Namen aktuell aus `/device/all`, fällt sonst auf `_dev_info.name` und am Ende auf `deviceId` zurück.
- Tiefere Analyse: Das Problem ist sehr wahrscheinlich nicht nur ein einfaches `lowercase/trim`-Thema, sondern ein ID-Mismatch zwischen:
  - `/device/all` bzw. Metadatenliste
  - `/device/all_status`
  - Sensor-IDs wie `deviceId_switch0`, `deviceId_em0_power` usw.
- Zusätzlich nutzt die App an mehreren Stellen noch gespeicherte Namen aus der DB (`floor_sensor_positions.sensor_name`, `meters.name`) statt immer Live-Namen.

2. Shelly-Integration robuster machen
- `supabase/functions/shelly-api/index.ts` erweitern:
  - zentrale `normalizeShellyId()` Funktion einführen
  - nicht nur `toLowerCase().trim()`, sondern auch Varianten normalisieren:
    - Doppelpunkte entfernen
    - Bindestriche entfernen
    - Whitespace entfernen
  - Namensauflösung über mehrere Kandidaten versuchen:
    - `d.id`
    - `d._id`
    - falls vorhanden weitere Gerätekennungen aus der Liste
  - beim Lookup aus `devices_status` ebenfalls mehrere Varianten prüfen
- Zusätzlich eine zweite Namensquelle vorsehen:
  - Shelly Cloud v2 prüfen/nutzen, um pro Device gezielt `settings` oder strukturierte Gerätedaten zu laden
  - Falls dort der benutzervergebene Anzeigename stabiler geliefert wird, diesen bevorzugen
- Fallback-Reihenfolge definieren:
  1. Shelly-Cloud Anzeigename aus Geräte-Metadaten
  2. alternativer Cloud-Metadatenname / Settings-Name
  3. `_dev_info.name`
  4. nur als letzter Notnagel `deviceId`

3. Rate-Limit und API-Pattern korrekt behandeln
- Shelly-Doku zeigt 1 Request/Sekunde Limit.
- Deshalb den bisherigen parallelen Abruf von `/device/all` und `/device/all_status` überdenken:
  - entweder sequentiell
  - oder besser auf ein stabileres v2-Muster umstellen
- Ziel: keine sporadischen Namensausfälle mehr, bei denen wegen 429/Fehlern wieder die Geräte-ID angezeigt wird.

4. App so anpassen, dass Live-Namen wirklich angezeigt werden
- Nicht nur die Edge Function korrigieren, sondern auch die UI-Stellen prüfen, die alte DB-Namen weiterverwenden:
  - `src/hooks/useLiveSensorValues.ts` nutzt aktuell bei Floorplans `pos.sensor_name` statt `sensor.name`
  - `src/components/dashboard/FloorPlanWidget.tsx`
  - `src/components/dashboard/FloorPlanDashboardWidget.tsx`
  - `src/components/locations/FloorPlanDialog.tsx`
- Plan:
  - überall, wo Live-Sensoren geladen sind, `sensor.name` bevorzugen
  - gespeicherte Namen nur als Fallback verwenden
  - bestehende Auto-Sync-Logik für `floor_sensor_positions.sensor_name` beibehalten bzw. ausweiten

5. Bereits gespeicherte alte Geräte-ID-Namen bereinigen
- Da einige Messstellen/Positionen vermutlich schon mit Geräte-ID angelegt wurden, reicht ein Fix in `shelly-api` allein nicht.
- Bei Implementierung auch vorhandene Datenpfade berücksichtigen:
  - neue automatische Zählerzuordnung soll den echten Shelly-Namen speichern
  - bestehende Floorplan-Positionen sollen sich beim Laden auf Live-Namen aktualisieren
  - optional: bestehende `meters.name` nur dann automatisch aktualisieren, wenn Name noch wie eine technische Shelly-ID aussieht

6. Validierung nach Umsetzung
- Prüfen an einem konkreten Shelly-Standort mit Beispielen wie:
  - Kalander groß
  - Plug S Office
  - Sender
  - Empfänger
- Kontrollieren in:
  - Sensor-Auswahldialog
  - Zählerzuordnung
  - Live-Ansichten
  - Grundriss-Labels
- Sicherstellen, dass keine Labels mehr als reine ID wie `3ce90e6f3b04` oder `... Leistung 0` erscheinen, wenn in der Shelly Cloud ein Name vorhanden ist.

Technische Details
- Hauptdatei Backend:
  - `supabase/functions/shelly-api/index.ts`
- Relevante Frontend-Dateien:
  - `src/hooks/useLiveSensorValues.ts`
  - `src/components/locations/FloorPlanDialog.tsx`
  - `src/components/dashboard/FloorPlanWidget.tsx`
  - `src/components/dashboard/FloorPlanDashboardWidget.tsx`
  - ggf. weitere Sensorlisten wie `SensorsDialog`, `AddMeterDialog`, `EditMeterDialog`
- Wichtigste Erkenntnis aus der Recherche:
  - Die Shelly Cloud API ist im bisherigen Kommunikationspfad veraltet/deprecated.
  - Die neuere v2-Kommunikation arbeitet strukturierter mit Device-IDs und Status/Settings.
  - Für eine dauerhaft stabile Namensauflösung ist ein robusteres Device-Mapping bzw. ggf. Wechsel auf die v2-Metadatenstrategie der richtige Weg.
