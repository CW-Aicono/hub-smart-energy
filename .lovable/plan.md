## Ursachenanalyse

Beim letzten Fix habe ich CSS-Cascader mit den Selektoren `[data-slot=card]` und `[data-slot=card-content]` gesetzt — diese Attribute existieren in `src/components/ui/card.tsx` **gar nicht**. Damit wirkt der `!h-full`-Zwang nur auf `>*:first-child` (LazyWidget-Div bzw. den absolut positionierten ZoomIn-Button) und läuft dann ins Leere:

1. Beim Ziehen wächst nur die Wrapper-Box (und damit der leere Bereich unter dem Handle), die Karte selbst behält ihre Eigenhöhe → **"Hintergrund des +/− ändert sich, aber nicht das Widget"**.
2. Weil der Wrapper hinter der Karte leer wird und das Handle `bottom-1` des Wrappers referenziert, wandert das Handle vom Kartenrand weg → **"Slider an unterschiedlichen Stellen"**.
3. LazyWidget rendert `<div ref={ref}>` ohne `h-full` — selbst korrekte Card-Selektoren würden ohne Weiterleitung nicht durchgreifen.
4. Bei Widgets mit Karten-Inhalt (Map, FloorPlan) kollabiert der Kartenbereich, wenn Wrapper-Höhe steigt aber Card intrinsisch bleibt → **Karteninhalt teilweise unsichtbar**.

## Fix

### 1) `src/components/ui/card.tsx`
`data-slot="card"` auf `Card` und `data-slot="card-content"` auf `CardContent` ergänzen (rein additive Attribute, keine Verhaltensänderung). Damit greifen die Cascader-Selektoren tatsächlich.

### 2) `src/components/dashboard/LazyWidget.tsx`
Beide Return-Zweige des Wrappers auf `className="h-full flex flex-col"` setzen (Placeholder-Zweig behält `minHeight`, aber zusätzlich `h-full flex flex-col`, damit ein gesetzter Wrapper-Rahmen weitergereicht wird). `Suspense`-Fallback und `WidgetPlaceholder` bekommen ebenfalls `h-full` auf der Card, damit auch während des Ladens die Höhe konsistent ist.

### 3) `src/components/dashboard/ResizableWidget.tsx`
- Wrapper **immer** (nicht nur bei gesetztem `localHeight`) als `flex flex-col` und mit stabilem Kaskader ausstatten, damit Handle-Position und Kartenfüllung **immer** identisch sind:
  ```
  "w-full min-w-0 relative group flex flex-col
   [&>[data-lazy]]:flex-1 [&>[data-lazy]]:min-h-0
   [&_[data-slot=card]]:!h-full [&_[data-slot=card]]:!flex [&_[data-slot=card]]:!flex-col
   [&_[data-slot=card-content]]:!flex-1 [&_[data-slot=card-content]]:!min-h-0
   [&_.recharts-responsive-container]:!h-full
   [&_.leaflet-container]:!h-full [&_.leaflet-container]:!w-full"
  ```
- Auf dem LazyWidget-Sentinel wird ein `data-lazy` gesetzt (Punkt 2), damit direkte-Child-Selektoren zuverlässig greifen — der absolut positionierte ZoomIn-Button wird nicht getroffen.
- Ohne `localHeight`: kein `style.height`, aber Kaskader-Regeln bleiben aktiv → Card = Wrapper-Höhe (auto) = Card-Eigenhöhe. Handle sitzt exakt am unteren Kartenrand.
- Mit `localHeight`: Wrapper bekommt Pixelhöhe, Card wird per `!h-full` mitgestreckt, CardContent per `flex-1 min-h-0`. Recharts und Leaflet folgen via bereits vorhandener Selektoren.
- Handle-Stil unverändert (bottom-1, z-30, opacity-40 → 100 bei hover), aber jetzt visuell **immer** direkt am Kartenrand.

### 4) `src/components/dashboard/LocationMapWidget.tsx`
Das innere Wrapper-`<div className="h-full min-h-[350px] overflow-hidden">` behalten, aber `min-h-[350px]` nur wirken lassen, wenn der Widget keine explizite Höhe hat — sonst überschreibt es Reduktionen unter 350 px. Umsetzung: `min-h-[350px]` durch `min-h-0` ersetzen und den 350 px als `defaultHeight`/`minHeight`-Prop von ResizableWidget führen (bereits vorhanden über `minHeight={200}` — ausreichend). Damit skaliert die Karte sauber nach oben und unten.

### 5) Verifikation
- `bun run build` (Typecheck läuft automatisch).
- Playwright-Skript unter `/tmp/browser/resize/`: Dashboard laden, Handle des Map- und des Weather-Widgets je einmal nach oben und unten ziehen, Screenshot vor/nach — prüfen, dass Karten/Chart-Inhalt tatsächlich mitwächst und Handle direkt am Kartenrand sitzt.

## Technische Notizen
- Änderung an `card.tsx` ist ein zusätzlicher HTML-Attributname — keine Auswirkungen auf existierende Styles/Tests.
- Kaskader-Klassen sind Tailwind-Arbitrary-Variants; funktionieren mit vorhandener Tailwind-Version.
- Keine Backend-/DB-Änderungen. Bereits gespeicherte `layout.height`-Werte bleiben gültig.
