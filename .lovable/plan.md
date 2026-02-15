
## Karten-Kacheln: Touch-Gesten deaktivieren

**Problem:** Auf Mobilgeraeten fangen die Leaflet-Karten Touch-Gesten ab (Ziehen, Pinch-Zoom), sodass die Seite nicht mehr gescrollt werden kann.

**Loesung:** Touch-Interaktionen auf den Karten standardmaessig deaktivieren. Nutzer koennen die Karte weiterhin ueber die Zoom-Buttons (+/−) bedienen, aber Wisch- und Pinch-Gesten scrollen die Seite statt die Karte zu zoomen/verschieben.

---

### Betroffene Komponenten

1. **`src/components/locations/LocationsMapContent.tsx`** (Dashboard-Karte, Standort-Karte)
   - `scrollWheelZoom`, `dragging` und `touchZoom` auf `false` setzen
   - Zoom-Steuerung ueber die eingebauten Leaflet-Buttons bleibt aktiv

2. **`src/components/charging/ChargePointsMap.tsx`** (Ladepunkte-Karte)
   - Gleiche Aenderungen: Touch-/Scroll-Interaktionen deaktivieren

3. **`src/components/dashboard/LocationMapWidget.tsx`** (Dashboard-Widget)
   - Keine direkte Aenderung noetig, nutzt `LocationsMapContent`

### Technische Details

In beiden `MapContainer`-Komponenten werden folgende Props gesetzt:

```
scrollWheelZoom={false}
dragging={false}
touchZoom={false}
```

Damit werden Maus-Scroll-Zoom, Touch-Drag und Pinch-Zoom deaktiviert. Die +/− Zoom-Buttons von Leaflet bleiben weiterhin funktional, sodass Nutzer bei Bedarf zoomen koennen.

Optional kann ein "Interaktiv"-Button hinzugefuegt werden, der die Karte bei Bedarf freischaltet -- das waere aber ein separater Schritt.
