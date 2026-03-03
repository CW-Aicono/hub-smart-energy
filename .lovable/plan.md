

## Analyse: PV-Prognose viel zu niedrig

### Datenquellen

Die Prognose verwendet:
1. **Open-Meteo API** – liefert stündliche Strahlungswerte (GHI, Diffusstrahlung, Bewölkung) für 48h
2. **Physikalisches Transpositionsmodell** – berechnet die Einstrahlung auf die geneigte Fläche (POA)
3. **Formel:** `E(kWh) = (POA_W/m² × kWp × PR) / 1000` mit PR = 0.80

Die Formel selbst ist korrekt. Bei 160 kWp und 800 W/m² POA sollte die Spitzenleistung ~102 kWh/h betragen.

### Der Bug: Azimut-Konvertierung fehlt

In `supabase/functions/pv-forecast/index.ts`, Zeile 100–101:

```typescript
// Panel azimuth: user input is compass bearing (180=South), convert to math convention (0=South)
const panelAzRad = deg2rad(azimuthDeg);  // ← BUG: Konvertierung wird NICHT gemacht!
```

Der Kommentar sagt "convert to math convention (0=South)" – aber die Konvertierung wird **nicht durchgeführt**. Der Sonnenazimut (`solarAz`) wird in der Konvention "0 = Süd" berechnet, der Panel-Azimut bleibt aber bei "180 = Süd" (Kompass).

**Auswirkung bei Südausrichtung (180°):**

```text
cos(solarAz - panelAzRad) = cos(0 - π) = -1

Heute (3. März, Sonnenhöhe ~33° mittags, Neigung 30°):
  cosAOI = sin(33°)·cos(30°) + cos(33°)·sin(30°)·cos(0 − π)
         = 0.472 + 0.420 · (−1) = 0.052  ← fast keine Direktstrahlung!

MIT FIX (panelAz = 0 für Süd):
  cosAOI = 0.472 + 0.420 · cos(0) = 0.892  ← korrekte Direktstrahlung
```

Die Direktstrahlung (der größte Anteil) wird durch den Bug fast vollständig eliminiert. Nur die Diffusstrahlung bleibt übrig – daher die viel zu niedrige Prognose.

### Fix

**`supabase/functions/pv-forecast/index.ts`** – Zeile 101 ändern:

```typescript
// Vorher (BUG):
const panelAzRad = deg2rad(azimuthDeg);

// Nachher (FIX):
const panelAzRad = deg2rad(azimuthDeg - 180);
```

Damit wird der Kompass-Wert (180° = Süd) korrekt in die mathematische Konvention (0° = Süd) umgerechnet, die auch für den Sonnenazimut verwendet wird.

### Betroffene Datei

- `supabase/functions/pv-forecast/index.ts` – eine Zeile (101)

