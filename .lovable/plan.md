

## Analyse: Solar-Azimut Vorzeichenfehler

Das Problem liegt in Zeile 110 der Edge Function:

```typescript
if (hourAngle > 0) solarAz = -solarAz; // afternoon = west
```

Die Konvention soll sein: **"von Süd gemessen, positiv nach Westen"**. Aber `acos()` gibt immer einen positiven Wert zurück, und der Code negiert ihn nachmittags (`hourAngle > 0`). Das führt zu:

- **Vormittag** (Sonne im Osten): `solarAz = +positiv` → falsch, sollte negativ sein
- **Nachmittag** (Sonne im Westen): `solarAz = -negativ` → falsch, sollte positiv sein

Die Vorzeichen sind genau vertauscht. Bei einem Panel mit Azimut 150° (Südost, `panelAzRad = -30°`) wird der Einfallswinkel am Vormittag dadurch zu groß statt zu klein berechnet – der Ertrag verschiebt sich in den Nachmittag.

### Fix

Zeile 110 in `supabase/functions/pv-forecast/index.ts` ändern:

```typescript
// Vorher (falsch):
if (hourAngle > 0) solarAz = -solarAz;

// Nachher (korrekt):
if (hourAngle < 0) solarAz = -solarAz; // morning = east = negative
```

Das ist eine Ein-Zeichen-Änderung (`>` → `<`), die die gesamte Azimut-Abhängigkeit der Prognose korrigiert.

