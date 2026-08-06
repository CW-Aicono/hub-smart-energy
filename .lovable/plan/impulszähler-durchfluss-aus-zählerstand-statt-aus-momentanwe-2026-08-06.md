# Impulszähler: Durchfluss aus Zählerstand statt aus Momentanwert

## Befund (in der Datenbank geprüft)

Der dunkelblaue Verlauf im Screenshot ist der Gaszähler „Gaszähler Hausanschluss". Für heute liegen in `meter_power_readings_5min` durchgehende Werte aus der Quelle `bridge_ws` mit `sample_count = 300`, die zwischen 07:30 und 08:00 UTC gleichmäßig von 0,315 auf 0,276 m³/h fallen — genau die abklingende Kurve aus dem Bild (× Brennwertfaktor ergibt die ~3 kW am rechten Ende).

Parallel dazu zeigt der echte Zählerstand (`meter_cumulative_readings`, alle 15 Minuten) für denselben Zähler in 12 Stunden einen Zuwachs von **0,30 m³** — also im Mittel rund 0,025 m³/h. Der angezeigte Momentanwert liegt damit um mehr als den Faktor 10 zu hoch.

Ursache ist die Loxone-Rechnung beim Impulszähler: Der Miniserver bildet den Momentandurchfluss als „Volumen pro Impuls ÷ Zeit seit letztem Impuls". Kommt ein Impuls, springt der Wert schlagartig hoch (die Nadeln um 5:00, 5:50 und 6:20) und fällt danach hyperbolisch ab, solange kein neuer Impuls folgt (die Abklingkurve 6:40–9:55). Der Wert beschreibt also nicht den Durchfluss, sondern nur den Abstand zum letzten Impuls. Bei kleinen Verbräuchen ist er systematisch falsch.

## Lösung

Für Impulszähler wird der Verlauf nicht mehr aus dem Momentanwert gebildet, sondern aus dem **Zuwachs des Zählerstands je Zeitfenster** — das ist die physikalisch korrekte mittlere Durchflussmenge und genau das, was die Tages-/Wochensummen ohnehin nutzen (deshalb stimmen die Summen heute schon, nur der Verlauf nicht).

1. **Neues Zählerfeld „Impulszähler"** (`is_pulse_meter`) plus optional „Volumen je Impuls" in der Zählerverwaltung. Vorbelegung: an für Gas/Wasser mit Quelleinheit m³/h, wenn ein Zählerstand vorliegt.
2. **Worker (Loxone WS, neue Version)**: Bei einem als Impulszähler markierten Zähler werden aus dem Momentanwert **keine** 5-Minuten-Buckets mehr geschrieben. Stattdessen wird der Zählerstand (Rolle `total`) beim Bucket-Wechsel ausgewertet: `Durchfluss = (Stand_Ende − Stand_Start) / Bucketdauer`. Ohne Zuwachs im Bucket wird 0 geschrieben — kein Abklingen mehr.
3. **Serverseitige Rückfallebene** in `gateway-ingest` / `loxone-api`: Liefert ein Impulszähler nur Zählerstände (heute alle 15 Minuten), werden die Zwischen-Buckets gleichmäßig aus dem 15-Minuten-Zuwachs gefüllt (Treppenstufe statt Nadel). So bleibt die Kurve auch dann korrekt, wenn der Worker keinen feineren Takt bekommt.
4. **Live-Kachel „Aktuelle Werte"**: zeigt für Impulszähler den mittleren Durchfluss der letzten abgeschlossenen Periode statt des springenden Momentanwerts, mit Hinweis „Mittelwert (Impulszähler)". Damit verschwinden auch die 17-fachen Ausreißer in der Kachel.
5. **Altdaten**: einmalige Bereinigung — für die betroffenen Gas-/Wasserzähler werden die aus dem Momentanwert entstandenen 5-Minuten-Buckets der letzten 30 Tage aus den Zählerständen neu berechnet; anschließend Neuberechnung der betroffenen Perioden-Summen.

## Zusätzlich: Empfehlung an der Quelle (Miniserver)

Die saubere Variante ist, den Miniserver gar nicht erst den Momentanwert liefern zu lassen:

- **Impulswertigkeit korrekt hinterlegen** (z. B. 10 Impulse = 1 m³ → 0,1 m³ je Impuls) — sorgt für einen korrekten Zählerstand.
- **Nur den Ausgang „Zählerstand" (m³) mappen**, den Ausgang „aktueller Verbrauch" (m³/h) bei Impulszählern nicht zuordnen. Der Momentanwert ist bei Impulszählern prinzipbedingt „Volumen ÷ Zeit seit letztem Impuls" und damit für Verlaufsgrafiken unbrauchbar.
- Soll der Momentanwert dennoch übertragen werden, muss er im Miniserver über ein festes Zeitfenster gemittelt werden (z. B. 15-Minuten-Mittelwert).

Umsetzung im Produkt: In der State-Zuordnung (Super-Admin) und in der Zählerverwaltung wird bei Gas/Wasser mit Quelleinheit m³/h ein **Hinweis-Badge „Impulszähler: bitte Zählerstand mappen"** angezeigt, inklusive Kurzanleitung. Ergänzung dieser Empfehlung in `docs/loxone-state-zuordnung.md`. Die Backend-Logik oben bleibt trotzdem nötig, damit bereits verbaute, anders konfigurierte Anlagen korrekte Kurven zeigen.



## Was sich für dich sichtbar ändert

- Der Gas-/Wasserverlauf zeigt flache Stufen in Höhe des tatsächlichen Verbrauchs statt Nadeln mit Abklingkurve.
- Tages-, Wochen- und Monatssummen bleiben unverändert (sie waren bereits korrekt).
- In der Zählerverwaltung gibt es einen neuen Schalter „Impulszähler" je Zähler.

## Technische Details

- Migration: `meters.is_pulse_meter boolean default false`, `meters.volume_per_pulse numeric null`; Backfill für Gas/Wasser mit `source_unit_power = 'm³/h'`.
- `docs/loxone-ws-worker/index.ts`: neue Rollenbehandlung — bei `is_pulse_meter` wird `momentary_role` ignoriert und der Bucket aus der `total`-Rolle differenziert; neue Worker-Version + Update-Anleitung unter `docs/loxone-ws-worker/`.
- `supabase/functions/loxone-api/index.ts`: Backfill/Pull schreibt für Impulszähler ausschließlich aus Zählerstandsdifferenzen (Step-Hold über die Lücke), nie aus dem Momentanwert.
- Frontend: `LiveValues.tsx` und die Zähler-Detailkachel nutzen für Impulszähler den Periodenmittelwert (`useMeterPeriodTotals`); Einheitenlogik in `src/lib/formatEnergy.ts` bleibt unverändert.
- Bereinigungs-Migration für `meter_power_readings_5min` (Quelle `bridge_ws`, betroffene Zähler, 30 Tage) inkl. Neuberechnung von `meter_period_totals`.
