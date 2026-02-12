

## Reload-Button im Grundriss-Widget umfunktionieren

### Hintergrund

Der Reload-Button (kreisformige Pfeile) im `FloorPlanDashboardWidget` wurde ursprunglich zum **Aktualisieren der Live-Sensordaten** eingebaut. Er ladt die aktuellen Sensorwerte neu und zeigt daneben die letzte Aktualisierungszeit an.

### Geplante Anderung

Da die Sensordaten ohnehin regelmasig aktualisiert werden, wird der Button so erweitert, dass er **sowohl die Sensordaten aktualisiert als auch die Zoom-/Pan-Ansicht auf den Ausgangszustand zurucksetzt**. So hat der Button eine klar sichtbare Wirkung.

### Umsetzung

**Datei: `src/components/dashboard/FloorPlanDashboardWidget.tsx`**

1. Den `resetTransform`-Aufruf aus dem `TransformWrapper`-Kontext uber eine Ref (`useRef`) nach aussen verfugbar machen, damit er vom Header-Button aus erreichbar ist (aktuell ist `resetTransform` nur innerhalb der `ZoomControls`-Subkomponente verfugbar).
2. Den `onClick`-Handler des Reload-Buttons anpassen: zusatzlich zu `refreshSensorValues()` wird `resetTransform()` aufgerufen.
3. Optional: Tooltip hinzufugen ("Ansicht zurucksetzen und Daten aktualisieren").

### Technisches Detail

Das `react-zoom-pan-pinch`-Paket bietet eine `useControls()`-Hook, die aber nur innerhalb von `TransformWrapper` funktioniert. Um `resetTransform` von ausserhalb (Header-Bereich) aufzurufen, wird die `ref`-Prop von `TransformWrapper` genutzt:

```tsx
const transformRef = useRef(null);

<TransformWrapper ref={transformRef} ...>

// Im onClick des Reload-Buttons:
onClick={() => {
  refreshSensorValues();
  transformRef.current?.resetTransform();
}}
```

Dies betrifft nur die 2D-Ansicht, da der Button bereits auf `viewMode === "2d"` konditioniert ist.
