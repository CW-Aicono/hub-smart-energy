# Update auf v1.14 — Live-Werte alle 5 Sekunden

## Befund (gemessen, nicht geraten)

v1.13 funktioniert: In `meter_power_readings_5min` stieg die Zahl der Zähler mit
`source = bridge_ws` von 4–5 auf **24 pro Bucket**, „Erzeugung" liefert jetzt
`bridge_ws` (−25,99 kW) statt `loxone_pull` (−68,32 kW). Die Historie ist damit korrekt.

Aber: Der **Live-Broadcast** kommt nur **einmal pro Minute** an (Messung am Realtime-Kanal:
1 Event mit 40 Werten in 25 s; Edge-Log zeigt Pushes exakt im Minutentakt). Ursache:
Der Worker las `FLUSH_INTERVAL_MS` aus der Server-`.env`, und dort steht aus der
IO-Sparphase `60000`. Alle Werte kamen deshalb nur als 60-s-Keepalive.

## Was v1.14 ändert

- `LIVE_PUSH_INTERVAL_MS` ignoriert das alte `FLUSH_INTERVAL_MS` komplett.
- Wert wird hart auf **2–15 s** begrenzt, Standard **5 s**.
- Keine weitere Änderung; Persistenz (5-Min-Buckets) bleibt unverändert, weiterhin 0 zusätzliche Disk-IO.

## Schritte auf dem Server

1. `cd /opt/aicono/loxone-ws-worker`
2. `cp index.ts index.ts.bak-$(date +%F-%H%M)`
3. `> index.ts` und `nano index.ts` — kompletten Inhalt von `docs/loxone-ws-worker/index.ts` einfügen, speichern.
4. Optional in `.env` sauber machen: Zeile `FLUSH_INTERVAL_MS=60000` löschen, `LIVE_PUSH_INTERVAL_MS=5000` setzen.
5. `npm run build` — nur bei fehlerfreiem Build weiter.
6. `docker compose build --no-cache && docker compose up -d && docker compose logs -f --tail=50`

Im Log muss stehen: `[Live-Push] aktiv: alle 5s Broadcast`.

## Verifikation (mache ich danach)

- Realtime-Kanal `loxone-live-<tenant>`: Events alle ~5 s statt alle 60 s.
- Zählerkachel „Erzeugung" ändert sich sichtbar im Sekundentakt.
