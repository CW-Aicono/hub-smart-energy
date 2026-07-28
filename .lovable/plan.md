## Ursache

Die X-Achse im „Sensor-Verlauf"-Chart nutzt `domain={["dataMin","dataMax"]}` und überlässt die Tick-Erzeugung Recharts. Dadurch:

- Sensoren mit dicht verteilten Werten über die volle Zeitspanne (Bool-Sensor) sehen korrekt aus.
- Sensoren, deren Rohwerte nicht das gesamte Fenster abdecken oder ungleichmäßig verteilt sind (Wh-Zähler), bekommen automatisch gewählte Ticks mit unregelmäßigen Abständen (z.B. 28-Min-Schritte, endet bei 10:20 obwohl der letzte Wert 23:00 ist). Es liegt **nicht** an einer noch zu kurzen Erfassungshistorie.

## Änderungen

Nur eine Datei: `src/components/sensors/SensorHistoryChart.tsx`

1. **Feste Domain je Range** — X-Achse spannt `[now - RANGE_MS[range], now]` statt `dataMin/dataMax`. So bleibt die Beschriftung konsistent, auch wenn Daten nicht das volle Fenster abdecken.
2. **Deterministische Ticks** — eigene `ticks`-Liste in Europe/Berlin-Zeit generieren:
   - `24h`: alle 2 Stunden, an volle Stunden ausgerichtet
   - `7d`: alle 12 Stunden
   - `30d`: alle 3 Tage (Mitternacht)
   - `12m`: Monatserster
3. **Hinweiszeile** unter dem Chart, wenn erster/letzter Datenpunkt merklich vom Fensterrand entfernt ist (>10 % des Fensters): „Erfassung ab … · letzter Wert …". Beantwortet direkt die Nutzerfrage, ob es an neuer Erfassung liegt.

Y-Achse, Tooltip, Bool-Erkennung, Queries und Fallback-Logik bleiben unverändert. Kein Backend-/Ingest-Change nötig.
