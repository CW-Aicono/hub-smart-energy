# Worker-Update v1.11 — Mapping-Lücke schließen (Auto-Erkennung der Messwerte)

**Datum:** 31.07.2026
**Betrifft:** `loxone-ws-worker` auf dem Hetzner-Server
**Ziel:** Auch Zähler wie „Erzeugung" liefern ihre Werte über WebSocket live — statt nur alle 15 Minuten über den HTTP-Abruf.

---

## Was war das Problem?

Der Worker holt beim Verbinden die Loxone-Struktur (LoxAPP3) und ordnet jedem Zähler die passenden Messwerte („States") zu. Die Zuordnung lief bisher **nur über bekannte Namen** (`Pwr`, `EnergyToday`, `Total` …).

Loxone-Bausteine benennen ihre Messwerte aber sehr unterschiedlich — bei Eigenbau-Bausteinen z. B. „Leistung", „AI1" oder kundeneigene Bezeichnungen. Alles Unbekannte wurde **verworfen**. Ergebnis: Von 65 angebundenen Zählern lieferten nur 20 Live-Werte, die übrigen 45 liefen weiter über den 15-Minuten-Abruf — daher die veralteten Werte bei „Erzeugung".

## Was ändert v1.11?

1. **Nichts wird mehr verworfen.** Alle Messwerte eines Bausteins werden aufgenommen. Unbekannte Namen bekommen zunächst den Status „unklassifiziert" und werden **nicht** gesendet.
2. **Automatische Erkennung im Betrieb.** Nach drei beobachteten Werten entscheidet der Worker selbst:
   - Wert schwankt oder wird negativ → **Momentanleistung** (kW, Live + 5-Minuten-Historie)
   - Wert steigt nur an → **Zählerstand** (kWh)
3. **Schutz gegen Fehlzuordnung.** Bei Wasser und Gas wird ein Zählerstand nie als Leistung interpretiert (das verursachte früher die 660-kW-Ausreißer). Unplausible Werte werden weiterhin gefiltert.
4. **Sichtbarkeit.** Bausteine ohne erkannte Leistung werden beim Verbinden als Ereignis `ws_mapping_gap` in die Cloud gemeldet, die automatische Zuordnung als `ws_automap_pwr`. Beides ist im Gateway-Monitoring sichtbar — es muss nicht mehr im Container-Log gesucht werden.

Datenbank-Last: **unverändert**. Live-Werte laufen weiterhin ausschließlich über den Broadcast (`live_only`), Historisierung über die 5-Minuten-Bündel.

## Update durchführen

1. Auf dem Hetzner-Server anmelden, ins Worker-Verzeichnis wechseln.
2. Neue `index.ts` aus diesem Repository übernehmen (`docs/loxone-ws-worker/index.ts`).
3. Neu bauen und starten:

```
docker compose build loxone-ws-worker
docker compose up -d loxone-ws-worker
```

## Kontrolle nach dem Update

Im Log erscheinen kurz nach dem Start Zeilen wie:

```
[WS] 504F94... 12 Block(s) ohne Momentanleistung — Auto-Klassifikation läuft
[AutoMap] 504F94... block 1d48d32d-... state "Leistung" → pwr (Werteverlauf schwankend)
```

Danach in der Oberfläche prüfen: „Aktuelle Werte" und der Energiefluss-Monitor müssen für „Erzeugung" den realen Wert (aktuell rund -31 kW) im Sekundentakt zeigen.

Sollte ein einzelner Zähler nach ein paar Minuten weiterhin still bleiben, meldet das Ereignis `ws_mapping_gap` mit den vorhandenen State-Namen, was der Baustein anbietet — dann wird gezielt nachgezogen.

## Zurückrollen

Vorherige `index.ts` (v1.10) einspielen und neu bauen. Die Historisierung ist davon unabhängig.
