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

### 1. Jetzt: neue Worker-Datei mit Block-State-Diagnose (v1.12)
- `docs/loxone-ws-worker/index.ts` erweitern: beim Verbinden pro Zähler-Block ein Diagnose-Event `ws_block_states` nach `bridge_event_log` (severity `warn`, damit es persistiert) mit Block-UUID, Control-Typ, Zähler-Name/ID, `energy_type` und **allen** State-Namen samt aktueller Rolle.
- Zusätzlich nach ca. 60 s Laufzeit ein zweites Event `ws_block_state_values` mit dem ersten beobachteten Wert je State — dadurch ist erkennbar, welcher State schwankt (Leistung) und welcher monoton steigt (Zählerstand).
- Kein Verhaltenswechsel am Live-/Persistenz-Pfad: weiterhin `live_only`-Broadcast plus 5-Minuten-Bündel, keine zusätzliche Schreiblast außer den wenigen Diagnose-Events pro Verbindung.
- Kurze Update-Anleitung `docs/loxone-ws-worker/UPDATE-v1.12-block-diagnose.md` (Datei ersetzen, `npm run build`, beide Docker-Builds).
- Du spielst das Update ein; danach werte ich die Events für „Erzeugung" und die übrigen Pull-Zähler aus.

### 2. Danach: Mapping schließen
- Die in Schritt 1 gefundenen Leistungs-State-Keys (z. B. `active`) für Strom/Wärme in die Pwr-Erkennung aufnehmen; Wasser/Gas bleiben ausgeschlossen.
- Wo die States nicht eindeutig sind: manuelle Zuordnung pro Zähler (State-Key am Zähler hinterlegt), die der Worker beim Mapping bevorzugt.


### 4. Verifikation
- Prüfen, dass `meter_power_readings_5min` für „Erzeugung" auf `source = bridge_ws` mit `sample_count > 1` umschaltet.
- Live-Wert in der UI gegen die Loxone-Anzeige gegenprüfen (Toleranz < 1 kW, Alter < 10 s).
- Zähler-Zählung `bridge_ws` vs. `loxone_pull` als Fortschrittsmaß dokumentieren.

## Technische Details

- Betroffene Dateien: `docs/loxone-ws-worker/index.ts` (Mapping/Diagnose), `supabase/functions/gateway-ingest/index.ts` (nur falls neues Event-Handling nötig), `src/pages/LiveValues.tsx`, `src/components/dashboard/EnergyFlowMonitor.tsx`.
- Keine zusätzliche Schreiblast: Live bleibt reiner Broadcast (`live_only`), Persistenz weiter über 5-Minuten-Bündel.
- Schritt 1 ist reines Frontend und sofort wirksam; Schritte 2–3 erfordern je ein Worker-Update auf Hetzner.
