# Fix: Azimut-Berechnung in der PV-Prognose

## Ursache

Die Sonnenstands-Formel im Code berechnet den Sonnenazimut im Koordinatensystem **0 Grad = Nord, 180 Grad = Sued**. Die Panel-Azimut-Umrechnung subtrahiert aber 180 Grad (`azimuthDeg - 180`), was faelschlicherweise ein Koordinatensystem mit **0 Grad = Sued** annimmt.

Das fuehrt dazu, dass `cos(solarAz - panelAzRad)` bei einer suedgerichteten Anlage (180 Grad) den Wert **-1 statt +1** liefert -- die Prognose wird also **minimiert statt maximiert**.

## Loesung

**Datei:** `supabase/functions/pv-forecast/index.ts`

Eine einzige Zeile aendern:

```text
// Vorher (falsch):
const panelAzRad = deg2rad(azimuthDeg - 180);

// Nachher (korrekt):
const panelAzRad = deg2rad(azimuthDeg);
```

Damit arbeiten Sonnenazimut und Panelazimut im selben Koordinatensystem (0 Grad = Nord), und der `cos(solarAz - panelAzRad)`-Term liefert:

- **+1** bei perfekter Ausrichtung (Panel zeigt genau zur Sonne)
- **0** bei 90 Grad Abweichung
- **-1** bei entgegengesetzter Ausrichtung (Panel zeigt von der Sonne weg)

Nach dem Fix wird die Edge Function neu deployed.  
Bitte auch validieren, dass der Wert in der Zelle zwingend zwischen 0° und 360° liegen muss.  
Ich konnte eben 3600° eingaben, was verhindert werden muss.