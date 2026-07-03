## Plan

1. **Resize-Verhalten wieder eindeutig machen**
   - `ResizableWidget` bekommt wieder eine echte kontrollierte Höhe (`height`), damit das Ziehen sichtbar die Kachel-/Card-Höhe verändert.
   - Der Drag-Handle bleibt in einer eigenen Zeile unter dem Widget.

2. **Überlaufen beim Verkleinern verhindern**
   - Nicht mehr pauschal `height → minHeight` verwenden, weil dadurch nur der Griff wandert und die Card nicht mitwächst.
   - Stattdessen wird die Höhe auf sichere Mindestwerte geklemmt: `effectiveMinHeight = max(widgetMinHeight, gemessene Inhalts-Mindesthöhe + Handle-Zeile)`.
   - Dadurch kann ein Widget nicht kleiner werden als sein sichtbarer Inhalt.

3. **Card-Inhalt korrekt strecken**
   - Bei kontrollierter Höhe wird der eigentliche Widget-Bereich (`data-lazy`, Card, CardContent, Charts, Map) wieder sauber auf die verfügbare Höhe gestreckt.
   - Recharts/Leaflet bleiben explizit `height: 100%`, damit Graphen und Map mit der Kachel wachsen.

4. **Widget-spezifische Mindesthöhen nachziehen**
   - Bestehende Mindestwerte für Map, Gauges, Sankey etc. bleiben erhalten.
   - Falls nötig, ergänze ich Mindesthöhen für weitere bekannte Problem-Widgets, damit Tabellen/Legenden/Header nicht über den Rand laufen.

5. **Verifikation**
   - Per Preview/Browser prüfen: ein Widget nach unten ziehen → Card und Inhalt wachsen sichtbar.
   - Danach nach oben ziehen → es stoppt rechtzeitig, ohne dass Inhalt über den Widget-Rand läuft.
   - Map und Graphen müssen weiterhin sichtbar bleiben.