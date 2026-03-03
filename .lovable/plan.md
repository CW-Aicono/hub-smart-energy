

# Fix: Archivierte Energieberichte als vollstaendiges HTML-Dokument speichern

## Problem

Beim Archivieren wird nur der rohe `innerHTML` des Report-Containers gespeichert -- ohne `<!DOCTYPE html>`, ohne `<meta charset="UTF-8">` und ohne die CSS-Styles. Das fuehrt zu:
- **Zeichenkodierungsfehler** (z.B. "Ã¶" statt "ö", "â€"" statt "–")
- **Kein Styling** -- der Bericht wird als unformatierter Text angezeigt

## Loesung

Die `handleArchive`-Funktion so aendern, dass sie dasselbe vollstaendige HTML-Dokument generiert wie `handlePrint` -- inklusive DOCTYPE, charset, und allen CSS-Styles. Dazu wird die gemeinsame HTML-Erzeugungslogik in eine Hilfsfunktion extrahiert.

## Technische Umsetzung

### Datei: `src/pages/EnergyReport.tsx`

1. **Neue Hilfsfunktion `buildFullReportHtml()`** extrahieren, die den vollstaendigen HTML-String erzeugt (identisch mit der Logik in `handlePrint`):
   - SVG-Charts aus dem DOM klonen und in den HTML-Inhalt injizieren
   - `reportRef.current.innerHTML` in ein vollstaendiges HTML5-Dokument einbetten
   - `<meta charset="UTF-8">` und alle Print-CSS-Styles einbinden

2. **`handleArchive`** aendern: Statt `reportRef.current.innerHTML` wird `buildFullReportHtml()` aufgerufen und das Ergebnis an `saveReport({ htmlContent: ... })` uebergeben.

3. **`handlePrint`** vereinfachen: Ebenfalls `buildFullReportHtml()` nutzen, dann nur noch `window.open` + `print()`.

Damit sind archivierte Berichte identisch mit der Druckversion -- vollstaendig formatiert und korrekt kodiert.

