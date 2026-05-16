# Bereits zugeordnete Geräte an einen anderen Standort übernehmen

## Problem

Im Dialog **„Gefundene Geräte"** eines Gateways werden Sensoren mit dem Hinweis *(zugeordnet)* angezeigt und sind nicht auswählbar, sobald ihre `sensor_uuid` bereits in einem `meters`-Datensatz vorkommt – **egal an welcher Liegenschaft oder an welchem Gateway**.

Dadurch lässt sich ein Gerät, das früher an Liegenschaft A (oder gar an gar keiner Liegenschaft mehr) angelegt war, nicht erneut an Liegenschaft B (der aktuell mit dem Gateway verknüpften Liegenschaft) zuordnen, obwohl genau das gewünscht ist (z. B. nach Umzug, Gateway-Wechsel oder bei verwaisten Datensätzen).

## Ziel

Im Dialog soll bei einem bereits zugeordneten Gerät erkennbar sein, **wo** es aktuell hängt, und der Nutzer soll es **mit einem Klick an die aktuelle Liegenschaft + das aktuelle Gateway übernehmen** können. Historische Messwerte bleiben dabei erhalten (gleicher Meter-Datensatz, nur `location_id` / `location_integration_id` werden aktualisiert).

## Umsetzung

### 1. Datenmodell-Logik

Pro `sensor_uuid` werden im `SensorsDialog` drei Zustände unterschieden:

| Status | Bedingung | UI |
|---|---|---|
| **Frei** | keine Meter-Row mit dieser `sensor_uuid` | Checkbox aktiv (wie bisher) |
| **Hier zugeordnet** | Meter-Row mit gleicher `location_id` **und** gleicher `location_integration_id` wie der aktuelle Kontext | Haken + Hinweis *(zugeordnet)* (wie bisher) |
| **Woanders zugeordnet** | Meter-Row existiert, aber `location_id` und/oder `location_integration_id` weichen ab (auch wenn `location_id` NULL ist) | Hinweis mit Standort/Gateway-Name + Button **„An diese Liegenschaft übernehmen"** |

### 2. UI im SensorsDialog

- Statt nur *(zugeordnet)*: zusätzliche Zeile mit dem aktuellen Standort und Gateway des verknüpften Meters (z. B. *„Aktuell: Realschule am Buchenberg · Loxone Miniserver"* bzw. *„Aktuell: keine Liegenschaft"*).
- Bei *Woanders zugeordnet* erscheint ein kleiner Button **Übernehmen** (Icon `ArrowRightLeft`).
- Klick öffnet einen Bestätigungs-Dialog mit Inhalt:
  - „Das Gerät **{Name}** ist aktuell an **{alte Liegenschaft / kein Standort}** über Gateway **{altes Gateway / keins}** angelegt."
  - „Es wird zur Liegenschaft **{neue Liegenschaft}** verschoben und mit Gateway **{neues Gateway}** verknüpft. Alle bisherigen Zählerstände und Messwerte bleiben erhalten."
  - Optionen: *Abbrechen* / *Übernehmen*

### 3. Server-Aktion

Eine neue Hilfsfunktion `reassignMeterToCurrentGateway(meterId, newLocationId, newLocationIntegrationId)`:

```ts
await supabase.from("meters")
  .update({
    location_id: newLocationId,
    location_integration_id: newLocationIntegrationId,
    capture_type: "automatic",
    is_archived: false,            // falls archiviert
  })
  .eq("id", meterId);
```

Anschließend `useMeters().refetch()` triggern.

### 4. Sonderfälle

- **Mehrere Treffer pro `sensor_uuid`** (sollte nicht vorkommen, kann aber bei Altdaten passieren): erste Row gewinnt, die übrigen werden in der Bestätigung mit aufgeführt und unverändert gelassen.
- **Archivierte Meter** mit gleicher `sensor_uuid`: ebenfalls als „Woanders zugeordnet" behandeln, Übernahme reaktiviert sie (`is_archived = false`).
- **Aktuell verbundenes Gateway** = Gateway, dessen Dialog gerade offen ist → `locationIntegration.id` und `locationIntegration.location_id`.

## Technische Details

- Datei `src/components/integrations/SensorsDialog.tsx`:
  - `assignedSensorIds` durch `assignedMetersBySensorId: Map<sensorUuid, MeterRow>` ersetzen.
  - Neue Render-Logik in der Tabellenzeile (Status-Switch wie oben).
- Neue Komponente `src/components/integrations/AdoptMeterDialog.tsx` (kleiner AlertDialog).
- Neue Helper-Funktion in `src/hooks/useMeters.tsx`: `reassignMeter(meterId, { location_id, location_integration_id })`.
- Für den Anzeigetext der „alten" Liegenschaft: bereits geladenes Set aus `useLocations()` joinen; für Gateway-Name aus `useIntegrations()` bzw. `location_integrations`.
- Keine Schema-Migration nötig.

## Abgrenzung

Dieser Plan deckt den im Screenshot beschriebenen Fall ab. Den umfassenderen „Gateway-Tausch"-Workflow (Massen-Umzug aller Meter eines Gateways) gibt es bereits über `ReplaceGatewayDialog` und bleibt unverändert.
