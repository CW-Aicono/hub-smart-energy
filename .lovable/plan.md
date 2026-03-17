

## Analyse: Warum liegt die PV-Prognose 30-50% unter der reellen Erzeugung?

### Ursache: Fehler in der DNI-Berechnung (Hauptursache)

Die Berechnung der Direktstrahlung auf die geneigte Modulfläche enthält einen physikalischen Fehler. In Zeile 170 wird `directWm2 = GHI - DHI` berechnet, was die **direkte Horizontalstrahlung** ergibt (= DNI × sin(Sonnenhöhe)). Dieses Ergebnis wird dann in Zeile 206 nochmals mit `cosAOI` multipliziert:

```
beam = directWm2 × cos(Einfallswinkel)
     = DNI × sin(Sonnenhöhe) × cos(Einfallswinkel)   ← FALSCH
```

Korrekt wäre:
```
beam = DNI × cos(Einfallswinkel)
```

Der überflüssige Faktor `sin(Sonnenhöhe)` beträgt im März bei 52°N mittags ca. 0.57-0.62, was die systematische Unterschätzung von 30-50% exakt erklärt.

### Zusätzlich: Sommerzeit-Problem

Die Zeitgleichung nutzt `longCorrection = 4 × (longitude - 15)`, wobei 15°E der Referenzmeridian für CET ist. Ab 29. März 2026 gilt CEST (Referenz 30°E). Ohne Anpassung wird die Sonnenstundenberechnung im Sommer um ca. 1h verschoben.

### Umsetzungsplan

#### 1. DNI direkt von Open-Meteo anfordern
Statt `direct_radiation` (horizontal) den Parameter `direct_normal_irradiance` von der API anfordern. Damit entfällt die fehleranfällige Umrechnung.

**Änderung in `supabase/functions/pv-forecast/index.ts`:**
- Open-Meteo URL: `direct_radiation` durch `direct_normal_irradiance` ersetzen
- Variable `dhi` bleibt (für Diffus-Anteil)
- Neue Variable `dni` statt der bisherigen `directWm2`-Berechnung
- Beam-Berechnung: `beam = dni[i] × max(0, cosAOI)` direkt verwenden

#### 2. Sommerzeit-Erkennung einbauen
Automatisch erkennen ob CET oder CEST gilt und den Referenzmeridian entsprechend auf 15°E oder 30°E setzen.

#### 3. Fallback für fehlende DNI-Daten
Falls Open-Meteo kein `direct_normal_irradiance` liefert, die korrekte Umrechnung als Fallback implementieren:
```
DNI = direct_horizontal / max(sin(solarAltitude), 0.05)
```

### Erwartete Verbesserung

Die systematische Unterschätzung von 30-50% sollte damit eliminiert werden. Die Prognose wird physikalisch korrekt auf die Einstrahlung der geneigten Fläche umgerechnet. Zusammen mit dem bereits implementierten Auto-PR und der Temperaturkorrektur sollte die Genauigkeit auf ±10-15% steigen.

### Betroffene Datei
- `supabase/functions/pv-forecast/index.ts` (Edge Function)

