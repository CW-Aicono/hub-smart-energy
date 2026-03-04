

## Problem

Die Loxone-Fehlermeldungen ("Schneider Electric Power Tag 3ph. - Liefert keine Werte", "Shelly Pro 3 EM/EMData - Liefert keine Werte") werden vom Loxone Miniserver im **System Status** (messageCenter) gemeldet, aber unser System ignoriert diese Daten komplett.

Der bisherige Ansatz (Sensoren mit Wert 0 als fehlerhaft markieren) ist nicht praktikabel, da z.B. Wasserzähler (Impulszähler) legitimerweise längere Perioden ohne Verbrauch haben.

## Lösung: Loxone messageCenter auslesen

Die `LoxAPP3.json`-Strukturdatei, die wir **bereits bei jedem Sync abrufen**, enthält eine `messageCenter`-Sektion mit System-Status-Meldungen. Format:

```text
messageCenter.notifications[]:
  uid    - eindeutige Nachrichten-ID
  ts     - Unix-Timestamp
  type   - 10 = normale Nachricht
  title  - Titel der Meldung
  message - Beschreibung
  data.lvl - 1=Info, 2=Error, 3=SystemError
```

### Technische Änderungen

**1. `supabase/functions/loxone-api/index.ts` - messageCenter parsen**

In der `getSensors`-Action wird die `LoxAPP3.json` bereits geladen. Die `messageCenter`-Sektion wird zusätzlich ausgelesen und als `systemMessages` Array im Response zurückgegeben. Nur Meldungen mit `lvl >= 2` (Error, SystemError) werden berücksichtigt.

**2. `supabase/functions/loxone-periodic-sync/index.ts` - System-Meldungen als Fehler loggen**

Nach dem erfolgreichen Sensor-Sync werden die `systemMessages` aus der API-Response verarbeitet:
- Jede Error/SystemError-Meldung wird als `integration_error` mit `error_type = 'system_status'` eingetragen
- Deduplizierung über `sensor_name` (= messageCenter `uid`) verhindert Mehrfacheinträge
- Meldungen, die nicht mehr im messageCenter auftauchen, werden automatisch als resolved markiert
- Durch den bestehenden DB-Trigger wird automatisch eine Aufgabe erstellt/aufgelöst

**3. Keine Änderung an der Offline-Erkennung für Sensoren**

Die aktuelle `value !== null`-Logik bleibt unverändert. Wasserzähler und andere periodische Sensoren werden nicht fälschlich als offline markiert.

### Dateien

| Datei | Änderung |
|---|---|
| `supabase/functions/loxone-api/index.ts` | messageCenter aus LoxAPP3.json parsen, in Response aufnehmen |
| `supabase/functions/loxone-periodic-sync/index.ts` | systemMessages verarbeiten, als integration_errors loggen/resolven |

