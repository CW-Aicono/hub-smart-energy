## Ziel
SOC-Darstellung ehrlich und konsistent machen, beide Charts auf identischer Zeitachse, keine irreführende ReferenceLine mehr.

## Änderungen in `src/components/dashboard/EnergyFlowMonitor.tsx` (nur `MeterDetailDialog`)

### 1. SOC-Fallback als **Punkt „jetzt"**, nicht als Linie
- `ReferenceLine y={100}` entfernen.
- Stattdessen: `ReferenceDot x={now} y={currentSocPct} r={5}` in Blau, mit Label „SOC 100 %" rechts daneben.
- Ergebnis: Der aktuelle SOC ist als einzelner Punkt am rechten Rand sichtbar — kein Balken quer über 24 h.

### 2. Wenn echte SOC-Historie vorliegt (Guard OK)
- SOC-Linie **durchgezogen** (nicht gestrichelt), `connectNulls={false}`, so dass sie erst dort beginnt, wo Samples existieren (z. B. ab 10:00).
- Rechte Y-Achse (0–100 %) nur einblenden, wenn `hasSoc` **oder** `currentSocPct != null`.

### 3. Beide Charts auf identische Zeitachse
- `XAxis` in **beiden** Charts (Leistung + Energie pro Stunde):
  - `type="number"`, `scale="time"`,
  - `domain={[now - 24h, now]}` (fix, nicht `dataMin/dataMax`),
  - `ticks` = generierte Stundenmarken alle 3 h ab `now` rückwärts,
  - `interval={0}`, `allowDataOverflow`.
- Energie-Buckets bleiben stundengenau mit Vor-Initialisierung 0 → jetzt liegen sie deckungsgleich unter den Power-Ticks.

### 4. Leerraum links beim Leistungs-Chart transparent machen
- Kleiner Hinweis unter der X-Achse (nur wenn erster Datenpunkt > 1 h nach Domain-Start):
  „Keine Daten vor {HH:mm}" — als dezenter grauer Text, damit klar ist: kein Bug, sondern echter Gateway-Ausfall.

### 5. Hinweis-Badge präzisieren
Wenn `socInvalid` **und** `socSensorUuid` gesetzt → Badge-Text:
„SOC-Sensor liefert Leistungswerte (kW) statt Ladezustand (%). Bitte in den Speicher-Einstellungen die korrekte SOC-UUID hinterlegen."

### 6. Nicht geändert
- Keine DB-/Migration-Änderungen.
- Keine Auto-Korrektur der `soc_sensor_uuid` — muss der Nutzer in den Einstellungen fixen.
- Kein Anfassen der Fetch-Logik/Query-Keys.

## Ergebnis
- Frage 1: Badge macht die Ursache klar und actionable.
- Frage 2/3: Keine gestrichelte, chartbreite Referenzlinie mehr — nur ein Punkt „jetzt".
- Frage 4: Klarer Hinweis „keine Daten vor 02:00" statt stiller Leerraum.
- Frage 5: Beide Charts nutzen identisches `[now-24h, now]`-Domain mit denselben Ticks → visuell aligned.
