
Ziel: den Freeze beim Wechsel der Liegenschaft im Dashboard als Root-Cause beheben (nicht nur Workaround).

**Ausgangslage aus Analyse**
- Der Freeze tritt bei **jeder** Location auf.
- Das Problem ist sehr wahrscheinlich **kein reines Dropdown-Problem** mehr, sondern ein Blockieren des Main-Threads beim Location-Wechsel:
  - Beim Wechsel werden viele Widgets gleichzeitig neu gerechnet und neu geladen.
  - Dabei laufen mehrere große Datenabfragen (u. a. 5‑Min-/Rohleistungsdaten) parallel.
  - Zusätzlich gibt es React-Warnungen im FloorPlan-Widget (`Function components cannot be given refs`), die in Dev zusätzlich Performance kosten.
- Die bisherige `pointerEvents/overflow`-Bereinigung im LocationFilter adressiert Symptome, nicht die Ursache.

## Umsetzungsplan (Root-Cause-Fix)

### 1) Saubere Reproduktion + Messpunkte im Code
- In `DashboardContent` und `LocationFilter` gezielte Performance-Marker einbauen:
  - Start/Ende „Location selected“
  - Zeit bis „widgets settled“ (erste stabile Renderphase)
- In den datenintensiven Widgets Logging für Request-Dauer und Ergebnisgröße ergänzen:
  - `EnergyChart`, `PvForecastWidget`, `usePeriodSumsWithFallback`
- Ziel: klarer Nachweis, welche 1–2 Pfade den Freeze dominieren.

### 2) Location-Wechsel entkoppeln (UI bleibt bedienbar)
- `setSelectedLocationId` in `DashboardContent` auf `startTransition` umstellen.
- Während Transition:
  - leichte „Lade über Dashboard“-State-Anzeige
  - Widget-Neuberechnung nicht blockierend starten
- Im `LocationFilter` den manuellen Body-Style-Hack entfernen (oder nur als Fallback hinter Feature-Flag), damit kein zusätzlicher Seiteneffekt in den Event-Lifecycle kommt.

### 3) Datenlast beim Wechsel massiv reduzieren (Hauptfix)
- **Energy/PV-Pfade auf aggregierte Backend-Funktionen priorisieren**, keine Rohdaten-Scans wenn nicht nötig.
- `PvForecastWidget`:
  - für Ist-Werte bevorzugt die vorhandenen stündlichen/täglichen Aggregat-Funktionen nutzen
  - Rohleistungs-Reads nur noch als gezielte Ausnahme (heute, kurze Fenster)
- `EnergyChart` + `usePeriodSumsWithFallback`:
  - harte Begrenzung und frühes Abbrechen von Pagination-Loops bei Location-Wechsel
  - stale requests verwerfen (nur letzter Request darf State schreiben)
- Ergebnis: deutlich weniger JSON-Parsing, weniger Renderdruck.

### 4) Render-Kosten senken (zweiter Hauptfix)
- `useEnergyData`-Ableitungen nur einmal zentral berechnen und an Widgets verteilen (statt n-fach pro Widget-Instanz).
- Schwere Berechnungen memoisiert nach stabilen Schlüsseln (`locationId`, `period`, Meter-Hash).
- Für FloorPlan-Widgets:
  - „latest reading pro Meter“ als Map vorbereiten statt wiederholtes `filter+sort` je Meter.

### 5) FloorPlan-Warnungen beheben
- `FloorPlanDashboardWidget` (und analog `FloorPlanWidget`) auf korrektes `react-zoom-pan-pinch`-Pattern umbauen (keine Ref-Warnungen mehr).
- Ziel: Warn-Noise entfernen und unnötige Renderkosten senken.

### 6) Absicherung per Tests + E2E-Check
- Unit/Integration:
  - Request-Cancel/Stale-Response wird korrekt gehandhabt.
  - Location-Wechsel setzt final konsistenten Zustand.
- E2E:
  - 10x schneller Location-Wechsel nacheinander
  - Seite bleibt klickbar + scrollbar
  - keine dauerhaften Overlays/Locks
  - TTI/Interaktionszeit nach Wechsel innerhalb Zielkorridor.

## Betroffene Dateien (geplant)
- `src/components/dashboard/LocationFilter.tsx`
- `src/pages/DashboardContent.tsx`
- `src/hooks/useEnergyData.tsx`
- `src/components/dashboard/EnergyChart.tsx`
- `src/hooks/usePeriodSumsWithFallback.ts`
- `src/components/dashboard/PvForecastWidget.tsx`
- `src/components/dashboard/FloorPlanDashboardWidget.tsx`
- `src/components/dashboard/FloorPlanWidget.tsx`

## Technische Details (kurz)
```text
Location-Wechsel
  -> transition statt sofortigem blockierendem Full-Recompute
  -> alte Requests abbrechen / ignorieren
  -> Aggregatdaten bevorzugen
  -> zentrale, einmalige Datenableitung
  -> Widgets rendern mit deutlich kleinerem Payload
```

Erwartetes Ergebnis:
- Kein Einfrieren mehr beim Klick auf eine Liegenschaft.
- Dashboard bleibt bedienbar (inkl. Scrollen) während Daten nachladen.
- Spürbar kürzere Stabilisationszeit nach Location-Wechsel.
