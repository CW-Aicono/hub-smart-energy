## Ursache

In `src/components/locations/Room3D.tsx` werden Räume mit inkonsistenten Einheiten gezeichnet:

1. **Polygon-Punkte werden in Prozent interpretiert, nicht in Metern.**
   Wenn ein Raum per Polygon-Editor gezeichnet wurde (was bei "Raum 1" der Fall ist – erkennbar an der grünen Wandfarbe #10b981), liegen die `polygon_points` in Prozent-Koordinaten des Grundriss-Bildes (0–100). Room3D multipliziert sie einfach mit `WORLD_SCALE = 0.3` und ignoriert die eingegebenen Werte für Breite (4 m) und Tiefe (4 m) komplett. Ergebnis: die Grundfläche hat keinerlei Bezug zu den gespeicherten Metern – ein klein gezeichnetes Polygon wird zu einem kleinen 3D-Raum, während die Wandhöhe in echten Metern steht → wirkt zu hoch/schmal.

2. **`wall_height` aus der DB wird ignoriert.**
   Room3D setzt `const wall_height = DEFAULT_WALL_HEIGHT` (2,8) hart und liest `room.wall_height` nie aus. Änderungen im Editor bleiben ohne Wirkung.

3. **Rechteck-Fallback stimmt zufällig fast.**
   Der Fallback ohne Polygon nutzt `width`/`depth` direkt als Welteinheiten (≈ Meter) – nur dieser Pfad liefert korrekte 4×4×2,8-Proportionen. Sobald ein Polygon existiert, wird er nicht mehr verwendet.

## Lösung (nur `Room3D.tsx`)

1. **Polygon in Meter umrechnen statt in Prozent-Welt-Einheiten.**
   Bounding-Box des Polygons berechnen, dann die Punkte so skalieren/verschieben, dass die Bounding-Box exakt `room.width` × `room.depth` (Meter) groß ist und um `(position_x, position_y)` zentriert ist. Damit entspricht die 3D-Grundfläche 1:1 den im Editor angezeigten Metern, unabhängig davon wie groß das Polygon auf dem Grundriss gezeichnet wurde.

2. **Echte Wandhöhe verwenden:** `const wall_height = room.wall_height || DEFAULT_WALL_HEIGHT;`

3. **Rechteck-Fallback unverändert lassen** (arbeitet bereits in Metern).

4. **`WORLD_OFFSET`/`WORLD_SCALE` bleiben nur noch als Kamera-/Szene-Kontext relevant** – nach der Umrechnung liegen alle Räume in echten Meterkoordinaten um ihren `position_x/position_y`-Mittelpunkt. Kein weiterer Aufrufer wird berührt.

## Verifikation

Per Playwright den 3D-Begehung-Tab von "Ost EG" öffnen, Screenshot machen und prüfen, dass "Raum 1" (4×4×2,8 m) sichtbar breiter/tiefer als hoch ist und die Proportionen etwa Faktor 4:4:2,8 entsprechen.
