## Ausgangslage (gemessen, nicht vermutet)

- Loxone-WS-Worker liefert wieder normal: 338 Rohsamples / 15 min für Tenant `0ce0c43a`.
- `gateway-ingest` schreibt aber nur noch **42 Zeilen / 15 min** in `meter_power_readings` für diesen Tenant. Über alle Meter verteilt ergibt das ~3 Datenpunkte pro Meter pro Stunde.
- Widgets (EnergyFlowMonitor, PieChart, Verbrauchsübersicht) lesen kurze Zeitfenster aus `meter_power_readings` und finden daher nichts.
- Ursache: der von mir zuletzt eingebaute In-Memory Delta-Guard (`|Δ| ≥ 5 W` und `≥ 1 %`, sonst alle 60 s) ist für langsam/klein driftende Loxone-Signale zu grob.
- Der WS-Worker selbst, der Aggregator und der Realtime-Broadcast funktionieren.

## Ziel

Widgets wieder mit Werten füllen, **ohne** Datenpfad umzubauen und **ohne** die IO-Krise wieder auszulösen.

## Plan – 3 kleine, umkehrbare Schritte

### Schritt 1 – Delta-Guard entschärfen (Haupt-Fix)

In `supabase/functions/gateway-ingest/index.ts`:

- Schwelle von `|Δ| ≥ 5 W` auf **`|Δ| ≥ 1 W`** senken.
- Prozent-Bedingung entfernen (`≥ 1 %` fällt weg).
- Max-Intervall von 60 s auf **15 s** senken – d. h. spätestens alle 15 s wird pro Meter ein Stützpunkt geschrieben, auch wenn der Wert konstant ist.
- Coalescing pro Request-Batch **bleibt** (das war IO-effektiv und schadet nicht).

Erwartung: Widgets bekommen wieder ~4 Punkte/min pro Meter, IO-Last steigt gegenüber jetzt, bleibt aber deutlich unter dem Vor-Krisen-Niveau (weil Coalescing + 1 W-Schwelle Mikrorauschen weiter filtern).

### Schritt 2 – NULL-Tenant-Samples nicht liegen lassen

144 unverarbeitete Rohsamples, davon 170 in den letzten 15 min mit `tenant_id = NULL`.

- Prüfen, welcher Codepfad in `gateway-ingest` `tenant_id` nicht setzt (vermutlich Fallback-Pfad ohne Auth-Kontext).
- Falls harmlos: NULL-Samples im Aggregator als „unmapped" akzeptiert markieren, damit sie nicht liegen bleiben und den Rückstand aufbauen.
- Keine Umverdrahtung, nur `processed_at` auch für unmappable NULL-Rows setzen.

### Schritt 3 – Beobachten, dann entscheiden

Nach 15 min Betrieb mit den neuen Schwellen:

- `meter_power_readings`-Rate pro Tenant erneut messen (Ziel: ≥ 5× aktuelle Rate für Tenant `0ce0c43a`).
- IO-Budget in Advanced Settings prüfen.
- Widgets im Dashboard visuell prüfen.

**Wenn IO stabil bleibt** → fertig, keine weiteren Änderungen.
**Wenn IO wieder steigt** → Schwellen wieder etwas anziehen (z. B. 2 W / 20 s) oder gezielt einzelne Rausch-Sensoren identifizieren.

## Was ich ausdrücklich NICHT tue

- Keine neuen Hooks, kein `useEnergyData`-Umbau, kein Client-Fallback auf `bridge_raw_samples`.
- Kein Umbiegen der Widgets auf andere Tabellen.
- Keine SQL-Migration, keine Trigger-Änderung.
- Keine Änderung am WS-Worker, am Aggregator oder am Broadcast-Kanal.
- Kein Backend-Restart.

## Rollback

Ein einziger File-Edit in `gateway-ingest/index.ts`. Rückrollen = Werte zurücksetzen auf 5 W / 60 s.

## Technische Details

**Betroffene Datei:** `supabase/functions/gateway-ingest/index.ts` – nur die Delta-Guard-Konstanten und die `if`-Bedingung, die entscheidet, ob ein Reading in `meter_power_readings` bzw. `bridge_raw_samples` geschrieben wird.

**Nicht angefasst:** `bridge-aggregator`, `useEnergyData`, `useRealtimePower`, `useGatewayLivePower`, EnergyFlowMonitor, PieChartWidget, alle SQL-Objekte.
