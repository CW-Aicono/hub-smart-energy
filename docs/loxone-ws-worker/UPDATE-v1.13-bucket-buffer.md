# Update auf v1.13 — Bucket-Puffer (Ursache der fehlenden WS-Historie)

## Was war der Fehler

Der Worker sammelte Leistungswerte in 5-Minuten-Buckets. Beim Bucket-Wechsel wurde der **fertige Bucket sofort verworfen**, sobald der erste neue Wert eintraf — der Versand lief aber nur einmal pro Minute. Bei Zählern, die häufig aktualisieren (z. B. „Erzeugung", PV, Netzbezug), kam der neue Wert immer sekundenschnell → der abgeschlossene Bucket war weg, bevor er gesendet wurde.

Folge: Nur selten aktualisierende Zähler landeten mit `source = bridge_ws` in der Historie (zuletzt 4–5 pro Bucket), alle aktiven Zähler blieben auf den 15-Minuten-Pull-Werten hängen — genau die Abweichung, die du bei „Erzeugung" gesehen hast.

## Was v1.13 ändert

- Abgeschlossene Buckets werden **zwischengepuffert** (max. 24 je State) statt verworfen.
- `flushBuckets()` sendet gepufferte **und** abgeschlossene Buckets, korrekt je Zeitstempel getrennt.
- Keine Änderung am Live-Broadcast, keine zusätzliche Schreiblast außer den nun tatsächlich ankommenden 5-Min-Zeilen.

## Schritte auf dem Server

1. `cd /opt/aicono/loxone-ws-worker`
2. `cp index.ts index.ts.bak-$(date +%F-%H%M)`
3. `> index.ts` und dann `nano index.ts` — den **kompletten** Inhalt von `docs/loxone-ws-worker/index.ts` einfügen (keine Teil-Patches!), speichern.
4. Kontrolle: `grep -n "v1.13-bucket-buffer" index.ts`
5. `npm run build` — nur bei fehlerfreiem Build weiter.
6. `docker compose build --no-cache && docker compose up -d && docker compose logs -f --tail=50`

Im Log muss `version=v1.13-bucket-buffer` erscheinen.

## Verifikation (mache ich danach)

- `meter_power_readings_5min`: Anzahl Zähler mit `source = bridge_ws` je Bucket steigt von ~5 auf die Zahl der aktiven WS-Zähler.
- „Erzeugung" zeigt `bridge_ws` mit `sample_count > 1`.
