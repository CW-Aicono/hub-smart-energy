# Live-Werte: Abweichung „Erzeugung" (-78,10 kW vs. -71,3 kW)

## Kurzantwort

Nein — 100 % bestätigen kann ich es nicht, und zwar aus einem konkreten, geprüften Grund: **„Erzeugung" läuft gar nicht über WebSocket.** Der angezeigte Wert stammt aus dem 15-Minuten-HTTP-Pull, ist also bis zu 15 Minuten alt — trotz grünem „Live"-Badge.

## Belege (verifiziert in der Datenbank)

- Alle 5-Minuten-Datensätze des Zählers „Erzeugung" (AICONO Zentrale) tragen `source = loxone_pull`, `sample_count = 1`, im 15-Minuten-Raster:
  14:25 → -78,10 kW · 13:55 → -92,14 · 13:40 → -96,02 · 13:25 → -37,66 · 13:10 → -77,71
  Genau die -78,10 aus dem Screenshot ist der Pull-Wert von 14:25 Uhr.
- Letzte 2 Stunden gesamt: **63 Zähler über `loxone_pull`**, nur **24 über `bridge_ws`**. Die Mapping-Lücke ist also nur teilweise geschlossen.
- `bridge_event_log` meldet weiterhin `ws_mapping_gap` für Blöcke, deren einziger Kandidat-State `active` heißt; der Klassifizierer kennt `actual/value/p`, aber nicht `active`. Die Laufzeit-Heuristik befördert `active` erst nach ≥3 Samples und nur, wenn der Wert einmal fällt — bei vielen Blöcken passiert das nie oder erst spät.
- Fazit zur Genauigkeit: Die **echten WS-Werte** sind korrekt (Momentanwert, max. 0,05 kW Delta-Schwelle, Keepalive-Push). Die Abweichung entsteht ausschließlich durch veraltete Pull-Werte bei den noch nicht migrierten Zählern.

## Vorgehen

### 1. Ehrliche Frische-Anzeige (Frontend, sofort)
- „Live"-Badge nur, wenn der Wert jünger als 60 s ist (WS-Broadcast oder `bridge_ws`).
- Sonst Badge „Verzögert" mit Alter, z. B. „vor 12 Min (15-Min-Abruf)"; Tooltip erklärt die Quelle.
- Betrifft `src/pages/LiveValues.tsx` sowie die Zählerkacheln im Dashboard/Energy-Flow.

### 2. Diagnose je Zähler statt Heuristik-Raten (Worker)
- Neues Diagnose-Event `ws_block_states` beim Verbinden: Block-UUID, Control-Typ und **alle** State-Namen inkl. erstem Wert — damit sieht man für „Erzeugung" und die übrigen ~40 Pull-Zähler exakt, welcher State die Leistung liefert.
- Auswertung in der Cloud, dann gezielte Zuordnung statt Blind-Heuristik.

### 3. Mapping schließen
- `active` (und weitere aus Schritt 2 gefundene Keys) für Strom/Wärme in die Ambiguous-Pwr-Liste aufnehmen; Wasser/Gas bleiben ausgeschlossen.
- Wo die States nicht eindeutig sind: manuelle Zuordnung pro Zähler in der DB (State-Key am Zähler hinterlegbar), die der Worker beim Mapping bevorzugt.

### 4. Verifikation
- Prüfen, dass `meter_power_readings_5min` für „Erzeugung" auf `source = bridge_ws` mit `sample_count > 1` umschaltet.
- Live-Wert in der UI gegen die Loxone-Anzeige gegenprüfen (Toleranz < 1 kW, Alter < 10 s).
- Zähler-Zählung `bridge_ws` vs. `loxone_pull` als Fortschrittsmaß dokumentieren.

## Technische Details

- Betroffene Dateien: `docs/loxone-ws-worker/index.ts` (Mapping/Diagnose), `supabase/functions/gateway-ingest/index.ts` (nur falls neues Event-Handling nötig), `src/pages/LiveValues.tsx`, `src/components/dashboard/EnergyFlowMonitor.tsx`.
- Keine zusätzliche Schreiblast: Live bleibt reiner Broadcast (`live_only`), Persistenz weiter über 5-Minuten-Bündel.
- Schritt 1 ist reines Frontend und sofort wirksam; Schritte 2–3 erfordern je ein Worker-Update auf Hetzner.
