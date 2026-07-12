## Ziel

Node-Beschriftung (Name + Periodensumme) soll den Live-Flow auf einer angrenzenden Verbindung nicht mehr überlagern.

## Regel

- **Standard:** Beschriftung unterhalb des Kreises (wie heute).
- **Ausnahme:** Wenn von diesem Knoten mindestens eine Verbindung nach **unten** verläuft (Winkel der Line-Richtung fällt in den unteren Sektor, ca. 45°–135°), wird die Beschriftung **oberhalb** des Kreises platziert.
- Reihenfolge bleibt gleich:
  - oben: erst `node.label`, darunter Periodensumme
  - unten: erst `node.label`, darunter Periodensumme
  (bei Position „oben" umgekehrte y-Offsets, sodass Label näher am Kreis steht als die Summe)

## Umsetzung in `src/components/dashboard/EnergyFlowMonitor.tsx`

1. **Helper `getLabelSide(node)**` in der Node-Render-Schleife:
  - Iteriere über `connections`, filtere die, an denen `node` als `from` oder `to` beteiligt ist.
  - Für jede Verbindung: berechne den Richtungsvektor **von diesem Knoten weg** zum Nachbarknoten, dann Winkel `atan2(dy, dx)` in Grad (0° = rechts, 90° = unten in SVG-Koordinaten).
  - Wenn ein Winkel im Bereich `[45°, 135°]` liegt → Nachbar-Verbindung geht nach unten → return `"top"`.
  - Sonst `"bottom"`.
2. **Text-Rendering im `nodes.map(...)**`:
  - `const side = getLabelSide(node);`
  - `const labelY = side === "bottom" ? cy + nodeRadius + 14 : cy - nodeRadius - 18;`
  - `const sumY   = side === "bottom" ? cy + nodeRadius + 28 : cy - nodeRadius - 6;`  
  (bei „top" ist die Summe zwischen Label und Kreis, damit die Reihenfolge Label→Summe→Kreis von oben nach unten gelesen wird — alternativ Label ganz oben und Summe direkt darunter, siehe Frage unten)
3. Keine Änderung am Flow-Label auf der Linie selbst (das ist mittig auf der Line, kein Konflikt zu erwarten).

## Randfälle

- Knoten ohne Verbindung: `side = "bottom"` (Default).
- Mehrere Verbindungen mit gemischten Richtungen: Sobald **eine** nach unten geht, flippt die Beschriftung nach oben.
- Bei horizontalem Layout (heutiger Regelfall PV — Gebäude — Speicher) bleibt alles unten; bei Netz-über-Gebäude (Screenshot) flippt „Gebäude gesamt"-Beschriftung nach oben — der aktuelle Screenshot betrifft aber vor allem **„Netz"**: dessen Verbindung geht nach unten → Beschriftung wandert **über** den Netz-Kreis.

## Offene Frage

Bei Position „oben" — welche Reihenfolge (von oben nach unten gelesen)?

- **A:** `Label` → `Summe` → Kreis  (Label ganz oben, wie heute unten die Reihenfolge Label→Summe)
- **B:** `Summe` → `Label` → Kreis  (Label direkt am Kreis, Summe darüber — spiegelverkehrt zur Unten-Variante)

Ich würde **A** wählen (visuelle Konsistenz: Label immer weiter weg vom Kreis als Rand-Info wirkt seltsam) — bestätige bitte oder wähle B.  
  
Antwort: Ja, Lösung A wie von dir vorgeschlagen.