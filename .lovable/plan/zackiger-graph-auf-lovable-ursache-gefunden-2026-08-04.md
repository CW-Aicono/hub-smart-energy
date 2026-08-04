# Zackiger Graph auf Lovable: Ursache gefunden

## Kurzantwort

Das Backend hat kein Schreib-/Leseproblem. In der Testumgebung schreibt der HTTP-Pull-Fallback der Funktion `loxone-api` alle 15 Minuten **zusätzliche 5-Minuten-Buckets mit dem Wert 0** in dieselbe Zeitreihe, in der schon korrekte Werte aus dem Backfill stehen. Der Graph fällt dadurch regelmäßig auf 0 und springt wieder hoch — genau das Zacken-Muster aus Screenshot 1. Auf Hetzner passiert das nicht, dort liegt nur die saubere Backfill-Reihe vor (Screenshot 2, Stufenkurve).

## Belege (in der Datenbank geprüft, Zähler „Netzbezug", AICONO Zentrale, heute)

```text
09:45  81,63 kW   source=gateway_backfill  sample_count=5
09:50 103,32 kW   source=gateway_backfill  sample_count=5
09:55   0,00 kW   source=loxone_pull       sample_count=1   <-- Einbruch
10:00  45,22 kW   source=gateway_backfill  sample_count=5
10:05  56,53 kW   source=gateway_backfill  sample_count=5
10:10   0,00 kW   source=loxone_pull       sample_count=1   <-- Einbruch
```

Der 0-Wert kommt exakt im 15-Minuten-Raster — das ist das Abfrage-Intervall des Miniservers aus dem Dialog in Screenshot 3/4.

## Warum der Fallback überhaupt feuert

In `supabase/functions/loxone-api/index.ts` (Phase 4a, Pull-Fallback) wird geprüft, ob der WS-Worker frisch ist — aber **nur** gegen `source = "bridge_ws"`. Die echten Werte dieser Liegenschaft kommen aktuell über `gateway_backfill`; nur ein einziger Zähler („Voltage L1-L2") liefert `bridge_ws`. Damit gilt fast jeder Zähler als „stale", der Fallback schreibt seinen Momentanwert — und dieser Momentanwert ist bei den nicht als Leistung gemappten Blöcken 0.

## Maßnahmen

1. **Frische-Prüfung erweitern** (`loxone-api`, Phase 4a): Ein Zähler gilt als versorgt, wenn im Frische-Fenster ein Bucket aus **irgendeiner** autoritativen Quelle existiert (`bridge_ws`, `gateway_backfill`, `loxone_backfill`) — nicht nur `bridge_ws`.
2. **Keine 0-Werte als Fallback schreiben**: Kandidaten ohne belastbaren Leistungswert (Wert exakt 0 bzw. Rolle nicht als Leistung gemappt) werden übersprungen, statt eine Null in die Historie zu setzen. Lücken sind ehrlicher als falsche Nullen.
3. **Vorrang-Regel beim Upsert**: Ein bestehender Bucket aus `bridge_ws`/`gateway_backfill` darf nicht durch `loxone_pull` überschrieben werden.
4. **Bereinigung der Altdaten**: Migration, die `loxone_pull`-Buckets mit `power_avg = 0` löscht, sofern für denselben Zähler im selben Zeitfenster reale Buckets existieren; anschließend betroffene Tages-/Stundensummen neu berechnen.
5. **Verifikation**: Zeitreihe „Netzbezug" für heute erneut abfragen — keine 0-Einbrüche im 15-Minuten-Raster mehr; Graph in der Testumgebung muss der Hetzner-Kurve entsprechen.

## Offener Nebenbefund (nicht Teil dieses Fixes)

Das WS-Mapping ist in der Testumgebung weiterhin nur für einen Zähler aktiv (`bridge_ws`). Deshalb sind die Werte hier 15-Minuten-Stufen statt echter Live-Werte. Das ist die bekannte State-Zuordnung und wird separat behandelt.

## Technische Details

- Geänderte Datei: `supabase/functions/loxone-api/index.ts` (Block „Phase 4a: Pull-Fallback", ca. Zeile 1889–1947).
- Eine Migration für die Bereinigung der bestehenden `loxone_pull`-Nullwerte in `meter_power_readings_5min` plus Neuberechnung der betroffenen `meter_period_totals`.
- Keine Frontend-Änderungen nötig — die Chart-Komponenten sind korrekt, sie zeigen nur die kontaminierten Daten.
