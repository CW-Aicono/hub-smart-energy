# Update auf v1.12 — Block-State-Diagnose

Ziel: Der Worker meldet pro Loxone-Block **alle** State-Namen und 60 Sekunden später deren erste Echtwerte in die Cloud. Damit schließen wir die Mapping-Lücke der noch im 15-Minuten-Pull hängenden Zähler (u. a. „Erzeugung") ohne Raten.

Am Live-/Persistenz-Pfad ändert sich nichts: Live bleibt reiner Broadcast, Historie weiter über 5-Minuten-Bündel. Zusätzliche Schreiblast: wenige Diagnose-Events pro Verbindungsaufbau.

## Wichtig: Datei vollständig ersetzen

Die letzten Build-Fehler (`cfg`, `state`, `meter_id`) kamen von unvollständig eingefügtem Code. Bitte **keine** punktuellen `sed`-Patches mehr.

## Schritte auf dem Server

1. In das Worker-Verzeichnis wechseln:
   ```bash
   cd /opt/aicono/loxone-ws-worker
   ```
2. Sicherung anlegen:
   ```bash
   cp index.ts index.ts.bak-$(date +%F-%H%M)
   ```
3. Datei leeren und neu einfügen:
   ```bash
   > index.ts
   nano index.ts
   ```
   Den **kompletten** Inhalt von `docs/loxone-ws-worker/index.ts` aus dem Repo einfügen, dann `Strg+O`, `Enter`, `Strg+X`.
4. Kontrolle, dass die Datei vollständig ist (Version muss erscheinen):
   ```bash
   grep -c "" index.ts
   grep -n "v1.12-block-diagnose" index.ts
   ```
5. Typprüfung/Build:
   ```bash
   npm run build
   ```
   Nur bei fehlerfreiem Build weitermachen.
6. Container neu bauen und starten:
   ```bash
   docker compose build --no-cache
   docker compose up -d
   docker compose logs -f --tail=50
   ```

## Erwartete Log-/Event-Ausgabe

- Container-Log: `version=v1.12-block-diagnose`
- In der Cloud (`bridge_event_log`) nach dem Verbinden:
  - `ws_block_states` — je Block: Block-UUID, Control-Typ, Control-Name, Zähler-ID, Energieart und alle State-Namen mit Rolle (`pwr`, `total`, `aux`, `ignoriert`)
  - `ws_block_state_values` — 60 s später: erster Wert je State, Anzahl Beobachtungen, ob der Wert schon einmal gefallen ist

## Danach

Sobald der Worker läuft, werte ich die Events aus und trage die tatsächlich gefundenen Leistungs-State-Keys fest in die Pwr-Erkennung ein (Wasser/Gas bleiben ausgeschlossen). Anschließend prüfen wir, dass `meter_power_readings_5min` für „Erzeugung" auf `source = bridge_ws` umschaltet.
