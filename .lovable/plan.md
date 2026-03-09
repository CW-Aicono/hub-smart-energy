

## Analyse: PV-Prognose systematisch zu niedrig

### Ursache 1: Fehlerhafte Azimut-Konvention (Hauptproblem)

Im physikalischen Modell (`pv-forecast/index.ts`, Zeile 113-117) wird der **Panel-Azimut** direkt in Radiant umgerechnet:
```typescript
const panelAzRad = deg2rad(azimuthDeg); // z.B. 180° = Süd (Kompass)
```

Der **Solar-Azimut** (`solarAz`) wird aber nach astronomischer Konvention berechnet: **0° = Süd**, positiv nach Westen. Die Differenz `solarAz - panelAzRad` vergleicht also zwei verschiedene Bezugssysteme. Bei `azimuthDeg = 180` (Süd in Kompass) wird fälschlich `panelAzRad = π` statt `0` verwendet.

**Effekt:** Der `cosAOI`-Wert (Einfallswinkel) wird systematisch zu klein berechnet → die Beam-Komponente wird massiv unterschätzt, besonders vormittags.

**Fix:** Kompass-Azimut in Süd-Referenz umrechnen:
```typescript
const panelAzRad = deg2rad(azimuthDeg - 180); // Kompass → Süd-Referenz
```

### Ursache 2: Konservativer Performance Ratio

`PR = 0.80` ist für moderne Anlagen konservativ. Typische Werte liegen bei **0.85–0.90**. Dies allein erklärt ca. 6–12 % Unterschätzung.

**Fix:** PR auf `0.85` anheben als Default, optional konfigurierbar.

### Ursache 3: Keine Bodenreflexion (Albedo)

Das Modell berücksichtigt nur Beam + Diffuse, aber nicht die **Bodenreflexionskomponente** (Ground-reflected irradiance), die bei geneigten Modulen 3–8 % beitragen kann:

```
ground = GHI × albedo × (1 - cos(tilt)) / 2
```

### Geplante Änderungen

**Datei:** `supabase/functions/pv-forecast/index.ts`

1. Panel-Azimut korrekt von Kompass (0°=N, 180°=S) in Süd-Referenz (0°=S) umrechnen
2. Albedo-Reflexionskomponente zum POA-Modell hinzufügen (Albedo ≈ 0.2)
3. Performance Ratio von 0.80 auf 0.85 anheben
4. Logging des Korrekturfaktors für Nachvollziehbarkeit

Diese drei Korrekturen sollten die Prognose um ca. **30–50 %** nach oben bringen und den systematischen Vormittags-Bias beseitigen.

