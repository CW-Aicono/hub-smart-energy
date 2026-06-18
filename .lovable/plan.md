## Ziel
Im Dialog "Gefundene Geräte" für Loxone sollen **alle** vom Miniserver gelieferten Bausteine erscheinen – Zähler, Sensoren, Aktoren und beliebige weitere Control-Typen. Aktuell filtert eine Whitelist (`ASSIGNABLE_CONTROL_TYPES`) in `src/components/integrations/SensorsDialog.tsx` alles raus, was nicht explizit gelistet ist (z. B. `Jalousie`-Varianten, `IRoomControllerV2`, `AudioZone`, `Gate`, `Daytimer`, `Tracker`, viele Wetter-/Helligkeits-Controls usw.).

## Änderung
Datei: `src/components/integrations/SensorsDialog.tsx`

1. Konstante `ASSIGNABLE_CONTROL_TYPES` (Zeile 65–75) entfernen.
2. Filter-Zeile 138–141 vereinfachen zu:
   ```ts
   const meterSensors = sensors;
   ```
   Damit gilt für Loxone dieselbe Regel wie für alle anderen Gateways: was die Edge-Function `loxone-api` zurückliefert, wird gezeigt.

Die Edge-Function `loxone-api` liefert bereits jeden Control mit auswertbaren States (`Pushbutton`, `Switch`, `Dimmer`, `Jalousie`, `InfoOnlyAnalog/Digital`, `TextState`, alle `*Meter`, sowie unbekannte Typen via `detectSensorMeta`). Ein zusätzlicher clientseitiger Filter ist nicht nötig.

## Nicht-Änderungen
- Keine Änderung an `loxone-api`, DB oder Zuordnungslogik.
- Klassifizierung (Zähler / Sensor / Aktor) bleibt unverändert über `deviceClassification.ts`.
- Andere Gateways (Shelly, HA, EMS…) sind nicht betroffen, da der Filter ohnehin nur für `loxone_miniserver` griff.

## Test nach dem Deployment
1. Hard-Reload (Strg+Shift+R).
2. Standort → Loxone-Integration → "Gefundene Geräte" → "Aktualisieren".
3. Erwartet: deutlich mehr Einträge, inkl. aller Taster, Schalter, Jalousien, Raumregler, Wetter-Bausteine.
4. Zuordnung wie gehabt; danach erscheinen sie im jeweiligen Tab (Zähler / Sensoren / Aktoren).
