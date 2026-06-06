## Ziel
Auf `/charging/points/:id` (Tab „Übersicht") soll das Karten-Widget „Standort auf Karte"
- die gleiche Breite wie das Statistiken-Widget bekommen (2/3-Spalte, nicht volle Breite)
- den Hinweistext zum Drag&Drop entfernen, weil die Position hier nicht geändert werden kann
- den Marker nicht-editierbar darstellen (kein Drag, kein „Bearbeiten"-Button)

Die Karte im Bearbeiten-Tab (Edit-Dialog, Zeile ~1163) bleibt unverändert – dort ist Drag&Drop weiterhin sinnvoll.

## Änderungen

### 1. `src/pages/ChargePointDetail.tsx`
- Die Map-Card (aktuell Zeilen 987–1015) aus dem `<TabsContent>`-Root herausnehmen und in die linke Spalte (`<div className="lg:col-span-2 space-y-6">`, ab Zeile 684) einsortieren, direkt unter dem Statistiken-Block. Dadurch erbt sie automatisch dieselbe Breite wie „Statistiken".
- `mt-6` entfernen (Spacing kommt vom umgebenden `space-y-6`).
- Hinweistext entfernen:
  - „Marker per Drag & Drop auf die exakte Position ziehen. Die Änderung wird automatisch in der Übersichtskarte und der Lade-App übernommen."
- `SingleChargePointMap` mit neuem Prop `readOnly` aufrufen; `onPositionChange` kann leer/no-op bleiben.

### 2. `src/components/charging/SingleChargePointMap.tsx`
- Neuen optionalen Prop `readOnly?: boolean` ergänzen.
- Wenn `readOnly === true`:
  - Marker erhält `draggable={false}` und keinen `dragend`-Handler.
  - Der Edit-Toggle-Button (oben rechts „Move/Fertig") wird nicht gerendert.
  - Der blaue Hinweis-Banner („Marker an die exakte Position ziehen") wird nicht gerendert.
  - Der „Mein Standort"-Button (`LocateFixed`) wird ebenfalls nicht gerendert – er macht ohne Speichern keinen Sinn.

### Nicht betroffen
- Logik der Mutation `updateChargePoint`
- Layout der rechten Spalte (Info-Card)
- Karte im Bearbeiten-Modus (alwaysEditable bleibt aktiv)

## Akzeptanzkriterien
- Karte auf der Übersicht ist genauso breit wie das Statistiken-Widget (lg:col-span-2 von 3).
- Kein Hinweistext mehr unter der Überschrift „Standort auf Karte".
- Marker lässt sich nicht ziehen, keine Edit-/Locate-Buttons sichtbar.
- Im Edit-Dialog des Ladepunkts bleibt das Verschieben weiterhin möglich.
