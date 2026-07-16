## Diagnose (mit Datencheck bestätigt)

Ich habe die Cloud-DB (Lovable-Backend) direkt abgefragt für den Speicher-Zähler `9650d672…`:

| Quelle | Zeitraum verfügbar | Zeilen (7 d) |
|---|---|---|
| `meter_power_readings` (Leistung) | **nur 16.07. 00:00 UTC → jetzt** | 74 |
| `storage_soc_readings` (SOC) | 13.07. → jetzt | 10 075 |

Damit lässt sich jedes Symptom eindeutig zuordnen:

### 1) „SOC und Leistung nicht parallel"
Beide Reihen werden zwar über die gleiche X-Achse gerendert, aber die Leistungs-Reihe endet links bei 02:00 (= 00:00 UTC), weil in der **Cloud-DB nur ~24 h Power-Historie** liegt. Die SOC-Linie sollte dagegen mehrere Tage abdecken – wird aber im Chart auf denselben Ausschnitt reduziert.

### 2) „Leistungs-Graph beginnt immer um 02:00"
Kein Frontend-Bug, sondern **Retention**. Die Hetzner-Live-DB hält Power-Readings länger vor (dort korrekt), die Cloud-DB (dieses Lovable-Projekt) hat schlicht keine älteren Werte. 02:00 CEST = 00:00 UTC, der älteste vorhandene Datensatz.

### 3) „Einspeisung unter X-Achse"
Echter Code-Bug: `energyBuckets` liefert `import` und `export` **beide als positive kWh-Werte** und beide Bars werden oberhalb der X-Achse gestapelt. Bei bidirektionalen Zählern soll Einspeisung negativ dargestellt werden.

---

## Plan

### A. Sofort-Fix im Frontend (`src/components/dashboard/EnergyFlowMonitor.tsx`)

1. **Einspeisung negativ darstellen** (Chart 2, ab Zeile ~1780)
   - `energyBuckets` bleibt physisch positiv (KPI-Kacheln zeigen weiterhin Bezug / Einspeisung als Beträge).
   - Für den BarChart eine abgeleitete Reihe `energyBucketsChart` bauen: `{ t, import, exportNeg: -export }`.
   - `<Bar dataKey="import" …>` (Bezug, pink, oberhalb) und `<Bar dataKey="exportNeg" …>` (Einspeisung, grün, unterhalb).
   - Y-Achse: `domain={[(dataMin) => Math.min(0, dataMin), (dataMax) => Math.max(0, dataMax)]}`, `ReferenceLine y={0}` bei bidirektionalen Speichern.
   - Tooltip: `name === "exportNeg"` → Label „Einspeisung", Wert wieder als `Math.abs(v)` formatieren.
   - Legende entsprechend anpassen.

2. **SOC + Leistung visuell zusammenführen (Chart 1)**
   - Wenn Power-Historie kürzer ist als SOC-Historie, den sichtbaren X-Bereich des Leistungscharts an den gemeinsam vorhandenen Bereich klemmen, damit klar wird, dass SOC weiter zurückreicht als Power. Konkret: unterhalb des Charts einen zweiten dezenten Hinweis „Leistungs-Historie ab HH:MM · SOC-Historie ab DD.MM." rendern (aktueller `gapHintText` deckt nur den früheren der beiden Starts ab).
   - Kein Struktur-Umbau, Achsen bleiben wie sie sind.

### B. Datenseite (Cloud-DB) – nur benennen, kein Code

Der eigentliche Grund für Punkt 2 ist die **Retention von `meter_power_readings`** in der Cloud-Instanz. Zwei Optionen zur Entscheidung (nicht Teil dieses Plans, nur Empfehlung):

- Retention der Power-Readings in der Cloud-DB auf ≥ 7 Tage anheben (mehr Speicher, mehr IO), **oder**
- Cloud bewusst als „letzte 24 h Live" behandeln und im UI-Header „Cloud-Preview – 24 h Historie" ausweisen.

Auf Hetzner ist bereits alles korrekt, dort ist nichts zu ändern.

### Technische Details

- Datei: `src/components/dashboard/EnergyFlowMonitor.tsx`
- Betroffene Blöcke: `energyBuckets` (~1471), BarChart-Render (~1780–1830), Header/Hint des Leistungscharts (~1625–1668).
- Keine DB-Migration, keine Änderungen an Edge Functions, keine Änderungen am Hetzner-Frontend nötig.

### Nicht im Scope

- Ändern der Retention-Policy in der Cloud-DB (separate Entscheidung).
- Umbau der SOC-Persistenz oder des `storage_soc_readings`-Schemas.
- Änderungen an der Hetzner-Instanz.
