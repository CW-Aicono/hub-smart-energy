## Lage
- Der `loxone-ws-worker` loggt nur Heartbeats (alle 5 Min „Reload aktive Miniserver: 3"). Einzelne UUID-Werte erscheinen bewusst nicht im Log — sonst würde das Log pro Tag mehrere GB groß.
- Damit ist `docker logs` als Diagnose-Weg **erschöpft**. Wir müssen den Datenfluss eine Stufe weiter prüfen: was der Worker tatsächlich in die Datenbank schreibt.

## Plan (ohne weitere PuTTY-Aktion)
Ich frage hier in drei kleinen, lesenden SQL-Abfragen die Datenbank ab — du musst nichts tun, nur die Ergebnisse anschauen, die ich dir hier zeige:

1. **bridge_raw_samples**, letzte 60 Minuten, gefiltert auf die UUID-Familie `20cebdeb-01ad-53c9…53d1`.
   → Beantwortet eindeutig: Empfängt der Worker die 6 States des Zählers „Gesamtverbrauch"?

2. **meter_power_readings_5min_bridge** und **meter_cumulative_readings_bridge** für den Zähler „Zähler Gesamtverbrauch" (AICONO Zentrale), letzte 60 Minuten.
   → Beantwortet: Hat der Worker die UUIDs auf den richtigen Zähler gemappt und persistent gespeichert?

3. **meter_period_totals** für genau diesen Zähler, alle Source-Typen, letzte 24 h.
   → Beantwortet: Warum stehen auf der Kachel ~130 MWh statt 192 MWh — wird `loxone_live` für month/year geschrieben oder nicht?

## Entscheidung danach
- Treffer in 1, aber leer in 2 → Mapping-Bug im Worker (UUID → meter_id). Fix dort.
- Treffer in 1 + 2, aber `loxone_live` fehlt in 3 → Bug im gestern hinzugefügten Upsert in `loxone-api` (Edge Function). Fix dort, kein Worker-Deploy nötig.
- Kein Treffer in 1 → Miniserver liefert den Baustein gar nicht an den Worker. Dann reden wir über Loxone-Konfiguration, nicht über Code.

**Keine** Code-Änderung in diesem Plan — nur Lese-Abfragen. Erst wenn die Ergebnisse vorliegen, schlage ich den genau einen Fix vor, der das Problem löst.

## Was du tust
Nichts. Du wechselst in Build-Mode (Button „Implement plan"), ich führe die drei Lese-Abfragen aus und poste dir die Ergebnisse zusammen mit der Diagnose und dem Fix-Vorschlag in einer einzigen Antwort.
