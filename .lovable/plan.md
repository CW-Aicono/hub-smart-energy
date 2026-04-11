

# Plan: Live-Daten-Peaks eliminieren durch verzögerte Aggregation

## Ursache

Der EnergyChart (Tagesansicht) holt für "heute" die letzten 10 Minuten als **Rohdaten** direkt aus `meter_power_readings` (Zeilen 219–232 in `EnergyChart.tsx`). Diese Rohdaten enthalten die Loxone-Boundary-Spikes an den `:00`- und `:30`-Marken. Erst nach Aggregation zu 5-Minuten-Buckets werden die Spikes geglättet — aber die letzten 10 Minuten sind eben noch nicht aggregiert.

## Lösung

Statt die letzten 10 Minuten als Rohdaten anzuzeigen, wird der Chart nur noch aggregierte 5-Minuten-Daten anzeigen. Das bedeutet eine maximale Verzögerung von ~5–10 Minuten in der Chartdarstellung, was für die historische Ansicht akzeptabel ist. Live-Steuerungswerte (Gauges, Energiefluss) bleiben davon unberührt.

### Änderung 1: Raw-Data-Supplement entfernen (`EnergyChart.tsx`)

Den Block in Zeilen 219–233 entfernen, der die letzten 10 Minuten Rohdaten aus `meter_power_readings` holt und an die aggregierten Daten anhängt. Der Chart zeigt dann nur noch `get_power_readings_5min`-Daten.

### Änderung 2: Häufigeres Refetching für den heutigen Tag

Damit der Chart trotzdem zeitnah aktualisiert wird, wird ein Refetch-Intervall von 5 Minuten für die Tagesansicht eingebaut (z. B. via `setInterval` im bestehenden `useEffect`), sodass neue 5-Minuten-Buckets zeitnah erscheinen.

### Betroffene Datei
- `src/components/dashboard/EnergyChart.tsx`

### Ergebnis
- Keine Peaks mehr in den Tages-Charts
- Maximale Anzeige-Verzögerung: ~10 Minuten (nur im Chart)
- Live-Gauges und Energiefluss-Monitor bleiben weiterhin in Echtzeit

