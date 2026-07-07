## Problem

Aktuell werden die Räume im 3D-Modus jeweils einzeln normalisiert: Jedes Polygon wird auf seine eigene `width × depth` (Meter) skaliert und um `(position_x, position_y)` zentriert. Damit geht die relative Lage aus dem 2D-Grundriss verloren — zwei nebeneinander gezeichnete Räume landen im 3D übereinander, weil `position_x/position_y` typischerweise `0` sind.

Der 2D-Grundriss (Prozent-Koordinaten des hinterlegten Bildes/PDFs) ist bereits die beste Quelle für die relative Anordnung — er muss nur einmal konsistent von Prozent → Meter umgerechnet werden, statt pro Raum getrennt.

## Lösung

**Ein einziger, gemeinsamer Prozent→Meter-Faktor pro Etage**, angewendet auf alle Polygone. Die 2D-Anordnung wird dadurch 1:1 in 3D übernommen.

### Skalen-Ermittlung (Reihenfolge, erster Treffer gewinnt)

1. **Aus vorhandenen Räumen ableiten:** Für jeden Raum mit Polygon **und** gesetzter `width`/`depth` (> 0) den lokalen Faktor `sx = width / bboxWidth%` und `sz = depth / bboxHeight%` berechnen. Über alle solchen Räume mitteln (getrennt für x/z, damit auch nicht-quadratische Grundrisse stimmen). Das ist die genaueste Quelle, weil der Nutzer die Raummaße explizit gepflegt hat.
2. **Aus `floor.area_sqm` ableiten:** Falls kein Raum brauchbare Maße hat, aber die Etagenfläche gesetzt ist, den Faktor so wählen, dass die Summe der Polygonflächen (nach Umrechnung) ≈ `area_sqm` ergibt (isotrop, `sx = sz`).
3. **Fallback:** `sx = sz = 0.1` m/% (entspricht 10 m × 10 m Grundriss) — nur wenn weder Raum-Maße noch Etagen-Fläche vorhanden sind.

### Anwendung in `Room3D.tsx`

- Polygonpunkte werden mit dem **etagenweiten** Faktor umgerechnet: `worldX = (p.x - imageCenterX%) * sx`, `worldZ = (p.y - imageCenterY%) * sz`. Kein Zentrieren pro Raum mehr, kein Verwenden von `position_x/position_y` als Verschiebung, wenn ein Polygon existiert (die Position steckt bereits im Polygon).
- `room.width`/`room.depth` werden bei Polygon-Räumen nicht mehr zum Reskalieren benutzt — sie bleiben nur informativ (Anzeige im Editor). Damit stimmt endlich die relative Lage, und die Proportionen sind so, wie der Nutzer sie im 2D-Editor gezeichnet hat.
- Rechteck-Fallback (kein Polygon) bleibt unverändert: `position_x/position_y` + `width/depth` in Metern.
- `wall_height` weiterhin aus `room.wall_height`.

### Konsequenzen für `FloorPlan3DViewer.tsx`

- `deriveRoomCenter` und `deriveRoomBounds` müssen denselben etagenweiten Faktor verwenden statt der alten `SCALE = 0.3`-Konstante. Ich zentralisiere die Faktor-Berechnung in einem kleinen Helper (`computeFloorScale(rooms, floor)`), den sowohl `Scene` (für `sceneBounds`, Labels) als auch `Room3D` (via Prop) nutzen.
- Kamera, Grid und Minimap richten sich weiterhin nach `sceneBounds.center*` — durch die konsistente Skala liegen alle Räume jetzt korrekt zueinander, und die Kamera zentriert sich auf den gesamten Grundriss.

### Optional (nicht in diesem Schritt)

Das hinterlegte 2D-Bild als Textur auf den Boden zu legen wäre möglich, ist aber Scope-Erweiterung. Für diese Aufgabe reicht die korrekte relative Anordnung der Räume.

## Betroffene Dateien

- `src/components/locations/Room3D.tsx` — Polygon-Umrechnung auf etagenweiten Faktor, Prop `floorScale` entgegennehmen.
- `src/components/locations/FloorPlan3DViewer.tsx` — Helper `computeFloorScale`, an `Room3D`/`deriveRoomCenter`/`deriveRoomBounds` durchreichen.

## Verifikation

Playwright: 3D-Begehung der Etage „DG – Grundriss" öffnen, Screenshot machen. Erwartung: „Schlafzimmer" (grün) und „Zimmer 1" (blau) stehen **nebeneinander** wie im 2D-Plan, nicht mehr übereinander; ihre Proportionen entsprechen den im 2D gezeichneten Formen.
