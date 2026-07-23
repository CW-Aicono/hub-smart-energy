## Ziel
Beim Platzieren eines Ladepunktes im Bearbeiten-Dialog sollen **alle vorhandenen Ladepunkte des Tenants** in der Karte sichtbar sein. Der User wählt per Klick den zu platzierenden Ladepunkt, sein Name wird eingeblendet, und nur dieser eine ist ziehbar.

## Umfang
- Nur Frontend/Presentation. Keine Änderungen an Datenmodell, RLS oder anderen Seiten.
- Betroffen: `src/components/charging/SingleChargePointMap.tsx` (erweitern) und Verwendung in `src/pages/ChargePointDetail.tsx` (Bearbeiten-Dialog, Zeile ~1187).
- Die zweite Verwendung (Read-only-Anzeige auf der Detailseite) bleibt unverändert.

## Verhalten (Bearbeiten-Dialog)
1. Karte zeigt alle Ladepunkte des Tenants mit `latitude/longitude` als Marker.
2. Der aktuell bearbeitete Ladepunkt ist initial **vorausgewählt** (grüner Marker, ziehbar). Sein Name wird oben mittig in der bestehenden „Marker an die exakte Position ziehen"-Kapsel angezeigt: `"<Name> – Marker an die exakte Position ziehen"`.
3. Andere Ladepunkte werden als **neutrale, nicht ziehbare Marker** (grau/blau) mit Tooltip = Name dargestellt.
4. Klick auf einen anderen Marker macht diesen zum aktiven, ziehbaren Marker; sein Name erscheint in der Kapsel. Der zuvor bearbeitete Ladepunkt wird wieder neutral.
   - Wichtig: Ein Wechsel ändert nur den lokalen Auswahl-State im Karten-Widget. Die tatsächliche Persistenz von Positionsänderungen erfolgt weiterhin nur für den im Dialog geöffneten Ladepunkt über `onPositionChange` → `setCoords` → Speichern.
   - Positionsänderungen eines anderen, per Klick ausgewählten Ladepunktes werden **nicht persistiert** (nur der Dialog-Ladepunkt wird gespeichert). Für konsistente UX wird bei Auswahl eines fremden Markers ein Hinweis angezeigt: „Nur der geöffnete Ladepunkt kann hier gespeichert werden. Öffne den anderen Ladepunkt zum Bearbeiten." — der fremde Marker bleibt dabei **nicht** ziehbar.
   - → Damit bleibt die Logik einfach: **ziehbar ist ausschließlich der im Dialog geöffnete Ladepunkt**. Der Klick auf andere Marker dient nur der Orientierung und zeigt deren Namen an; Ziehen ist deaktiviert.

## Technische Umsetzung

### `SingleChargePointMap.tsx`
- Neue optionale Prop `otherPoints?: Array<{ id: string; name: string; latitude: number; longitude: number }>`.
- Neue optionale Prop `currentName?: string` für die Anzeige in der Kapsel.
- Rendering:
  - Bestehender Haupt-Marker (grün) für `latitude/longitude` bleibt (ziehbar via `alwaysEditable`/`editMode`).
  - Zusätzliche `<Marker>` pro `otherPoints`-Eintrag mit anderem Icon (z. B. grau `#94a3b8`), `draggable={false}`, `eventHandlers={{ click: () => setSelectedOtherId(id) }}`, sowie Leaflet-`Tooltip` mit Name.
  - Wenn ein `otherPoints`-Marker geklickt ist: Kapsel oben zeigt dessen Namen + Zusatz „(nur Anzeige – zum Bearbeiten diesen Ladepunkt öffnen)". Klick auf den grünen Haupt-Marker setzt Auswahl zurück auf den aktuell bearbeiteten (Kapsel: `currentName`).
  - Karten-Bounds: bei Vorhandensein von `otherPoints` mit `fitBounds` initial alle Marker einpassen (nur einmal beim Mount / bei Änderung der Punkt-Liste); danach nicht mehr rezentrieren (der bestehende `Recenter` wird in diesem Modus deaktiviert, um nicht bei jedem Drag zu springen).
- `readOnly`-Pfad bleibt unverändert.

### Datenbeschaffung in `ChargePointDetail.tsx`
- Es existiert bereits `useChargePoints()` (siehe `src/hooks/useChargePoints.tsx`), das alle Ladepunkte des Tenants mit `latitude/longitude` liefert.
- Im Bearbeiten-Dialog: Liste filtern auf `cp.id !== currentId && cp.latitude != null && cp.longitude != null` und als `otherPoints` an `SingleChargePointMap` übergeben. `currentName` = `form.name`.

## Nicht im Umfang
- Bearbeiten fremder Ladepunkte direkt in der Karte (bewusst nicht, um Save-Semantik einfach zu halten).
- Änderungen an der Read-only-Karte auf der Detailseite oder an `ChargePointsMap.tsx` (Übersicht).
- Kein DB-/RLS-/Backend-Change.
