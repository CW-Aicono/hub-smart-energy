
## Ziel: Echtes Realtime statt 30-Sekunden-Polling

Aktuell holt `LiveValues.tsx` alle 30 Sekunden aktiv neue Daten via HTTP-Aufruf zur `loxone-api` Edge Function. Das Ziel ist, dass das Frontend neue Werte **sofort** erhält — ohne selbst zu fragen — sobald der Gateway Worker sie in die Datenbank schreibt.

## Architektur-Vergleich

```text
JETZT (Polling):
  Worker  ──30s──►  meter_power_readings
  Browser ──30s──►  loxone-api  ──────►  Loxone Miniserver
                    (2 parallele Polling-Schleifen, unabhängig)

ZIEL (Realtime):
  Worker  ──30s──►  meter_power_readings
                         │
                    Supabase Realtime (WebSocket, instant)
                         │
                    Browser (bekommt neuen Wert sofort)
```

## Warum das funktioniert

Der Gateway Worker schreibt bereits jede 30 Sekunden in `meter_power_readings`. Diese Tabelle enthält `power_value` — den aktuellen Momentanwert (kW) pro Meter. Wenn Supabase Realtime auf diese Tabelle aktiviert wird, bekommt der Browser über eine WebSocket-Verbindung sofort ein Event bei jedem `INSERT`. Das Frontend muss dann nur noch auf diese Events hören und den angezeigten Wert aktualisieren — kein eigener Timer, kein eigener HTTP-Call mehr.

## Was geändert wird

### 1. Datenbank: Realtime für `meter_power_readings` aktivieren

Eine Migration aktiviert Realtime auf der Tabelle:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_power_readings;
```

### 2. `src/pages/LiveValues.tsx` — Polling ersetzen durch Realtime-Subscription

Die bisherige `fetchLiveValues`-Funktion mit `setInterval(..., 30000)` wird ersetzt durch:

```typescript
useEffect(() => {
  // Einmaliger Initialload aus meter_power_readings (letzter Wert pro Meter)
  loadInitialValues();

  // WebSocket-Subscription: bei jedem neuen INSERT sofort UI updaten
  const channel = supabase
    .channel('meter-power-readings-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'meter_power_readings' },
      (payload) => {
        const r = payload.new;
        setLiveValues(prev => {
          const next = new Map(prev);
          next.set(r.meter_id, {
            value: r.power_value,
            totalDay: prev.get(r.meter_id)?.totalDay ?? null,
            // ... weitere Felder
          });
          return next;
        });
        setLastRefresh(new Date());
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [meters]);
```

Der manuelle "Aktualisieren"-Button bleibt als Fallback erhalten.

### 3. Initialer Datenladeweg (einmalig beim Start)

Beim ersten Laden der Seite werden die **letzten bekannten Werte** aus `meter_power_readings` geladen (ein DB-Query, kein Loxone-API-Call):

```sql
SELECT DISTINCT ON (meter_id) meter_id, power_value, recorded_at
FROM meter_power_readings
ORDER BY meter_id, recorded_at DESC
```

Das ersetzt den bisherigen Aufruf der `loxone-api` beim Seitenaufruf komplett.

### 4. Tageswerte / Zählerstände (totalDay, totalMonth etc.)

Diese Werte kommen nicht aus `meter_power_readings` (dort steht nur der Momentanwert). Sie werden **weiterhin einmalig** beim Laden über die `loxone-api` Edge Function abgerufen und gecacht — aber nicht mehr im 30-Sekunden-Intervall. Der Loxone-API-Call wird damit auf einen einzigen Aufruf pro Sitzung reduziert.

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `supabase/migrations/...` | `ALTER PUBLICATION supabase_realtime ADD TABLE meter_power_readings` |
| `src/pages/LiveValues.tsx` | `setInterval` → Supabase Realtime Channel Subscription |

Keine Änderungen am Gateway Worker nötig — er schreibt weiterhin wie bisher in die DB.

## Ergebnis

| | Vorher | Nachher |
|---|---|---|
| Latenz (Browser sieht neuen Wert) | bis zu 30 Sekunden | unter 1 Sekunde |
| HTTP-Calls pro Minute (Browser) | 2× loxone-api | 0 (nur WebSocket) |
| Loxone Miniserver-Last | jede 30s direkt abgefragt | keine direkten Abfragen mehr |
| Netzwerk-Effizienz | HTTP-Polling | Event-Push via WebSocket |

## Schritt-für-Schritt Deployment

Nach der Implementierung durch Lovable:

1. Die Migration läuft automatisch — keine manuelle Aktion nötig
2. Die `LiveValues`-Seite im Browser öffnen
3. Warten bis der Gateway Worker im nächsten 30-Sekunden-Zyklus Daten schreibt
4. Die Werte sollten sich **sofort** aktualisieren — ohne sichtbares "Polling"
5. Im Browser-DevTools → Network → WS-Tab: eine persistente WebSocket-Verbindung zu Supabase Realtime sollte sichtbar sein
