
Ziel: Die eigentliche Ursache sauber beheben, damit beide Raspberry Pis in der Liegenschaft korrekt als online erscheinen und die vollständigen Home-Assistant-Geräte in der UI sichtbar und zuordenbar werden.

1. Hauptursachen, die die Analyse ergeben hat
- Ursache A: Der Sensor-/Geräteabruf aus der UI scheitert nicht fachlich, sondern technisch auf HTTP-Ebene.
  - Im Browser schlägt `POST /functions/v1/gateway-ws` mit `Failed to fetch` fehl.
  - Dieselbe Funktion liefert per direktem Backend-Test korrekt Daten zurück.
  - Das zeigt: `getSensors` funktioniert serverseitig, aber der Browser-Request scheitert sehr wahrscheinlich an fehlenden CORS-Headern im HTTP-Zweig von `gateway-ws`.
- Ursache B: Der Status in der Liegenschaftsübersicht ist veraltet bzw. falsch modelliert.
  - In der Datenbank stehen beide AICONO-Gateway-Integrationen bereits auf `sync_status = success`.
  - Die Übersicht arbeitet aber nur mit `location_integrations.sync_status` und ignoriert die tatsächlichen `gateway_devices.last_heartbeat_at` / `status`.
  - Dadurch kann die Übersicht offline/pending zeigen, obwohl die Detailkarte aus den echten Gateway-Geräten korrekt „online“ ableitet.
- Ursache C: Für „Schule Buchenberg Altbau“ liegen im Backend aktuell wirklich nur 12 Geräte vor.
  - Das ist kein reines UI-Problem.
  - Der direkte Backend-Abruf für `locationIntegrationId = a32d...` liefert exakt diese 12 Geräte.
  - Die Tabelle `gateway_device_inventory` bestätigt ebenfalls nur 12 Einträge für das Pi `aicono-ems-4a2cee`.
  - Das andere Pi (`aicono-ems-7e4852`) liefert dagegen 44 Geräte.
- Ursache D: Das Add-on filtert beim Snapshot die Geräte nicht über `entity_filter`, aber der verfügbare HA-State-Bestand (`latestHAStates`) wird trotzdem durch den aktuellen HA-Zustand bestimmt.
  - Deshalb müssen wir unterscheiden zwischen:
    - „Snapshot-Code filtert falsch“ und
    - „dieses Pi sieht in Home Assistant tatsächlich nur diese 12 relevanten Entities“.
  - Für Buchenberg sieht aktuell alles danach aus, dass das Add-on/HA auf diesem Pi nur diese 12 Entities im State-Feed verfügbar hat oder die übrigen Geräte auf diesem Pi nicht in `latestHAStates` landen.

2. Geplanter Fix – Backend
- `supabase/functions/gateway-ws/index.ts`
  - Den HTTP-Antworten im `handleHttpAction()` konsequent dieselben CORS-Header geben wie andere Funktionen.
  - Besonders für:
    - erfolgreiche `getSensors`-Antwort
    - 400/500-Fehler
    - OPTIONS-Preflight
  - Dadurch kann der Browser die Funktion endlich direkt aufrufen, statt mit `Failed to fetch` abzubrechen.
- Zusätzlich Logging ergänzen:
  - im HTTP-Zweig `gateway-ws` bei `getSensors`
  - mit `locationIntegrationId`, Anzahl gefundener Meter, Automationen, Inventory-Einträge
  - damit künftig sofort sichtbar ist, ob ein Problem aus HA-Daten, DB oder Transport kommt.

3. Geplanter Fix – Statuslogik in der Übersicht
- `src/hooks/useLocationStatus.tsx`
  - Die Übersicht nicht mehr nur auf `location_integrations.sync_status === "success"` stützen.
  - Für `aicono_gateway` zusätzlich die echten `gateway_devices` der jeweiligen `location_integration_id` berücksichtigen:
    - online, wenn mindestens ein zugehöriges Gateway-Gerät `status = online` hat und der letzte Heartbeat jünger als 3 Minuten ist
    - optional „syncing“, wenn `offline_buffer_count > 0`
  - Damit wird die Übersicht dieselbe Wahrheit anzeigen wie die Detailkarte.
- Vorteil:
  - Keine Schein-Offlines mehr
  - Robust gegen verspätete oder hängende `sync_status`-Felder

