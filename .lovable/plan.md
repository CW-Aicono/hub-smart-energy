## Bug
Im Datei `src/components/integrations/SensorsDialog.tsx` filtert eine Whitelist namens `METER_CONTROL_TYPES` bei Loxone-Integrationen alles weg, was kein Zähler ist. Aktor-/Sensor-Typen wie **Pushbutton (Taster), InfoOnlyDigital, InfoOnlyAnalog, TimedSwitch, Dimmer, LightController, Jalousie** fehlen — deshalb taucht `Reset Max NSHV Nord` nicht im „Gefundene Geräte"-Dialog auf, obwohl die Edge-Function ihn liefert.

## Fix (minimal, 1 Datei, 1 Zeile)

Die Whitelist in `src/components/integrations/SensorsDialog.tsx` Zeile 65 erweitern, damit auch Aktor- und Sensor-Controls zuordbar werden:

```ts
const METER_CONTROL_TYPES = new Set([
  // Zähler
  "Meter", "EFM", "EnergyManager2", "Fronius",
  // Sensoren
  "InfoOnlyAnalog", "InfoOnlyDigital", "TextState",
  // Aktoren
  "Switch", "Pushbutton", "TimedSwitch", "Dimmer",
  "LightControllerV2", "Jalousie",
  // Gateway-spezifisch
  "access_point", "switch", "gateway",
]);
```

Die Variable heißt zwar `METER_CONTROL_TYPES`, wird aber faktisch als Whitelist für **alle** im Dialog zuordbaren Geräte verwendet — ich benenne sie deshalb gleich passend in `ASSIGNABLE_CONTROL_TYPES` um (reine Umbenennung, ändert nichts an der Logik).

## Was sich für dich ändert
- Im Dialog „Gefundene Geräte" erscheinen ab dem Fix **zusätzlich**:
  - alle Taster (z. B. `Reset Max NSHV Nord`)
  - normale Schalter, Dimmer, Licht-Controller, Jalousien
  - digitale/analoge Info-Eingänge (Türkontakte, Temperatursensoren ohne Meter-Block etc.)
- Bereits zugeordnete Zähler bleiben unverändert.
- Klassifizierung als „Aktor" vs. „Sensor" passiert wie bisher automatisch über `src/lib/deviceClassification.ts` — kein zusätzlicher Code nötig.

## Nicht enthalten (bewusst)
- Keine Änderung an der Edge-Function `loxone-api`
- Keine DB-Migration
- Keine Logik-Änderung in `LocationAutomation.tsx`
- Keine Übersetzungs- oder UI-Texte angefasst

## Schritte nach dem Fix (für dich)
1. Nach Implementierung: Browser hart neu laden (Strg+Shift+R)
2. Standort öffnen → Loxone-Integration → **„Gefundene Geräte"** klicken
3. Oben rechts auf **„Aktualisieren"** klicken (umgeht den 1h-Struktur-Cache)
4. In der Liste nach `Reset Max NSHV Nord` suchen → Häkchen → **Zuweisen**
5. Danach erscheint der Taster im Tab **Aktoren** sowie im Automation-Dialog
