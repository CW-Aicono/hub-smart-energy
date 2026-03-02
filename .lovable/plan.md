
## Problem

Wenn PV-Einstellungen (kWp, Neigung, Ausrichtung) in der Liegenschaftsansicht gespeichert werden, wird nur der Cache fuer die spezifische Liegenschaft invalidiert -- nicht aber der aggregierte Cache fuer "Alle Liegenschaften", der im Dashboard verwendet wird.

**Ursache:** In `usePvForecast.tsx` (Zeile 212) wird beim Speichern nur `["pv-forecast", locationId]` invalidiert. Das Dashboard verwendet aber den Query-Key `["pv-forecast", "all", tenantId]`, wenn keine spezifische Liegenschaft ausgewaehlt ist. Dieser wird nicht getroffen.

## Loesung

Die Cache-Invalidierung in der `upsertSettings`-Mutation erweitern, sodass **alle** PV-Forecast-Queries invalidiert werden -- sowohl die spezifische Liegenschaft als auch die aggregierte Ansicht.

### Aenderung in `src/hooks/usePvForecast.tsx`

Zeile 211-212 anpassen:

```typescript
// Vorher:
queryClient.invalidateQueries({ queryKey: ["pv-forecast-settings", locationId] });
queryClient.invalidateQueries({ queryKey: ["pv-forecast", locationId] });

// Nachher:
queryClient.invalidateQueries({ queryKey: ["pv-forecast-settings", locationId] });
queryClient.invalidateQueries({ queryKey: ["pv-forecast"] }); // Alle PV-Forecast-Queries (inkl. "all")
```

Durch das Weglassen des `locationId` im Query-Key wird React Query per Prefix-Match **alle** Queries invalidieren, die mit `"pv-forecast"` beginnen -- also sowohl die einzelne Liegenschaft als auch die Dashboard-Aggregation.

Dasselbe wird auch fuer die `deleteSettings`-Mutation angepasst, damit auch dort die Dashboard-Ansicht aktualisiert wird.
