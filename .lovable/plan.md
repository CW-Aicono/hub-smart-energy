## Ziel

Drei verbleibende Regressionen im resize-fähigen Dashboard-Layout beheben:

1. **Höhen-Griff beim obersten Widget (Karte) fehlt / nicht bedienbar.**
2. **Widget-Höhe schlägt beim Karten-Widget nicht durch** – Slider ändert nichts sichtbar.
3. **Karten-Widget zeigt fremde Bedien-Elemente** – Leaflet `+`/`−` und "Vergrößern"-Tooltip überlagern die Kachel.
4. **Widgets können sich überlappen.**

(Widget-Breite funktioniert nach Reload – bleibt unangetastet. Ursache war vermutlich fehlender Refresh der `widget_size`-Klassen nach Layout-Update; kein Codefix nötig.)

## Ursachenanalyse

- `LocationMapWidget` setzt den Kartencontainer hart auf `h-[350px]`. Der `!h-full`-Cascader von `ResizableWidget` greift nur auf `[&>*:first-child]` (die Card) und Recharts-Container – die innere `div` mit fixer Pixelhöhe bleibt bei 350 px, egal wie hoch der Wrapper gezogen wird.
- Der Drag-Griff sitzt an `absolute -bottom-1` mit `opacity-0 group-hover:opacity-100`. Beim Karten-Widget:
  - Card hat `overflow-hidden` und Leaflet-Container liegt bündig am unteren Rand → Hover geht auf Leaflet, nicht auf den Wrapper-Bereich um den Griff.
  - Griff ist zu 100 % transparent, bis exakt der 3 px hohe Streifen getroffen wird – auf der Karte praktisch unmöglich zu finden.
- Karten-Widget nutzt `LocationsMap` mit Leaflet-Standard-Zoomcontrols (`+`/`−`) inkl. "Vergrößern"-Tooltip. Die gehören nicht ins Dashboard-Kachelbild.
- Überlappungen entstehen durch den negativ herausragenden Handle (`-bottom-1`) in Kombination mit `flex-wrap gap-4`: der Handle schiebt sich 4 px in den `gap` der Folgezeile und wirkt wie eine Überlappung mit dem darunterliegenden Widget.

## Umsetzung

### 1. Höhe für Karten-Widget durchreichen (`LocationMapWidget.tsx`)

- Card zu `flex flex-col` machen, `CardContent` bekommt `flex-1 min-h-0 p-0`.
- Innerer Container von `h-[350px]` → `h-full min-h-[350px]` (fallback bleibt 350 px, wenn keine Höhe gesetzt).
- Loading-Skeleton analog.

### 2. Cascader in `ResizableWidget.tsx` erweitern

- Zusätzlich `[&_.leaflet-container]:!h-full` und `[&_.leaflet-container]:!w-full` in die aktivierten Klassen aufnehmen, damit Leaflet der neuen Wrapper-Höhe folgt.

### 3. Drag-Griff sichtbar und nicht überlappend (`ResizableWidget.tsx`)

- Position: `-bottom-1` → `bottom-1` (innerhalb des Wrappers, kein Überhang in die nächste Row).
- Sichtbarkeit: `opacity-0 group-hover:opacity-100` → `opacity-40 group-hover:opacity-100 hover:opacity-100`. So ist der Griff immer leicht angedeutet und über jedem Widget – auch der Karte – findbar.
- z-Index: `z-20` → `z-30`, damit er sicher über den Leaflet-Controls liegt.

### 4. Fremde Karten-Controls entfernen (`LocationsMap.tsx`)

- Prop `showZoomControls?: boolean` (default `true`, um bestehende Nutzungen unverändert zu lassen).
- Beim `MapContainer`: `zoomControl={showZoomControls}`.
- In `LocationMapWidget` beim Rendern der `LocationsMap` explizit `showZoomControls={false}` setzen. Zoom bleibt via Scroll-/Pinch-Gesten möglich; Tooltip "Vergrößern" verschwindet.

### 5. Überlappungen absichern (`DashboardContent.tsx`)

- Container-Klassen: `flex flex-wrap gap-4` → `flex flex-wrap gap-4 items-start`. Verhindert Stretch-Effekte, wenn ein Widget in derselben Zeile eine explizite Höhe hat und der Nachbar kürzer bleibt.

## Technische Notizen

- Betroffene Dateien:
  - `src/components/dashboard/ResizableWidget.tsx`
  - `src/components/dashboard/LocationMapWidget.tsx`
  - `src/components/locations/LocationsMap.tsx`
  - `src/pages/DashboardContent.tsx`
- Keine DB-Migration, keine Änderung an `useDashboardWidgets`.
- Verifikation nach dem Build:
  1. Karten-Widget: Griff sichtbar (schwach), Ziehen vergrößert Karte, keine `+`/`−` Buttons und kein "Vergrößern"-Tooltip mehr.
  2. Höhe eines Widgets stark vergrößern → Nachbar-Widgets bleiben in ihrer Row, keine visuelle Überlappung.
  3. Bestehende Nutzungen von `LocationsMap` außerhalb des Dashboards behalten die Zoom-Controls.
