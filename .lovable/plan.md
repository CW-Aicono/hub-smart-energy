

## Plan: Shelly Gen-1-Geräte (Plug S, 1, 1PM etc.) unterstützen

### Problem
Die `shelly-api` Edge Function parst nur Gen-2+-Gerätedaten (`switch:0`, `em:0`, `emdata:0`, `temperature:0`). Gen-1-Geräte wie der Shelly Plug S verwenden eine andere Struktur mit `relays[]` und `meters[]` Arrays. Diese Geräte werden daher komplett ignoriert.

### Änderung

**Datei: `supabase/functions/shelly-api/index.ts`**

Nach dem bestehenden Gen-2-Parsing (switch/em/emdata/temperature) zusätzliche Blöcke für Gen-1-Strukturen einfügen:

1. **`relays` Array** — Schaltaktoren (Gen 1):
   - Iteriere über `deviceStatus.relays[]`
   - Erstelle Sensor mit `type: "switch"`, `value: "Ein"/"Aus"`, `rawValue: 0/1`
   - Sekundärwert: `power` aus dem zugehörigen `meters[i]` Eintrag (falls vorhanden)

2. **`meters` Array** — Leistungsmessung (Gen 1):
   - Iteriere über `deviceStatus.meters[]`
   - Erstelle Sensor mit `type: "power"`, `unit: "W"`, Wert aus `meters[i].power`
   - Nur wenn kein zugehöriges `relay` existiert (um Duplikate zu vermeiden — wenn ein Relay da ist, wird die Leistung als Sekundärwert dort angezeigt)

3. **`tmp` Objekt** — Temperatur (Gen 1):
   - Prüfe `deviceStatus.tmp`
   - Erstelle Sensor mit `type: "temperature"`, `unit: "°C"`, Wert aus `tmp.tC`

### Technische Details

```text
Gen-1 API-Struktur (Shelly Plug S):
{
  "relays": [{ "ison": true, "has_timer": false }],
  "meters": [{ "power": 7.24, "total": 12345 }],
  "tmp":    { "tC": 35.2, "tF": 95.4, "is_valid": true },
  "_dev_info": { "name": "Plug S Office", "model": "SHPLG-S" }
}

Gen-2 API-Struktur (bereits unterstützt):
{
  "switch:0": { "output": true, "apower": 0.8 },
  "em:0":     { "total_act_power": 100.5 },
  "_dev_info": { "name": "Sender", "model": "SPEM-003CEBEU" }
}
```

- Gen-1-Parsing wird **nach** dem Gen-2-Parsing eingefügt
- Ein Guard verhindert Duplikate: wenn `switch:0` bereits existiert, wird `relays[0]` übersprungen
- Keine Änderungen an Frontend-Code nötig — die Sensoren haben dasselbe Format wie Gen-2-Sensoren

