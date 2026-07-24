# Warum Wasser spikt, Gas aber nicht

## Kurzantwort (bestätigt durch Codeprüfung + DB-Check)

Die Hardware ist gleich (Shelly-Pulse → Miniserver), aber in Loxone sind Gas und Wasser **unterschiedlich modelliert** — und der `loxone-ws-worker` klassifiziert die States dieser beiden Block-Typen unterschiedlich.

### Was der Worker macht (`docs/loxone-ws-worker/index.ts`, Zeile ~598–655)

Für jeden Meter-Block liest er aus `LoxAPP3.json` alle `states` und mappt sie über Regex auf Rollen:

```text
today  → EnergyToday / Today / Daily / Tagesverbrauch / Cd
month  → EnergyMonth / …
year   → EnergyYear / …
total  → EnergyTotal / Total / TotalEnergy / Zaehlerstand / Meter / Mr
pwr    → Pwr / Power / CurrentPower / Actual / ActualPower / Value / P / Cp / …
```

Nur Einträge mit `role="pwr"` landen später als Momentanleistung in `meter_power_readings(_5min)` (Zeile 503). Alle anderen Rollen werden getrennt als Energiestände geschrieben.

### Der entscheidende Unterschied Gas ↔ Wasser

- **Gaszähler** in Loxone ist typischerweise als *Energie-Meter* mit **kWh-Bewertung pro Impuls** angelegt (`source_unit_power = "kW"` in der DB bestätigt das für alle 5 Gaszähler dieses Tenants). Der Loxone-Block liefert dadurch einen echten `Pwr`-State (aktuelle Leistung in kW) **und** einen `Total`-State — der Worker mappt sauber `Pwr → pwr` und `Total → total`. Die pwr-Werte sind kleine, sinnvolle Zahlen.

- **Wasserzähler „Hausanschluss"** hat in der DB `source_unit_power = "m³"` (nicht "kW") — d. h. der Loxone-Meter-Block ist als reiner **Impuls-/Zählerstands-Block ohne echten Momentanwert** konfiguriert. Er exponiert entweder gar keinen `Pwr`, oder er exponiert einen State namens `Actual`/`Value`, der aber tatsächlich den kumulativen Zählerstand (m³) enthält.
  Die aktuelle Regex für `pwr` schluckt `Actual` und `Value` — dadurch wird der **Zählerstand als Leistung** interpretiert und geschrieben → 660 kW/m³ Spikes.

- Der zweite Wasserzähler „Wasserimpuls_01" (source_unit_power `kW`, aktuell konstant 0) zeigt, dass es auch Wasser-Blöcke mit echtem Pwr gibt — nur der Hausanschluss-Block ist unglücklich modelliert.

Gas erwischt es nicht, weil dort ein echtes `Pwr` existiert und die Regex-Reihenfolge irrelevant wird — beim Wasser-Hausanschluss ist `Actual`/`Value` die einzige Quelle, die als „pwr" durchgeht.

### Warum das im DB-Check gerade unsichtbar ist

Die letzten 24 h in `meter_power_readings` sind aktuell sauber (max 0,95 für Wasser Hausanschluss). Das passt: die Spikes traten **während der WS-Bridge-Phase** auf und wurden durch das vorherige Cleanup + den Notfall-Pause-Guard entfernt. Sobald die WS-Bridge wieder pusht (v1.6/1.7), kommen sie ohne den unten geplanten Fix zurück.

---

## Plan zur endgültigen Behebung

### 1. Worker-Klassifizierung härten (`docs/loxone-ws-worker/index.ts`)

- `pwr`-Regex **entschärfen**: `Actual` und `Value` **nicht** mehr als pwr akzeptieren, wenn parallel im selben Block ein `Total`/`Meter`/`Zaehlerstand`-State existiert und **kein** eindeutiger `Pwr`/`Power`/`CurrentPower`-State vorhanden ist.
- Neue Regel: wenn ein Block **nur** ambivalente Keys (`Actual`, `Value`, `P`) und **einen** Total-State hat, wird der Block als *Total-only* geführt (kein pwr-Sub). Der Worker berechnet dann optional selbst den Durchfluss aus Δ(Total)/Δt für die 5-Min-Aggregation (positiv, keine Spikes durch kumulativen Zählerstand als Momentanwert).
- Fallback-Zweig (Zeile 649) analog absichern: wenn nur die Block-UUID selbst als „pwr" verwendet wird, aber der Meter-Typ `wasser`/`gas` ist und `source_unit_power` nicht `kW`/`W` ist → nicht als pwr subscriben.

### 2. Ingest-Guard als zweite Verteidigungslinie (`supabase/functions/gateway-ingest/index.ts`)

- In `handleBridgePower5min` (und im Direkt-Reading-Handler) für Meter mit `energy_type in ('wasser','gas')` und `source_unit_power ∈ (null,'m³','L')`: Werte, deren Betrag den vom Typ plausiblen Maximaldurchfluss (Wasser 2 m³/h, Gas 20 kW) **um Faktor > 10** übersteigt, verwerfen und einmalig als `integration_error` melden.
- So bleibt ein falsch modellierter Loxone-Block auch bei künftigen Kunden ohne Spikes im Chart.

### 3. Bestandsdaten prüfen (kein Cleanup nötig, wenn schon leer)

- Ein Query auf `meter_power_readings_5min` der letzten 30 Tage für die betroffenen Wasser-Meter (Wert > 50 kW/m³) — falls Reste vorhanden, punktuell löschen. Aktueller Check der letzten 24 h in `meter_power_readings` ist sauber.

### 4. UI/Zählerkonfiguration transparent machen (klein)

- In der Zähler-Detailansicht warnen, wenn `energy_type = wasser|gas` UND `source_unit_power` nicht auf ein Fluss-/Leistungs-Feld deutet — als Hinweis, dass der Loxone-Block einen Pwr-State bereitstellen sollte.

### 5. Kein Änderungsbedarf an EnergyChart / CustomWidget

Die kürzlich umgestellte Interpolation bleibt korrekt; sie war nie die Ursache der 660-kW-Spitzen.

## Technische Details (Referenzen)

- Klassifizierung: `docs/loxone-ws-worker/index.ts` Zeilen ~598–655
- Nur pwr wird als Momentanleistung geschrieben: Zeile 503
- Fallback (Block-UUID als pwr): Zeile 649
- DB-Belege für unterschiedliche `source_unit_power` je Meter im `meters`-Table (Wasser Hausanschluss = `m³`, alle Gas-Meter = `kW`).

## Reihenfolge / Aufwand

1. Ingest-Guard (klein, sofort wirksam, ~30 min)
2. Worker v1.9 (Klassifizierung + Total-only-Modus, ~1–2 h, Rollout auf Bridge-VM)
3. UI-Hinweis (klein, ~20 min)
