

# Performance-Optimierung: Schnelleres Laden der Sensordaten

## Problem-Analyse

Das Dashboard laedt langsam, weil:
- Mehrere Widgets unabhaengig die **gleiche** Loxone-API aufrufen (doppelte Netzwerk-Requests)
- Die Edge Function fuer ~66 Sensoren **66 einzelne HTTP-Anfragen** an den Miniserver sendet (in 7 seriellen Batches)
- Kein Caching existiert -- jeder Seitenbesuch loest alle Abfragen erneut aus
- Die Loxone-Cloud-DNS-Aufloesung bei jedem Aufruf wiederholt wird

## Loesungsplan

### 1. Frontend: Zentraler Sensor-Cache mit React Query

Statt dass `useEnergyData`, `useLiveSensorValues` und `FloorPlanDashboardWidget` jeweils eigene API-Aufrufe machen, wird ein **zentraler Hook** eingefuehrt, der die Daten einmalig laedt und per React Query cached.

**Neuer Hook: `src/hooks/useLoxoneSensors.ts`**
- Nutzt `@tanstack/react-query` mit `staleTime: 60000` (1 Min) und `refetchInterval: 300000` (5 Min)
- Wird von einer Integration-ID getriggert
- Alle Widgets greifen auf denselben Query-Cache zu -- **keine doppelten Requests mehr**

**Anpassungen:**
- `useEnergyData.tsx`: Nutzt `useLoxoneSensors` statt eigener `fetchLiveValues`-Logik
- `useLiveSensorValues.ts`: Nutzt `useLoxoneSensors` statt eigener Edge-Function-Aufrufe
- `FloorPlanDashboardWidget.tsx`: Bezieht Daten ueber `useLiveSensorValues` (das nun gecached ist)

### 2. Edge Function: Parallele Abfragen und DNS-Caching

**`supabase/functions/loxone-api/index.ts`:**

- **Batch-Groesse erhoehen**: Von 10 auf 20 parallele Requests (halbiert die seriellen Runden)
- **DNS-URL cachen**: Die aufgeloeste Miniserver-URL wird fuer die Dauer des Function-Aufrufs gespeichert (statt mehrfach aufgeloest)
- **Fehlerhafte Sensoren ueberspringen**: Der Sensor `15ea0aa5` verursacht wiederholt JSON-Fehler. Die Function faengt dies bereits ab, aber die Fehlermeldung wird reduziert (nur einmal loggen)

### 3. Frontend: Deduplizierung der API-Aufrufe

Aktuell senden `useEnergyData` und `useLiveSensorValues` separate `getSensors`-Requests fuer die **gleiche** Integration. Durch den zentralen Cache (Punkt 1) wird dies automatisch auf **einen einzigen Request** reduziert.

## Erwartete Verbesserung

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| API-Aufrufe pro Seitenbesuch | 2-4x pro Integration | 1x pro Integration |
| Serielle Batch-Runden | 7 (a 10 parallel) | 4 (a 20 parallel) |
| Wiederholte DNS-Aufloesung | Bei jedem Request | 1x pro Function-Aufruf |
| Cache-Dauer | Kein Cache | 1 Min stale, 5 Min Refresh |

## Technische Details

### Neuer zentraler Hook

```typescript
// src/hooks/useLoxoneSensors.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useLoxoneSensors(integrationId: string | undefined) {
  return useQuery({
    queryKey: ["loxone-sensors", integrationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("loxone-api", {
        body: { locationIntegrationId: integrationId, action: "getSensors" },
      });
      if (error || !data?.success) throw new Error("Failed to fetch sensors");
      return data.sensors;
    },
    enabled: !!integrationId,
    staleTime: 60_000,       // 1 Minute fresh
    refetchInterval: 300_000, // Alle 5 Min neu laden
  });
}
```

### Edge Function Batch-Optimierung

```typescript
// Batch-Groesse von 10 auf 20 erhoehen
const batchSize = 20; // vorher: 10
```

### Dateien die geaendert werden

1. **Neu:** `src/hooks/useLoxoneSensors.ts` -- Zentraler gecachter Hook
2. **Aendern:** `src/hooks/useEnergyData.tsx` -- Nutzt `useLoxoneSensors` statt eigene Fetches
3. **Aendern:** `src/hooks/useLiveSensorValues.ts` -- Nutzt `useLoxoneSensors` statt eigene Fetches
4. **Aendern:** `supabase/functions/loxone-api/index.ts` -- Batch-Groesse erhoehen

