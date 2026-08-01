# PV-Stundenwerte: Ursache des Einbruchs ab 15 Uhr und exakte Berechnung

## Was tatsächlich passiert (verifiziert an den Daten)

Die Stundenwerte sind **nicht** geschätzt — sie beruhen auf Messdaten. Das Problem ist die **Lückenfüllung** aus dem Loxone-Statistikspeicher.

Zähler „Erzeugung" (AICONO Zentrale), 1. Aug. 2026, 5-Minuten-Buckets:

```text
15:00–15:35   je 12 Buckets/Stunde, 29–30 Samples   Quelle bridge_ws   (Live, vollständig)
15:40–19:10   NUR 7 Buckets in 3,5 Stunden, je 1 Sample   Quelle gateway_backfill
19:15–21:00   wieder 12 Buckets/Stunde                Quelle bridge_ws
```

In der Lücke (Worker-Ausfall) hat der Backfill die Loxone-Statistik geholt. Loxone speichert dort nur **alle 30 Minuten** einen Wert. Dieser eine Wert wird als ein 5-Minuten-Bucket abgelegt. Die Auswertung rechnet aber jeden Bucket als 5 Minuten Energie:

- real: 30 Minuten mit ca. 116 kW = ca. 58 kWh
- gebucht: 5 Minuten mit 116 kW = ca. 9,7 kWh

Deshalb brechen genau die Stunden 16, 17, 18 auf ca. 12–19 kWh ein statt ca. 100 kWh. **Fünf Sechstel der Energie dieser Stunden fehlen.**

Zweiter, verstärkender Effekt: Weil die Tagessumme (856 kWh, autoritativ aus dem Zählerstand und korrekt) nicht zur Summe der Stunden passt, skaliert `scaleHourlyToTotal` in `src/lib/pvActuals.ts` **alle** Stunden proportional hoch. Damit wird das Defizit der Lückenstunden über den ganzen Tag verschmiert — auch die vollständig gemessenen Vormittagsstunden weichen dadurch von der Loxone-App ab.

## Ziel

Stundenwerte, die exakt den Loxone-Stundenwerten entsprechen, ohne Verschmieren.

## Vorgehen

**Schritt 1 — Backfill: Dauer eines Statistik-Samples korrekt abbilden**
In `supabase/functions/loxone-api/index.ts` (Aktion `backfillRange`) den Abstand zwischen zwei Statistik-Einträgen messen und den Wert über die tatsächliche Dauer halten: ein 30-Minuten-Sample erzeugt 6 aufeinanderfolgende 5-Minuten-Buckets mit demselben `power_avg` (Step-Hold), statt einem einzelnen Bucket. `source` bleibt `gateway_backfill`, `sample_count` markiert die Herkunft. Damit stimmt die Energie pro Stunde ohne jede Skalierung.

**Schritt 2 — Exakte Zahlen aus dem Zählerstand statt aus Leistung**
Zusätzlich beim Backfill die Statistik des kumulativen Zählerstands (kWh-Total) des PV-Blocks lesen und daraus die Stundenenergie als Differenz zweier Zählerstände berechnen. Das ist genau die Rechnung der Loxone-App und damit die exakte Zahl, unabhängig von Abtastraten. Diese Werte landen in `pv_actual_hourly` und haben beim Lesen Vorrang vor der aus Leistung integrierten Reihe.

**Schritt 3 — Lesepfad: nicht mehr verschmieren**
In `src/lib/pvActuals.ts`:
- Deckungsgrad je Stunde ermitteln (abgedeckte Minuten aus Buckets und Auflösung).
- Hochskalieren auf die Tagessumme nur noch auf Stunden mit **unvollständiger** Deckung anwenden, vollständig gemessene Stunden bleiben unangetastet.
- Fehlt Deckung ganz, wird die Stunde als „unvollständig" gekennzeichnet statt still hochgerechnet.

**Schritt 4 — Rückwirkende Korrektur des 1. August**
Backfill für 15:35–19:15 Uhr mit der neuen Logik erneut laufen lassen (die sieben Einzel-Buckets werden ersetzt), danach `refresh_meter_period_totals_5min` und `refresh_meter_daily_totals` für den 1.8. Kontrolle: Summe der Stundenwerte = 856 kWh ohne Skalierungsfaktor, Stunden 16–18 wieder bei ca. 90–110 kWh.

**Schritt 5 — Verifikation**
Stundenwerte aus der Datenbank gegen die Loxone-App für den 1.8. gegenprüfen und das PV-Widget im Preview kontrollieren.

## Technische Notiz

Nichts an der Live-Schreibseite ändert sich (5-Minuten-Buckets über `bridge_ws` bleiben unverändert). Betroffen sind nur der Backfill-Pfad und die Leseaggregation. Die Abweichung zur Prognose in den Lückenstunden ist eine reine Folge der fehlenden Deckung, kein Prognosefehler.
