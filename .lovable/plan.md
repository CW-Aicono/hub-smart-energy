

## Status: Azimut-Fix revertiert, Sonnenzeit-Korrektur aktiv

### Erkenntnis

Die ursprüngliche Analyse im Plan war **falsch**. Der Sonnenazimut (`solarAz`) wird durch `acos(cosAz)` in **Kompass-Konvention** (0°=Nord, 180°=Süd) berechnet – nicht in "0=Süd"-Konvention, wie der alte Kommentar fälschlich behauptete.

- `panelAzRad = deg2rad(azimuthDeg)` war **korrekt** (beide in Kompass-Konvention)
- `panelAzRad = deg2rad(azimuthDeg - 180)` hat die Konventionen **desynchronisiert** und die Beam-Komponente fast eliminiert
- Die KI-Kalibrierung hat das mit einem 2.85x-Faktor kompensiert → Tagessumme stimmte, aber Verteilung war falsch

### Aktive Änderung: Sonnenzeit-Korrektur

Die **True Solar Time**-Korrektur in `pv-forecast/index.ts` ist weiterhin aktiv und korrekt:

1. **Equation of Time** (Spencer-Formel): saisonale Abweichung
2. **Längengradkorrektur**: 4 Min/Grad relativ zu CET-Referenzmeridian (15°E)
3. **Robustes Timestamp-Parsing**: Stunde direkt aus CET-String statt `new Date().getHours()`

Für AICONO Zentrale (Längengrad 7.42°E):
- Längengradkorrektur: 4 × (7.42 - 15) = −30.3 Minuten
- Zeitgleichung Anfang März: ca. −12 Minuten
- Gesamt: solarer Mittag liegt ~42 Min nach 12:00 CET → Prognosekurve verschiebt sich entsprechend

### Betroffene Datei

- `supabase/functions/pv-forecast/index.ts`
