## Ziel
Einheitliche Icons für Zähler/Sensoren/Aktoren in allen Listen (Dialog „Gefundene Geräte" ↔ Tabs „Zähler / Sensoren / Aktoren") und korrekte Aktualisierung, sobald der Gerätetyp im Bearbeiten-Dialog umgestellt wird.

## Ist-Zustand (verifiziert)
Zwei unabhängige Icon-Funktionen mit unterschiedlicher Logik:
- `src/components/integrations/SensorsDialog.tsx` → lokale `getSensorIcon()` (Zap, ToggleLeft, Eye, Gauge, …) auf Basis von `unit` + `controlType`.
- `src/components/locations/MeterManagement.tsx` → eigene Icon-Auswahl für Zähler/Sensoren/Aktoren (Gauge/Zap/Activity/ToggleLeft/Thermometer …), ebenfalls aus `unit`/`type`.

Beide berücksichtigen den in der DB gespeicherten **effektiven Gerätetyp** (`meters.device_type` = meter/sensor/actuator) nicht bzw. nicht konsistent — deshalb bleibt nach „Zähler → Aktor"-Umstellung das alte Icon stehen (Icon wird aus `controlType`/`unit` gerechnet, nicht aus dem gespeicherten Typ).

`src/lib/deviceClassification.ts` liefert bereits die Wahrheit: `getResolvedDeviceType(sensor, deviceTypeMap)`.

## Umsetzung

### 1) Neue zentrale Datei `src/lib/deviceIcons.tsx`
Eine einzige Quelle der Wahrheit:
```
getDeviceIcon(input: {
  resolvedType: "meter" | "sensor" | "actuator";
  unit?: string | null;
  controlType?: string | null;
  haDomain?: string | null;   // aus entity_id abgeleitet
  category?: string | null;
}) : LucideIcon
```
Auswahllogik (in dieser Reihenfolge):
- **actuator** → `switch/pushbutton` → `ToggleLeft`; `light` → `Lightbulb`; `cover/blind/gate` → `DoorOpen`; sonst `ToggleLeft`.
- **meter** → Einheit `kWh/kW/W/Wh/MWh/V/A` → `Zap`; `m³/l` (Wasser) → `Droplets`; `m³` bei Gas-Kategorie → `Flame`; Wärme → `Thermometer`; Fallback `Gauge`.
- **sensor** → Einheit `°C/K` → `Thermometer`; `%` Feuchte → `Droplets`; `lux` → `Sun`; `Pa/bar` → `Gauge`; Bewegung → `Activity`; Fallback `Eye`.

Zusätzlich Helfer `getDeviceIconFromMeter(meter)` (nutzt `device_type`, `unit`, `control_type`, `sensor_uuid`-Domain) für die MeterManagement-Tabs.

### 2) `SensorsDialog.tsx` (Dialog „Gefundene Geräte")
- Lokales `getSensorIcon` entfernen, durch `getDeviceIcon({ resolvedType: getResolvedDeviceType(sensor, deviceTypeMap), … })` ersetzen.
- `deviceTypeMap` wird bereits im Dialog gebaut (User-Overrides + bereits verlinkte Meter) — Icon spiegelt damit sofort die aktuelle Auswahl wider.

### 3) `MeterManagement.tsx` (Tabs Zähler/Sensoren/Aktoren)
- Lokale Icon-Logik durch `getDeviceIconFromMeter(m)` ersetzen — für jeden Tab dieselbe Funktion.
- Damit erscheint ein Eintrag, der von „Zähler" auf „Aktor" umgestellt wurde, mit korrektem Aktor-Icon im Aktoren-Tab.

### 4) Reaktive Aktualisierung nach Typ-Wechsel
- `EditMeterDialog` schreibt `device_type` bereits in `meters`. Nach `save` wird `useMeters` invalidiert → Tabs rendern neu.
- Sicherstellen, dass der Dialog `getDeviceIcon` denselben `resolvedType` verwendet (aus lokalem Form-State live, nicht aus altem `controlType`).

### 5) Weitere Fundstellen prüfen und angleichen
- `DeviceCard` (Gateway-Kachel), `VirtualBalanceBreakdown`, ggf. Automations-Selektoren: falls sie Zähler/Sensor/Aktor-Symbole zeigen, ebenfalls `getDeviceIcon*` verwenden.

## Nicht Bestandteil
- Keine Änderung an Business-Logik, Klassifikationsregeln, Datenmodell oder Übersetzungen. Nur Icon-Vereinheitlichung.
