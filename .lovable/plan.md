

# Korrektur: Negative Leistungswerte für bidirektionale Zähler

## Problemanalyse

### Ursache bestätigt durch Logs und DB-Daten

Der Loxone Miniserver liefert den `Pf`-State **bereits mit korrektem Vorzeichen**:
- **Positiv** = Netzbezug (Verbrauch)
- **Negativ** = Einspeisung (Erzeugung > Verbrauch)

**Beweis aus den Edge Function Logs** (13:55:23 UTC):
```
Pf = -97.056  ← Loxone liefert negativ (Einspeisung)
```

**In der Datenbank** steht zum selben Zeitpunkt (13:55:24 UTC):
```
power_value = +97.056  ← Vorzeichen wurde entfernt!
```

### Warum das Vorzeichen verloren geht

Im Commit `910ad08` ("Preserved sign in gateways") wurde der Code in `loxone-api/index.ts` bereits korrigiert:
- **Vorher**: `power_value: absVal` (= `Math.abs(powerVal)`) → Vorzeichen entfernt
- **Nachher**: `power_value: powerVal` → Vorzeichen erhalten

**Das Problem**: Die Edge Function wurde nach diesem Commit **nicht neu deployed**. Die aktuell laufende Version verwendet immer noch `Math.abs()`, weshalb alle Werte positiv gespeichert werden.

---

## Umsetzung

### Schritt 1: Edge Function `loxone-api` deployen

Die korrigierte Version ist bereits im Code vorhanden (Zeile 748: `power_value: powerVal`). Es muss lediglich ein **Re-Deployment** der Edge Function erfolgen. Danach werden neue Messwerte mit dem korrekten Vorzeichen gespeichert.

### Schritt 2: Ganztages-Fallback im CustomWidget verbessern

**Datei:** `src/components/dashboard/CustomWidget.tsx`

Die Tagesansicht zeigt nur Daten von 0:00–1:00 Uhr, weil die 5-Minuten-Aggregate (`meter_power_readings_5min`) für den heutigen Tag noch nicht berechnet wurden. Das aktuelle Fallback-Fenster von 10 Minuten reicht nicht aus.

**Änderung:** Das Fallback-Fenster wird auf den **gesamten heutigen Tag** erweitert:
- Falls die RPC `get_power_readings_5min` keine oder nur wenige Daten liefert, werden die Rohdaten aus `meter_power_readings` für den ganzen Tag abgerufen
- Diese werden clientseitig in 5-Minuten-Buckets aggregiert (Durchschnitt pro Bucket)
- Ergebnis: Lückenloser Graph von 0:00 bis zur aktuellen Uhrzeit

### Schritt 3: Y-Achse für negative Werte anpassen

**Datei:** `src/components/dashboard/CustomWidget.tsx`

Sobald negative Werte in der DB vorhanden sind, muss die Y-Achse automatisch ins Negative skalieren. Die bestehende `yDomain`-Logik erkennt dies bereits teilweise, aber die Bedingung muss robuster werden:
- Wenn `chartData` negative Werte enthält, wird `yDomain[0]` auf `"auto"` gesetzt (statt auf einen konfigurierten `min`-Wert ≥ 0)

---

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `supabase/functions/loxone-api/index.ts` | **Nur Deployment** — Code ist bereits korrekt |
| `src/components/dashboard/CustomWidget.tsx` | Fallback-Fenster erweitern + Y-Achsen-Logik härten |

## Hinweise

- **Historische Daten**: Alle bisherigen Einträge bleiben positiv. Nur neue Messwerte erhalten das korrekte Vorzeichen. Eine Rückwärts-Korrektur per Migration wäre optional möglich, ist aber für die aktuelle Darstellung nicht zwingend nötig.
- **Andere Zähler**: Nur Zähler, die tatsächlich einspeisen (negativer `Pf`-Wert vom Miniserver), erhalten negative Werte. Reine Verbrauchszähler sind nicht betroffen.
- **Live-Werte-Seite**: Die `rawValue`-Eigenschaft in der Sensor-Antwort enthält ebenfalls den originalen (negativen) Wert, da dieser direkt aus `stateData.value` abgeleitet wird (Zeile 593). Dies wird nach dem Deployment automatisch korrekt sein.

