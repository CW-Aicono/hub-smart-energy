# Diagnose

Der Meter **„Erzeugung"** (meter_function=`generation`) liefert aktuell **-108,519 kW** (also negativ). Aus der DB bestätigt für 13.07.2026 11:30 UTC:

```
name: Erzeugung
meter_function: generation
power_value: -108.519
```

Im Widget wird der Absolutwert (108,52 kW) korrekt angezeigt, aber die Flussrichtungs-Logik in `EnergyFlowMonitor.tsx` (Zeile 508) interpretiert das negative Vorzeichen als „reversed":

```ts
const isReversed = flowWatts != null && flowWatts < 0;
```

Dadurch drehen sich Pfad und Animation um → die Punkte laufen von NSHV SÜD **zur** PV, obwohl PV immer erzeugt (also zum Verbraucher fließt).

Beim „Test Flow-Widget" stimmt die Richtung nur zufällig, weil die dortige PV („Produktion", +6,68 kW) ein positives Vorzeichen liefert. Verschiedene Gateway-Familien nutzen unterschiedliche Vorzeichen-Konventionen für Erzeugung.

# Ursache

Die aktuelle Richtungslogik behandelt jeden Meter gleich: „Vorzeichen bestimmt Richtung". Für **generation-Meter** ist das falsch — Erzeugung fließt physikalisch immer vom Erzeuger weg, unabhängig vom Vorzeichen des Rohwerts (das je nach Gateway-Konvention +/– sein kann).

# Fix

In `src/components/dashboard/EnergyFlowMonitor.tsx` (~Zeile 505–510):

Für Kanten, deren `fromNode` ein Generation-Meter ist:
- Vorzeichen ignorieren, `isReversed = false` erzwingen
- Anzeige- und Animationswert = `Math.abs(flowWatts)`

Für alle anderen Kanten (Netz bidirektional, Speicher, Verbraucher-Submeter) bleibt die bestehende Logik unverändert.

## Technische Umsetzung

1. `nodes`/`connections` bereits vorhanden — pro Kante prüfen, ob `fromNode.meter_function === 'generation'` (Feld ggf. mitladen, falls nicht vorhanden).
2. In der Render-Schleife (Zeile 505 ff.):
   ```ts
   const rawWatts = getLiveWatts(fromNode.meter_id);
   const isGeneration = fromNode.meter_function === 'generation';
   const flowWatts = isGeneration && rawWatts != null ? Math.abs(rawWatts) : rawWatts;
   const isReversed = !isGeneration && flowWatts != null && flowWatts < 0;
   ```
3. `meter_function` in der Node-Ladelogik ergänzen, falls es noch nicht mitkommt.

# Nicht Teil dieses Fixes

- Speicher-/Netz-Konvention (Test-Widget stimmt bereits laut Nutzer)
- Änderung der Rohdaten oder Ingest-Funktionen — nur UI-seitige Vorzeichenbehandlung für Generation
