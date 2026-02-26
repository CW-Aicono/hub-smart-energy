
Problemverständnis (nach Code- und Screenshot-Analyse):
- Das Verhalten passt zu zwei kombinierten Ursachen:
  1) Endlos-Laden im 3D-Viewer: Der Initial-Render der Model-Komponenten (`GLBModel/OBJModel/TDSModel`) rendert `<Text>` aus drei, während die Modelle erst in `useEffect` geladen werden. Wenn `<Text>` selbst suspendiert/blocked, kommt es nicht zum Commit, der `useEffect` startet nie, das Modell lädt nie.
  2) Weißer Bereich ohne Inhalt: In `FloorPlan3DViewer` wird zusätzlich ein `<Suspense fallback={<Text .../>}>` verwendet. Fallback und Initialzustand nutzen beide `<Text>`, wodurch der Canvas in einer leeren/suspendierten Darstellung hängen kann.

Geplanter Fix (priorisiert):
1. Rendering-Deadlock im 3D-Loader entfernen (`src/components/locations/FloorPlan3DViewer.tsx`)
- `Text`-basierte Loader/Error-Platzhalter in den Model-Komponenten entfernen.
- Model-Komponenten so umbauen, dass sie bei “loading” `null` (oder nicht-suspendierende `Html`) rendern, damit `useEffect` sicher committet und Loader wirklich startet.
- `Suspense`-Fallback im Canvas auf nicht-suspendierende Variante umstellen (oder Suspense komplett entfernen, wenn nicht mehr benötigt).

2. Klare, robuste Lade-/Fehlerzustände auf DOM-Ebene
- Separaten `modelLoadState` im Parent einführen (`idle/loading/success/error`).
- Overlay außerhalb des Canvas für “3D-Modell wird geladen…”, Fehlertext und “Erneut versuchen”.
- Timeout-Schutz (z. B. 20s) für festhängende Model-Ladevorgänge mit sauberer Fehlermeldung statt weißem Screen.

3. Spinner-Endlosschleife zusätzlich absichern (Datenhooks)
- `useMeters` in `try/catch/finally` kapseln, damit `setLoading(false)` garantiert ausgeführt wird (auch bei geworfenen Fetch-Fehlern).
- Gleiches Hardening für `useMeterReadings` (Konsistenz, weniger Race-/Netzwerk-Hänger).

4. Zustandskonsistenz beim Floor-Wechsel
- `FloorPlan3DViewer` bei Floor-Wechsel eindeutig resetten (z. B. `key={floor.id}` an den Aufrufstellen in Dashboard/Dialog).
- `modelRotation` auf neue Floor-Daten synchronisieren (kein “stale rotation”-State beim Wechsel).

5. Sichtbare Fallbacks statt “leerer Canvas”
- Wenn kein Modell gezeichnet werden kann: explizite Nutzerhinweise im Overlay (Dateiformat/URL/Netzwerk), damit Fehler diagnostizierbar bleiben.

Technische Dateien:
- `src/components/locations/FloorPlan3DViewer.tsx` (Hauptfix)
- `src/hooks/useMeters.tsx` (Loading-Finally)
- `src/hooks/useMeterReadings.tsx` (Hardening)
- `src/components/dashboard/FloorPlanDashboardWidget.tsx` (optional `key` für Viewer-Reset)
- `src/components/locations/FloorPlanDialog.tsx` (optional `key` für Viewer-Reset)

Abnahmekriterien:
- Kein endloser Spinner mehr im 3D-Tab/3D-Widget.
- Kein weißer leerer Bereich ohne Meldung.
- Entweder: Modell sichtbar, oder klare Fehlermeldung mit Retry.
- Floor-Wechsel funktioniert stabil ohne hängenbleibende alte Zustände.
- 2D-Ansicht und Live-Werte bleiben unverändert funktionsfähig.

Validierung nach Umsetzung:
- 3D im Dashboard-Widget und im Standort-Dialog testen (mehrere Floors).
- Wechsel 2D ↔ 3D mehrfach.
- “Begehung” starten/beenden.
- Netzwerkstörung simulieren (kurz offline) und prüfen, ob sauberer Fehler statt Endlosschleife erscheint.
