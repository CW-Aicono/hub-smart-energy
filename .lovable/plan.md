## Problem
In der Raumliste (`RoomPolygonEditor.tsx`) sind die Aktions-Icons (Bearbeiten/Löschen/Platzieren) nur bei Hover sichtbar (`opacity-0 group-hover:opacity-100`). Bei langen Raumnamen bleibt zwar durch `truncate` genug Platz, aber:
- Auf Touch-Geräten (Tablet/Handy) gibt es keinen Hover → Icons sind **nie erreichbar**.
- Auf Desktop wirkt es, als „passten die Icons nicht mehr rein", weil der lange Name die volle Zeile visuell füllt, bis man hovert.

## Lösung (nur UI, klein)
Datei: `src/components/locations/RoomPolygonEditor.tsx` (Zeilen ~290–353)

1. **Icons dauerhaft sichtbar machen** — `opacity-0 group-hover:opacity-100` entfernen. Auf Desktop optional dezenter (`opacity-70 hover:opacity-100`) statt komplett unsichtbar.
2. **Icon-Container vor Verdrängung schützen** — `flex-shrink-0` am Aktions-`<div>` ergänzen, damit der lange Name die Buttons nicht überschieben kann.
3. **Textblock sicher kürzen** — sicherstellen, dass sowohl `{room.name}` als auch `„Platziert / Nicht platziert"` mit `truncate` + `min-w-0` sauber abgeschnitten werden (Zeile 308 hat aktuell kein `truncate`).
4. Als Tooltip/`title` weiterhin den vollständigen Namen anzeigen, damit lange Namen lesbar bleiben.

Keine Änderungen an DB, Logik, Overlay oder anderen Komponenten.

## Ergebnis
Bearbeiten- und Löschen-Icons sind bei jedem Raum – unabhängig von Namenslänge und Eingabegerät – immer erreichbar; der lange Name wird sauber mit „…" abgeschnitten.