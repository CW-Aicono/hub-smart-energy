

## Plan: Sensoren & Aktoren aller Integrationen für Automation verfügbar machen

### Problem
Aktuell sucht `LocationAutomation.tsx` nur nach Loxone- oder Home-Assistant-Integrationen (Zeilen 137–143). Shelly, ABB, Tuya und alle anderen Gateway-Typen werden ignoriert. Ohne eine dieser beiden Integrationen zeigt das System "Kein Loxone Miniserver verbunden" — obwohl z.B. Shelly-Geräte vorhanden sind.

### Änderungen

#### 1. `LocationAutomation.tsx` — Alle Gateway-Integrationen nutzen
- Statt nur `loxone` / `home_assistant` zu suchen: **alle** aktiven Integrationen filtern, die im `GATEWAY_DEFINITIONS` registriert sind
- `useLoxoneSensorsMulti` statt `useLoxoneSensors` verwenden, um Sensoren aller aktiven Integrationen parallel zu laden
- Sensoren aller Integrationen zusammenführen (merge)
- Im Aktoren-Dialog: Sensoren nach Integration gruppiert anzeigen (mit Badge für den Integrationsnamen)
- "Automation hinzufügen"-Button aktivieren sobald **mindestens eine** Integration vorhanden ist
- Beim Speichern: `location_integration_id` aus der ersten Aktion ableiten (oder die des gewählten Aktors)

#### 2. Translations aktualisieren
- `auto.actuatorsTitle`: "Verfügbare Aktoren – Loxone Miniserver" → "Verfügbare Sensoren & Aktoren"
- `auto.actuatorsDesc`: generisch formulieren ("Sensoren und steuerbare Aktoren aller verbundenen Integrationen")
- `auto.noMiniserver` → "Keine Integration mit diesem Standort verbunden."
- `auto.connectHint` → 'Verbinden Sie ein Gateway unter „Integrationen".'

#### 3. Bestehende Funktionalität bleibt erhalten
- Einzelne Loxone/HA-Standorte funktionieren weiterhin identisch
- `AutomationRuleBuilder` erhält weiterhin das `sensors`-Array (jetzt aus allen Integrationen zusammengeführt)
- Ausführung nutzt weiterhin die `location_integration_id` aus der gespeicherten Automation

### Technische Details
- `GATEWAY_DEFINITIONS` aus `gatewayRegistry.ts` wird importiert, um zu prüfen welche Integrationstypen Sensoren liefern können
- `useLoxoneSensorsMulti` akzeptiert bereits `integrationIds[]` und `integrationTypes[]` — genau das was wir brauchen
- Merge: `sensorQueries.flatMap(q => q.data || [])` mit Integration-Prefix für Gruppierung

