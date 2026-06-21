# Loxone Hybrid 2.0 — Maximale WebSocket-Abdeckung

## Ziel

Möglichst viele Werte live über WebSocket vom Miniserver beziehen — passend zu Deinem Vorschlag. HTTP-Poll nur noch als Korrektur/Fallback. Wochen-/Quartalswerte aus täglich gespeicherten Loxone-Snapshots aggregieren.

## Konzept

### Datenquellen pro Wert

| Wert | Quelle | Aktualisierung |
|---|---|---|
| Live-Leistung (kW) | WebSocket `Pwr`-State | Sekunden |
| Heute (kWh) | WebSocket `EnergyToday`-State | Sekunden |
| Monat (kWh) | WebSocket `EnergyTotal` minus Monatsanfangs-Snapshot | live mit jedem WS-Event |
| Jahr (kWh) | WebSocket `EnergyTotal` minus Jahresanfangs-Snapshot | live mit jedem WS-Event |
| Gesamt (kWh) | WebSocket `EnergyTotal`-State | Sekunden |
| Woche (Graph) | Aggregation aus Tages-Snapshots | täglich neu |
| Quartal (Graph) | Aggregation aus Tages-Snapshots | täglich neu |
| Tag/Monat/Jahr (Graph) | Tages-Snapshots (neu) statt 5-Min-Buckets | täglich neu |
| HTTP-Poll alle 15 Min | Korrekturwert + Fallback wenn WS offline | 15 Min |

Loxone-Meter-Blöcke haben in `LoxAPP3.json` immer `Pwr` und `EnergyTotal` als States, meist auch `EnergyToday`. `EnergyMonth`/`EnergyYear` gibt es nicht zuverlässig — daher berechnen wir Monat/Jahr aus `EnergyTotal` minus gespeichertem Anfangswert.

## Umsetzung in 4 Schritten

### Schritt 1 — Worker: LoxAPP3-Parser + Multi-State-Subscription
Datei: `docs/loxone-ws-worker/index.ts`

- Nach `socket.send("data/LoxAPP3.json")` die Antwort parsen.
- Für jede in `meters.sensor_uuid` registrierte Block-UUID alle zugehörigen `states` ermitteln: `Pwr`, `EnergyToday`, `EnergyTotal`.
- Pro State-UUID separat `/jdev/sps/io/<state-uuid>/all` aufrufen.
- Erweiterte `uuidMap`: speichert jetzt zu jeder State-UUID den zugehörigen Meter + die State-Rolle (`pwr` | `today` | `total`).
- Sample-Handler schreibt je nach Rolle in das richtige Feld der Broadcast-Payload.

### Schritt 2 — DB: Tagessnapshot-Tabelle + Monats-/Jahres-Basiswerte
Neue Tabelle `meter_loxone_daily_snapshots`:
- `meter_id`, `snapshot_date`, `energy_total_kwh` (Zählerstand 00:00 Loxone), `energy_today_kwh` (Vortag final)
- Wird täglich um 00:05 Uhr gefüllt: `loxone-periodic-sync` extra Lauf, der pro Meter den aktuellen `EnergyTotal` abruft und speichert.

Daraus ableitbar in Views/Queries:
- **Monat** = aktueller `EnergyTotal` − Snapshot am Monats-1.
- **Jahr** = aktueller `EnergyTotal` − Snapshot am 01.01.
- **Woche** = Summe `energy_today_kwh` der letzten 7 Tage.
- **Quartal** = Summe `energy_today_kwh` des Quartals.

### Schritt 3 — Edge Function: Realtime-Broadcast erweitern
- Broadcast-Payload auf `loxone-live-{tenant}`-Kanal um `today_kwh` und `total_kwh` ergänzen (bisher nur Leistung).
- UI-Hook `useLoxoneLive` empfängt die neuen Felder.
- KPI-Kacheln (Heute / Monat / Jahr / Gesamt) berechnen Monat/Jahr clientseitig aus `total_kwh − Monats-/Jahres-Snapshot` (Snapshots werden initial einmal per Query geladen, Browser-Cache reicht).

### Schritt 4 — Graphen umstellen
- Hooks für Tages-/Monats-/Jahres-Graph: statt `meter_period_totals` (5-Min-Integration) jetzt `meter_loxone_daily_snapshots` (Loxone-Wahrheit).
- Woche/Quartal werden serverseitig (View oder Edge Function) als Summe der Tagessnapshots berechnet.
- 5-Min-Buckets bleiben unverändert für den Tages-Leistungsgraph (kW-Verlauf), da der Tagesverlauf der Leistung sonst nicht darstellbar ist.

## Was bleibt unverändert
- HTTP-Poll alle 15 Min (`loxone-periodic-sync` → `loxone-api`) läuft weiter als Korrektur + Fallback bei WS-Ausfall.
- 5-Min-Power-Integration für den Tages-Leistungsgraph bleibt.
- Bestehendes Live-Power-Display funktioniert nach Schritt 1 erstmals für alle Meter (heute nur für simple UUIDs).

## Risiken & ehrliche Einschätzung

1. **LoxAPP3-Struktur:** Variantenreich (verschiedene Meter-Block-Typen). Erste Iteration deckt EnergyMeter + ModbusMeter ab — andere Typen fallen sanft zurück auf HTTP-Poll. Wir loggen, was nicht gemappt werden konnte.
2. **Monats-/Jahressnapshots Migration:** Für bereits laufende Tenants haben wir keinen Snapshot vom 01. des Monats. Lösung: einmaliger Backfill aus letztem bekannten HTTP-Poll-Wert.
3. **Graph-Umstellung (Schritt 4)** ist der invasivste Teil. Falls Du das Risiko klein halten willst, können wir Schritt 4 weglassen und Graphen unverändert auf 5-Min-Buckets lassen — dann ist nur die KPI-Anzeige live, Graphen bleiben wie heute.

## Empfohlene Reihenfolge

1. Schritt 1+2 (Worker + Snapshot-Tabelle) — bringt Live-Werte für Heute/Monat/Jahr/Gesamt.
2. Schritt 3 (Broadcast + KPI-Kacheln) — sichtbarer Effekt für Dich.
3. **Validieren mit AICONO Zentrale** — erst wenn das passt:
4. Schritt 4 (Graphen umstellen) — optional, separat bestätigen.

Soll ich so umsetzen?