4. Geplanter Fix – Geräteanzeige in der UI
- `src/components/locations/MeterManagement.tsx`
  - Die aktuelle Loxone-/Gateway-Mischlogik vereinheitlichen und auf die zentrale Geräteklassifizierung umstellen.
  - Die Zuordnung in Tabs (`Zähler`, `Sensoren`, `Aktoren`) soll für AICONO Gateway ausschließlich auf den zurückgegebenen Inventar-Geräten plus vorhandenen DB-Overrides (`device_type`) basieren.
  - Bereits angelegte Messstellen mit `sensor_uuid` sollen weiterhin dedupliziert werden.
- `src/lib/deviceClassification.ts`
  - Die Klassifikation für Home-Assistant-/AICONO-Gateway-Geräte robuster machen:
    - `switch`, `light`, `cover`, `climate`, `fan`, `lock`, `valve` sicher als Aktoren
    - `sensor` mit `device_class`/`unit` für Energie, Leistung, Wasser, Gas sicher als Zähler
    - Rest als Sensor
  - `MeterManagement.tsx` soll diese zentrale Logik benutzen statt lokaler Parallel-Logik.
- Ergebnis:
  - Einheitliches Verhalten „wie Loxone“
  - Geräte per Stift zu `Zähler`, `Aktor`, `Sensor` umklassifizierbar
  - weniger Sonderfälle und weniger Drift zwischen Tabs

5. Geplanter Fix – Add-on-Analyse für das schwächere Pi
- `docs/ha-addon/index.ts`
  - Tieferes Debug-Logging nur für den Snapshot-Aufbau ergänzen:
    - Anzahl `latestHAStates`
    - Anzahl Geräte pro Domain
    - Anzahl erkannter Kategorien (`meter`, `actuator`, `sensor`)
    - optional die ersten 20 Entity-IDs im Snapshot
  - Separat loggen:
    - wie viele States aus HA `/states` kamen
    - wie viele nur aus lokalem Cache stammen
- Ziel:
  - Sicher feststellen, warum Pi `192.168.188.141` nur 12 Geräte liefert, obwohl laut Screenshot beide Pis „gleich“ wirken.
- Erwartete wahrscheinliche Erklärung:
  - Das Pi ist zwar online und korrekt verbunden, aber Home Assistant stellt diesem konkreten Add-on aktuell nur die 12 System-/Basis-Entities bereit oder die erwarteten Geräte sind auf diesem Host/HA-Setup nicht im globalen State-Feed vorhanden.

6. Validierung nach dem Fix
- Test 1: Browser
  - Dialog „Gefundene Geräte“ öffnen
  - prüfen, dass kein `Failed to fetch` mehr erscheint
  - prüfen, dass `getSensors` im Browser sauber lädt
- Test 2: Übersicht
  - beide Liegenschaften müssen innerhalb eines Heartbeat-Zyklus als online erscheinen
  - keine Diskrepanz mehr zwischen Übersicht und Detailansicht
- Test 3: Realschule
  - erwartbar weiter ca. 44 Geräte sichtbar
  - Zähler/Aktoren/Sensoren korrekt verteilt
- Test 4: Schule Buchenberg Altbau
  - zunächst prüfen, ob nach CORS-Fix wenigstens dieselben 12 Geräte sauber sichtbar werden
  - anschließend mit neuem Add-on-Debug klären, warum dort nicht die gleichen HA-Entities ankommen
- Test 5: Klassenzuordnung
  - ein gefundenes Gerät per Stift öffnen
  - Typ auf `Zähler`, `Sensor` oder `Aktor` setzen
  - prüfen, dass das Gerät danach im richtigen Tab erscheint

7. Erwartetes Ergebnis nach Umsetzung
- Der Geräte-Dialog funktioniert wieder technisch zuverlässig.
- Die Übersicht zeigt den echten Online-Status der AICONO Gateways.
- Die Geräteverwaltung zeigt die aus dem Gateway gelieferten Geräte konsistent an.
- Für das zweite Pi ist danach eindeutig unterscheidbar:
  - UI-/Transportproblem behoben
  - verbleibendes Problem ist dann wirklich ein Add-on-/HA-Datenproblem und nicht mehr ein Cloud- oder Frontend-Problem.

8. Technische Details
- Betroffene Dateien:
  - `supabase/functions/gateway-ws/index.ts`
  - `src/hooks/useLocationStatus.tsx`
  - `src/components/locations/MeterManagement.tsx`
  - `src/lib/deviceClassification.ts`
  - `docs/ha-addon/index.ts`
- Keine neue Tabelle erforderlich.
- Keine Migration erforderlich, sofern wir nur Logik und Logging anpassen.
- Wichtigster Fix zuerst:
  - CORS im HTTP-Pfad von `gateway-ws`
  - danach Statuslogik
  - danach UI-Klassifikation
  - zuletzt Add-on-Debug für das Pi mit nur 12 Geräten
